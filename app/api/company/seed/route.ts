import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Manual trigger for the market-seeding cron jobs. The same Edge Functions that
// pg_cron runs on a schedule, fired on demand from the Company → Pipeline tab.
// Admin only — these spend API budget and create markets.
const JOBS: Record<string, string> = {
  'seed-rss-markets':     'seed-rss-markets',
  'seed-sports-markets':  'seed-sports-markets',
  'seed-finance-markets': 'seed-finance-markets',
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

  try {
    const res = await fetch(`${baseUrl}/functions/v1/${JOBS[job]}`, {
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
    return NextResponse.json({
      ok:       true,
      inserted: data.inserted ?? 0,
      skipped:  data.skipped ?? 0,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Seed run failed' },
      { status: 502 },
    )
  }
}
