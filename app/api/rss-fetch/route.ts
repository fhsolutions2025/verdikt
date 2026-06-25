import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_FEEDS: Record<string, { label: string; url: string }> = {
  'google-news': {
    label: 'Google News',
    url:   'https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en',
  },
  'bbc': {
    label: 'BBC World',
    url:   'https://feeds.bbci.co.uk/news/world/rss.xml',
  },
  'al-jazeera': {
    label: 'Al Jazeera',
    url:   'https://www.aljazeera.com/xml/rss/all.xml',
  },
  'reuters': {
    label: 'Reuters',
    url:   'https://feeds.reuters.com/reuters/worldNews',
  },
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g,  '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

function extractTag(xml: string, tag: string): string {
  // Handles CDATA, attributes on the tag, nested HTML
  const re = new RegExp(
    `<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`,
    'i',
  )
  const m = xml.match(re)
  if (!m) return ''
  return decodeEntities(m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, 'i')
  const m = xml.match(re)
  return m ? decodeEntities(m[1]) : ''
}

interface RssItem {
  title:       string
  description: string
  pubDate:     string
  link:        string
  source:      string
}

function parseItems(xml: string): RssItem[] {
  const items: RssItem[] = []
  const re = /<item>([\s\S]*?)<\/item>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const block = m[1]!
    const rawTitle = extractTag(block, 'title')
    if (!rawTitle) continue

    // Google News appends " - Source Name" to titles — strip it
    const title = rawTitle.replace(/\s[-–]\s[^-–]+$/, '').trim()

    // Extract source name from <source url="...">Name</source>
    const source = extractTag(block, 'source') || extractAttr(block, 'source', 'url').replace(/^https?:\/\//, '').split('/')[0]!

    items.push({
      title,
      description: extractTag(block, 'description').slice(0, 400),
      pubDate:     extractTag(block, 'pubDate'),
      link:        extractTag(block, 'link') || extractTag(block, 'guid'),
      source,
    })
  }
  return items
}

export async function GET(req: NextRequest) {
  // ── Auth: admin only ──────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Validate feed param ───────────────────────────────────────
  const feedId = req.nextUrl.searchParams.get('feed') ?? 'google-news'
  const feed   = ALLOWED_FEEDS[feedId]
  if (!feed) {
    return NextResponse.json({ error: 'Unknown feed' }, { status: 400 })
  }

  // ── Fetch RSS ─────────────────────────────────────────────────
  try {
    const res = await fetch(feed.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Verdikt/1.0; +https://verdikt.io)',
        'Accept':     'application/rss+xml, application/xml, text/xml, */*',
      },
      signal: AbortSignal.timeout(8000),
      // Don't follow redirects to untrusted hosts
      redirect: 'follow',
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `Feed returned HTTP ${res.status}` },
        { status: 502 },
      )
    }

    const xml   = await res.text()
    const items = parseItems(xml).slice(0, 25)

    return NextResponse.json({ items, feed: feed.label })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
