import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  // ── Auth: verify admin via user session ───────────────────────
  const userSupabase = await createClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = await createServiceClient()

  // ── Parse and validate body ───────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const question         = String(body.question          ?? '').trim()
  const yes_price_raw    = Number(body.yes_price)
  const closes_at        = String(body.closes_at         ?? '')
  const resolution_source = String(body.resolution_source ?? 'Public record').slice(0, 300)
  const ai_confidence_raw = Number(body.ai_confidence)

  if (!question)           return NextResponse.json({ error: 'Missing question' },  { status: 400 })
  if (!closes_at)          return NextResponse.json({ error: 'Missing closes_at' }, { status: 400 })
  if (isNaN(new Date(closes_at).getTime())) {
    return NextResponse.json({ error: 'Invalid closes_at' }, { status: 400 })
  }

  const yes_price    = Math.min(Math.max(Math.round(yes_price_raw),    5),  95)
  const ai_confidence = Math.min(Math.max(Math.round(ai_confidence_raw), 40), 95)

  // ── Deduplication: reject if a very similar question exists ──
  const { data: existing } = await userSupabase
    .from('markets')
    .select('question')
    .eq('category', 'current_affairs')
    .in('status', ['live', 'ai_ready', 'pending_ai', 'pending_mm_review'])
    .limit(200)

  const qWords = new Set(
    question.toLowerCase().split(/\W+/).filter(w => w.length > 4),
  )
  for (const row of existing ?? []) {
    const eWords = row.question.toLowerCase().split(/\W+/).filter((w: string) => w.length > 4)
    const overlap = eWords.filter((w: string) => qWords.has(w)).length
    if (overlap >= 5) {
      return NextResponse.json(
        { error: 'A very similar market already exists. Edit the question and try again.' },
        { status: 409 },
      )
    }
  }

  // ── Insert using service role (bypasses RLS) ──────────────────
  const { data, error } = await service
    .from('markets')
    .insert({
      question,
      category:          'current_affairs',
      fee_category:      'current_affairs',
      yes_price,
      // no_price is GENERATED ALWAYS AS (100 - yes_price) — never insert it
      spread_cents:      2,
      ai_confidence,
      status:            'pending_ai',
      creator_type:      'ai_system',
      resolution_source,
      closes_at,
      volume:            0,
    })
    .select('id, question, status')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, market: data }, { status: 201 })
}
