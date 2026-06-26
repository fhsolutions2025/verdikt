import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// "Explain my period" — on-demand wallet coaching from Vega.
//
// The client sends only pre-aggregated figures (no raw transactions), so this is
// cheap and leaks nothing beyond the numbers already on screen. Vega turns them
// into a short, plain-English review: what drove the result and one concrete
// suggestion. Demo play-money — framed as education, never financial advice.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* no body */ }

  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
  const period   = typeof body.period === 'string' ? body.period : 'this period'
  const figures  = {
    balance:   num(body.balance),
    change:    num(body.change),
    changePct: num(body.changePct),
    volume:    num(body.volume),
    netPnl:    num(body.netPnl),
    gains:     num(body.gains),
    fees:      num(body.fees),
    deposited: num(body.deposited),
  }
  const best  = body.bestDay  as { day?: string; pnl?: number } | null
  const worst = body.worstDay as { day?: string; pnl?: number } | null

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key     = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!baseUrl || !key) {
    return NextResponse.json({ error: 'Server not configured for insights.' }, { status: 503 })
  }

  const prompt = [
    'You are Vega, a calm, numerate trading coach inside a play-money prediction-market app.',
    `Review the player's wallet over the ${period} and write a SHORT plain-English summary.`,
    '',
    'Figures (currency units):',
    `- Balance now: ${figures.balance.toFixed(2)}`,
    `- Change over period: ${figures.change.toFixed(2)} (${figures.changePct.toFixed(1)}%)`,
    `- Volume traded: ${figures.volume.toFixed(2)}`,
    `- Net trading P&L: ${figures.netPnl.toFixed(2)}`,
    `- Gross trading gains: ${figures.gains.toFixed(2)}`,
    `- Fees paid: ${figures.fees.toFixed(2)}`,
    `- Capital deposited this period: ${figures.deposited.toFixed(2)}`,
    best?.day  ? `- Best day: ${best.day} (${Number(best.pnl).toFixed(2)})`   : '',
    worst?.day ? `- Worst day: ${worst.day} (${Number(worst.pnl).toFixed(2)})` : '',
    '',
    'Rules:',
    '- 2–3 sentences, max ~60 words. No markdown, no headings, no bullet points.',
    '- Lead with whether they are up or down and the single biggest driver.',
    '- End with ONE concrete, specific suggestion (e.g. fee drag, position sizing, win-rate).',
    '- Plain language. This is education, not financial advice; do not add disclaimers.',
  ].filter(Boolean).join('\n')

  try {
    const res = await fetch(`${baseUrl}/functions/v1/anthropic-proxy`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 220,
        temperature: 0.5,
        system:     'You are a concise, encouraging trading coach. You output 2-3 sentences of plain prose with no markdown.',
        messages:   [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Vega could not be reached.' }, { status: 502 })
    }

    const data = await res.json()
    const text: string = (data.content?.[0]?.text ?? '').trim()
    if (!text) {
      return NextResponse.json({ error: 'Vega returned an empty answer.' }, { status: 502 })
    }

    return NextResponse.json({ text })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Insight generation failed.' },
      { status: 502 },
    )
  }
}
