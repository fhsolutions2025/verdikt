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
    const entries: number = mine?.entries ?? 0
    const exits:   number = mine?.exits   ?? 0

    // When nothing was entered, fetch the last log action to explain why
    let note: string | null = null
    if (entries === 0) {
      const { data: lastLog } = await supabase
        .from('autonomous_trade_log')
        .select('action, rationale')
        .eq('player_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (lastLog) {
        if (lastLog.action === 'circuit_breaker') {
          note = lastLog.rationale ?? 'Circuit breaker active — new entries paused.'
        } else if (lastLog.action === 'belief_failure') {
          note = 'AI returned no forecasts for available markets.'
        } else if (lastLog.action === 'error') {
          note = 'Last trade attempt hit an execution error — check activity.'
        } else {
          note = 'No markets cleared the edge threshold right now.'
        }
      } else {
        note = 'No qualifying markets found in your allowed categories.'
      }
    }

    return NextResponse.json({ ok: true, entries, exits, note })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Run failed' },
      { status: 502 },
    )
  }
}
