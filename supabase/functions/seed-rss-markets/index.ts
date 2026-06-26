// seed-rss-markets — Edge Function
// Fetches BBC / Al Jazeera / Reuters RSS feeds, calls Haiku via anthropic-proxy
// to convert newsworthy headlines into binary prediction markets.
// Inserts as pending_ai for the standard BYV review flow.
// Writes a cron_run_log row after each run for pipeline observability.
// Scheduled every 15 minutes (migration 0020).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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
  source_feed: string
}

interface MarketDraft {
  question:          string
  yes_price:         number
  ai_confidence:     number
  resolution_source: string
  closes_at:         string
  viable:            boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(
    `<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`,
    'i',
  )
  const m = xml.match(re)
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : ''
}

function parseRssItems(xml: string, source_feed: string): RssItem[] {
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
      source_feed,
    })
  }
  return items
}

async function safeFetch(url: string, options: RequestInit = {}, timeoutMs = 10_000): Promise<Response | null> {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
  } catch {
    return null
  }
}

// Route Anthropic calls through the proxy — key lives in Supabase secrets only
async function callAnthropicProxy(body: Record<string, unknown>): Promise<Response | null> {
  return safeFetch(
    `${SUPABASE_URL}/functions/v1/anthropic-proxy`,
    {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(body),
    },
    30_000,
  )
}

async function fetchRssItems(feed: { name: string; url: string }): Promise<RssItem[]> {
  const res = await safeFetch(feed.url)
  if (!res?.ok) return []
  const xml = await res.text()
  return parseRssItems(xml, feed.name).slice(0, 10)
}

// ── Market generation ────────────────────────────────────────────────────────

async function generateMarket(item: RssItem): Promise<MarketDraft | null> {
  const today    = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const minClose = new Date(Date.now() +  3 * 86_400_000).toISOString().slice(0, 10)
  const maxClose = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10)

  const userPrompt = `=== BEGIN NEWS INPUT ===
HEADLINE: ${item.title}
CONTEXT: ${item.description.slice(0, 300)}
=== END NEWS INPUT ===

Today's date: ${todayStr}

Generate a binary YES/NO prediction market from the headline above.

CRITICAL — closes_at: Set it to the date when THIS SPECIFIC outcome will be publicly known.
  • Sports match / tournament result → day of the match or the day after
  • Election / vote → the day results are announced
  • Economic data release → next scheduled release date
  • Sanctions / diplomatic event → 2–4 weeks (impacts show quickly)
  • Humanitarian / crisis → 3–6 weeks
  • Do NOT default to months away — anchor to the actual event
  • closes_at MUST be between ${minClose} and ${maxClose}

The predicted outcome must be a direct, verifiable consequence of the headline event.
If the headline is historical, an opinion, a soft feature, or produces no meaningful binary prediction, return {"viable":false}.

Otherwise return exactly this JSON (no other text, no markdown):
{
  "viable": true,
  "question": "Will [specific measurable thing] happen by [Day Month YYYY]?",
  "yes_price": <integer 5-95>,
  "closes_at": "YYYY-MM-DD",
  "resolution_source": "<how outcome is publicly verified>",
  "ai_confidence": <integer 40-95>
}`

  let body: string
  try {
    const res = await callAnthropicProxy({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system:     'You are a JSON-only API that creates binary prediction markets. Output raw JSON only — no markdown fences, no explanation. First character must be {.',
      messages:   [{ role: 'user', content: userPrompt }],
    })
    if (!res?.ok) return null
    const data = await res.json()
    body = data.content?.[0]?.text ?? ''
  } catch {
    return null
  }

  body = body.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const braceIdx = body.indexOf('{')
  if (braceIdx > 0) body = body.slice(braceIdx)
  const lastBrace = body.lastIndexOf('}')
  if (lastBrace >= 0) body = body.slice(0, lastBrace + 1)

  try {
    const draft = JSON.parse(body) as MarketDraft
    if (!draft.viable) return null
    if (!draft.question || !draft.closes_at) return null

    // Clamp closes_at to allowed window
    const raw = draft.closes_at
    draft.closes_at = raw < minClose ? minClose : raw > maxClose ? maxClose : raw

    const yes = Math.min(Math.max(Math.round(draft.yes_price ?? 50), 5), 95)
    return { ...draft, yes_price: yes }
  } catch {
    return null
  }
}

// ── Deduplication ────────────────────────────────────────────────────────────

function keywordsOf(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/\W+/).filter(w => w.length > 4))
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
  const runStart = new Date()
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Load enabled RSS sources
  const { data: sources } = await supabase
    .from('api_sources')
    .select('name, enabled')
    .eq('category', 'news')

  const enabledNames  = new Set((sources ?? []).filter(s => s.enabled).map(s => s.name))
  const activeFeeds   = RSS_FEEDS.filter(f => enabledNames.has(f.name))

  if (activeFeeds.length === 0) {
    await supabase.from('cron_run_log').insert({
      job_name: 'seed-rss-markets', started_at: runStart.toISOString(),
      feeds_active: 0, headlines_fetched: 0, viable_count: 0,
      inserted_count: 0, skipped_count: 0,
      duration_ms: Date.now() - runStart.getTime(),
    })
    return new Response(JSON.stringify({ ok: true, message: 'All RSS sources disabled' }), { status: 200 })
  }

  // Load existing questions for deduplication
  const { data: existingMarkets } = await supabase
    .from('markets')
    .select('question')
    .in('status', ['live', 'pending_ai', 'ai_ready', 'pending_mm_review'])
    .eq('category', 'current_affairs')
    .order('created_at', { ascending: false })
    .limit(200)

  const existingQuestions = (existingMarkets ?? []).map(m => m.question)

  // Fetch all feeds and track each call in api_rate_limits
  const allItems: RssItem[] = []
  for (const feed of activeFeeds) {
    const items = await fetchRssItems(feed)
    await supabase.rpc('track_api_call', { p_api_name: feed.name })
    allItems.push(...items)
  }

  // Deduplicate at headline level
  const seen = new Set<string>()
  const candidates = allItems.filter(item => {
    const key = item.title.toLowerCase().slice(0, 60)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Filter to recent items (< 6 hours old)
  const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000
  const fresh = candidates.filter(item => {
    if (!item.pubDate) return true
    const t = new Date(item.pubDate).getTime()
    return isNaN(t) || t >= sixHoursAgo
  })

  let inserted = 0
  let skipped  = 0

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
      source_feed:       item.source_feed,
      volume:            0,
    })

    if (!error) {
      existingQuestions.push(draft.question)
      inserted++
    }
  }

  await supabase.from('cron_run_log').insert({
    job_name:          'seed-rss-markets',
    started_at:        runStart.toISOString(),
    feeds_active:      activeFeeds.length,
    headlines_fetched: allItems.length,
    viable_count:      Math.min(fresh.length, 6),
    inserted_count:    inserted,
    skipped_count:     skipped,
    duration_ms:       Date.now() - runStart.getTime(),
  })

  return new Response(
    JSON.stringify({ ok: true, inserted, skipped, candidates: fresh.length }),
    { status: 200 },
  )
})
