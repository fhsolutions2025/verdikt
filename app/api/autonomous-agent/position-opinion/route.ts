import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Per-position "Ask Vega" opinion.
//
// On demand (one LLM call per request), Vega forms a calibrated belief about a
// single market BLIND to its price — the same anti-anchoring discipline used by
// the vega-executor's Stage-1 belief pass. We return Vega's fair YES probability
// alongside the market's implied YES probability and let the CLIENT compute the
// per-side stance, because only the client knows pos.side:
//
//   YES position → fair_yes vs market_yes (yes_price)
//                  RICH  (sell favoured)  when market_yes > fair_yes
//                  CHEAP (hold favoured)  when market_yes < fair_yes
//   NO  position → invert: NO fair = 100 − fair_yes, NO market = no_price
//                  RICH  when no_price > (100 − fair_yes)
//
// |delta| <= 4 → FAIR. The route stays side-agnostic on purpose.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let market_id: string | null = null
  try {
    const body = await req.json()
    if (body?.market_id) market_id = String(body.market_id)
  } catch { /* no body */ }
  if (!market_id) return NextResponse.json({ error: 'market_id required' }, { status: 400 })

  const { data: market } = await supabase
    .from('markets')
    .select('id, question, yes_price, no_price, closes_at, category, status')
    .eq('id', market_id)
    .single()

  if (!market) return NextResponse.json({ error: 'Market not found' }, { status: 404 })

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key     = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!baseUrl || !key) {
    return NextResponse.json({ error: 'Server not configured for Vega opinions.' }, { status: 503 })
  }

  // Forecasting prompt — BLIND to the market price (no yes_price / no_price).
  const prompt = [
    'You are Vega, a calibrated forecaster for prediction markets.',
    'Estimate P(YES resolves true) for the market below as an INTEGER 0-100.',
    'Anchor FIRST on the base rate for the event class, then adjust for the specifics of this question.',
    'You are NOT told the market price, and you must not guess it — form your own honest belief.',
    '',
    `Question:  "${market.question}"`,
    `Category:  ${market.category ?? 'n/a'}`,
    `Closes at: ${market.closes_at ?? 'n/a'}`,
    '',
    'Return ONLY a JSON object (no prose, no markdown fences):',
    '{"p_yes":<integer 0-100>,"rationale":"<one sentence, base-rate anchored, max 200 chars>"}',
    'First character of your reply MUST be {.',
  ].join('\n')

  try {
    const res = await fetch(`${baseUrl}/functions/v1/anthropic-proxy`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model:       'claude-haiku-4-5-20251001',
        max_tokens:  400,
        temperature: 0.3,
        system:      'You are a disciplined, calibrated forecaster that outputs only a raw JSON object. You never see or infer market prices; you reason purely from base rates and evidence.',
        messages:    [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Vega could not be reached.' }, { status: 502 })
    }

    const data = await res.json()
    const text: string = (data.content?.[0]?.text ?? '').trim()

    // Robust parse — the model may wrap the JSON. Extract the first {...} block.
    const start = text.indexOf('{')
    const end   = text.lastIndexOf('}')
    if (start < 0 || end < 0 || end <= start) {
      return NextResponse.json({ error: 'Vega returned an unreadable answer.' }, { status: 502 })
    }

    let parsed: { p_yes?: unknown; rationale?: unknown }
    try {
      parsed = JSON.parse(text.slice(start, end + 1))
    } catch {
      return NextResponse.json({ error: 'Vega returned an unreadable answer.' }, { status: 502 })
    }

    const pRaw = Number(parsed.p_yes)
    if (!Number.isFinite(pRaw)) {
      return NextResponse.json({ error: 'Vega returned no probability.' }, { status: 502 })
    }
    const fair_yes = Math.max(0, Math.min(100, Math.round(pRaw)))
    const rationale = typeof parsed.rationale === 'string'
      ? parsed.rationale.slice(0, 200)
      : ''

    return NextResponse.json({
      fair_yes,
      market_yes: market.yes_price,
      rationale,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Vega opinion failed.' },
      { status: 502 },
    )
  }
}
