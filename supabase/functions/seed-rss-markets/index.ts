// seed-rss-markets — Edge Function
// Fetches BBC / Al Jazeera / Reuters RSS feeds, calls Haiku to convert
// newsworthy headlines into binary prediction markets, inserts them as
// pending_ai for the standard BYV review flow.
// Scheduled every 15 minutes (migration 0020).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY')!

const RSS_FEEDS = [
  { name: 'BBC RSS',        url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { name: 'Al Jazeera RSS', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { name: 'Reuters RSS',    url: 'https://feeds.reuters.com/reuters/worldNews' },
]

interface RssItem {
  title:       string
  description: string
  pubDate:     string
  link:        string
}

interface MarketDraft {
  question:          string
  category:          string
  yes_price:         number
  no_price:          number
  ai_confidence:     number
  resolution_source: string
  closes_at:         string
  viable:            boolean
}

// ── Simple RSS XML parser (no DOM dependency) ────────────────────────────────

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(
    `<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`,
    'i',
  )
  const m = xml.match(re)
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : ''
}

function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = []
  const itemRe = /<item>([\s\S]*?)<\/item>/g
  let m: RegExpExecArray | null
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1]
    const title = extractTag(block, 'title')
    if (!title) continue
    items.push({
      title,
      description: extractTag(block, 'description'),
      pubDate:     extractTag(block, 'pubDate'),
      link:        extractTag(block, 'link'),
    })
  }
  return items
}

// ── Fetch helpers ────────────────────────────────────────────────────────────

async function safeFetch(url: string, options: RequestInit = {}): Promise<Response | null> {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(5000) })
  } catch {
    return null
  }
}

async function fetchRssItems(feed: { name: string; url: string }): Promise<RssItem[]> {
  const res = await safeFetch(feed.url)
  if (!res?.ok) return []
  const xml = await res.text()
  return parseRssItems(xml).slice(0, 10) // max 10 items per feed
}

// ── Haiku market generation ──────────────────────────────────────────────────

async function generateMarket(item: RssItem): Promise<MarketDraft | null> {
  const today = new Date()
  const sixMonths = new Date(today)
  sixMonths.setMonth(sixMonths.getMonth() + 6)
  const defaultClose = sixMonths.toISOString().slice(0, 10)

  const userPrompt = `News headline: "${item.title}"
Summary: "${item.description.slice(0, 300)}"
Today's date: ${today.toISOString().slice(0, 10)}

Create a binary prediction market (YES/NO) about a verifiable future outcome related to this news. The question must:
- Be phrased as "Will X happen by [date]?"
- Have a clear, objective resolution criteria
- Close within 1–12 months from today
- NOT be about something already resolved

If the headline is not suitable for a prediction market (e.g. it's purely historical, an opinion, or a soft feature), return {"viable":false}.`

  let body: string
  try {
    const res = await safeFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: 'You are a JSON-only API that creates binary prediction markets. Output raw JSON only — no markdown, no code fences. First character must be {.',
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })
    if (!res?.ok) return null
    const data = await res.json()
    body = data.content?.[0]?.text ?? ''
  } catch {
    return null
  }

  // Strip markdown fences if Haiku wraps anyway
  body = body.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

  try {
    const draft = JSON.parse(body) as MarketDraft
    if (!draft.viable) return null
    if (!draft.question || !draft.closes_at) return null
    // Ensure yes + no sum to 100
    const yes = Math.min(Math.max(Math.round(draft.yes_price ?? 50), 5), 95)
    return {
      ...draft,
      yes_price: yes,
      no_price:  100 - yes,
      category:  'current_affairs',
    }
  } catch {
    return null
  }
}

// ── Deduplicate against existing markets ─────────────────────────────────────

function keywordsOf(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 4)
  )
}

function isTooSimilar(question: string, existing: string[]): boolean {
  const kw = keywordsOf(question)
  for (const q of existing) {
    const overlap = [...keywordsOf(q)].filter(w => kw.has(w)).length
    if (overlap >= 4) return true
  }
  return false
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Load enabled RSS sources
  const { data: sources } = await supabase
    .from('api_sources')
    .select('name, enabled')
    .eq('category', 'news')

  const enabledNames = new Set((sources ?? []).filter(s => s.enabled).map(s => s.name))
  const activeFeedrs = RSS_FEEDS.filter(f => enabledNames.has(f.name))

  if (activeFeedrs.length === 0) {
    return new Response(JSON.stringify({ ok: true, message: 'All RSS sources disabled' }), { status: 200 })
  }

  // Fetch existing live/pending questions for deduplication
  const { data: existingMarkets } = await supabase
    .from('markets')
    .select('question')
    .in('status', ['live', 'pending_ai', 'ai_ready', 'pending_mm_review'])
    .eq('category', 'current_affairs')
    .order('created_at', { ascending: false })
    .limit(200)

  const existingQuestions = (existingMarkets ?? []).map(m => m.question)

  // Collect candidate headlines from all active feeds
  const allItems: RssItem[] = []
  for (const feed of activeFeedrs) {
    const items = await fetchRssItems(feed)
    allItems.push(...items)
  }

  // Deduplicate headline level
  const seen = new Set<string>()
  const candidates = allItems.filter(item => {
    const key = item.title.toLowerCase().slice(0, 60)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Filter to recent items (< 6 hours old) when pubDate is parseable
  const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000
  const fresh = candidates.filter(item => {
    if (!item.pubDate) return true
    const t = new Date(item.pubDate).getTime()
    return isNaN(t) || t >= sixHoursAgo
  })

  let inserted = 0
  let skipped  = 0

  // Process max 6 items per run (rate-limit Haiku usage)
  for (const item of fresh.slice(0, 6)) {
    const draft = await generateMarket(item)
    if (!draft) { skipped++; continue }

    if (isTooSimilar(draft.question, existingQuestions)) { skipped++; continue }

    const { error } = await supabase.from('markets').insert({
      question:          draft.question,
      category:          'current_affairs',
      fee_category:      'current_affairs',
      yes_price:         draft.yes_price,
      spread_cents:      2,
      ai_confidence:     draft.ai_confidence ?? 70,
      status:            'pending_ai',
      creator_type:      'ai_system',
      resolution_source: draft.resolution_source ?? 'Public record',
      closes_at:         draft.closes_at,
      est_volume:        null,
      volume:            0,
    })

    if (!error) {
      existingQuestions.push(draft.question)
      inserted++
    }
  }

  return new Response(
    JSON.stringify({ ok: true, inserted, skipped, candidates: fresh.length }),
    { status: 200 },
  )
})
