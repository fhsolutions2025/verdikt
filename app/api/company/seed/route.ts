import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Manual trigger for the market-seeding cron jobs. The same Edge Functions that
// pg_cron runs on a schedule, fired on demand from the Company → Pipeline tab.
// Admin only — these spend API budget and create markets.
//
// Each job maps to its Edge Function name and the market category it produces,
// so we can read back exactly the markets this run created (with rationale) for
// the inline review panel.
const JOBS: Record<string, { fn: string; category: string }> = {
  'seed-rss-markets':     { fn: 'seed-rss-markets',     category: 'current_affairs' },
  'seed-sports-markets':  { fn: 'seed-sports-markets',  category: 'sports' },
  'seed-finance-markets': { fn: 'seed-finance-markets', category: 'finance' },
}

export async function POST(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let job: string | undefined
  try {
    const body = await req.json()
    job = body?.job
  } catch {
    /* no body */
  }

  if (!job || !JOBS[job]) {
    return NextResponse.json({ error: 'Unknown job' }, { status: 400 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key     = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!baseUrl || !key) {
    return NextResponse.json({ error: 'Server not configured for seeding.' }, { status: 503 })
  }

  const { fn, category } = JOBS[job]
  // Timestamp the run so we can read back only the markets it created. Small
  // skew cushion so a clock difference between app + DB never hides a row.
  const runStart = new Date(Date.now() - 2_000).toISOString()

  try {
    const res = await fetch(`${baseUrl}/functions/v1/${fn}`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${key}`,
      },
      signal: AbortSignal.timeout(120_000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json({ error: data.error ?? 'Seed run failed' }, { status: 502 })
    }

    // Read back the markets this run created so the company can review them
    // inline — question, suggested probability, rationale, close, source.
    let created: unknown[] = []
    try {
      const supabase = await createServiceClient()
      const { data: rows } = await supabase
        .from('markets')
        .select('id, question, yes_price, closes_at, source_feed, ai_rationale, ai_confidence, status, category')
        .eq('creator_type', 'ai_system')
        .eq('category', category)
        .gte('created_at', runStart)
        .order('created_at', { ascending: false })
        .limit(50)
      created = rows ?? []
    } catch {
      /* review list is best-effort; counts still returned */
    }

    return NextResponse.json({
      ok:       true,
      inserted: data.inserted ?? 0,
      skipped:  data.skipped ?? 0,
      created,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Seed run failed' },
      { status: 502 },
    )
  }
}
