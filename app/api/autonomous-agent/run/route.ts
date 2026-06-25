import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Manual "Run now" — triggers the vega-executor Edge Function for the
// current player only. The executor enforces all guardrails server-side.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Player must have an active Vega config
  const { data: cfg } = await supabase
    .from('autonomous_agent_configs')
    .select('is_active, last_run_at')
    .eq('player_id', user.id)
    .single()

  if (!cfg?.is_active) {
    return NextResponse.json({ error: 'Vega is not active. Enable it first.' }, { status: 400 })
  }

  // Cooldown: a manual run triggers Haiku calls + trades, so rate-limit it.
  const COOLDOWN_MS = 30_000
  if (cfg.last_run_at) {
    const elapsed = Date.now() - new Date(cfg.last_run_at).getTime()
    if (elapsed < COOLDOWN_MS) {
      const wait = Math.ceil((COOLDOWN_MS - elapsed) / 1000)
      return NextResponse.json(
        { error: `Vega ran recently. Try again in ${wait}s.` },
        { status: 429 },
      )
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key     = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!baseUrl || !key) {
    return NextResponse.json({ error: 'Server not configured for agent runs.' }, { status: 503 })
  }

  try {
    const res = await fetch(`${baseUrl}/functions/v1/vega-executor`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body:   JSON.stringify({ player_id: user.id }),
      signal: AbortSignal.timeout(55_000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json({ error: data.error ?? 'Run failed' }, { status: 502 })
    }
    const mine = (data.results ?? []).find((r: { player_id: string }) => r.player_id === user.id)
    return NextResponse.json({
      ok:      true,
      entries: mine?.entries ?? 0,
      exits:   mine?.exits ?? 0,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Run failed' },
      { status: 502 },
    )
  }
}
