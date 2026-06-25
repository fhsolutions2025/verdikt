import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const ALLOWED_CATEGORIES = ['sports', 'finance', 'politics', 'current_affairs', 'custom']
const ALLOWED_SCHEDULES  = ['manual', 'hourly', 'daily']

// ── GET: load the player's Vega config (creates default row if missing) ──────
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('autonomous_agent_configs')
    .select('*')
    .eq('player_id', user.id)
    .single()

  if (data) return NextResponse.json({ config: data })

  // No row yet — return defaults (not persisted until the player saves)
  return NextResponse.json({
    config: {
      player_id:            user.id,
      is_active:            false,
      budget_cap_inr:       500,
      stop_loss_pct:        10,
      max_position_size:    100,
      confidence_threshold: 70,
      allowed_categories:   ['current_affairs', 'finance'],
      max_trades_per_day:   5,
      run_schedule:         'manual',
      last_run_at:          null,
      total_deployed:       0,
      total_pnl:            0,
    },
    isNew: true,
  })
}

// ── PUT: upsert the player's Vega config ─────────────────────────────────────
export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // ── Validate + clamp every guardrail value server-side ──────────────────────
  const isActive            = Boolean(body.is_active)
  const budgetCap           = Math.min(Math.max(Number(body.budget_cap_inr)    || 500, 50), 50_000)
  const stopLoss            = Math.min(Math.max(Number(body.stop_loss_pct)     || 10,  1),  90)
  const maxPosition         = Math.min(Math.max(Number(body.max_position_size) || 100, 10), budgetCap)
  const confidenceThreshold = Math.min(Math.max(Math.round(Number(body.confidence_threshold) || 70), 40), 95)
  const maxTradesPerDay     = Math.min(Math.max(Math.round(Number(body.max_trades_per_day) || 5), 1), 50)

  const rawCategories = Array.isArray(body.allowed_categories) ? body.allowed_categories.map(String) : []
  const categories    = rawCategories.filter(c => ALLOWED_CATEGORIES.includes(c))
  const safeCategories = categories.length > 0 ? categories : ['current_affairs']

  const schedule = ALLOWED_SCHEDULES.includes(String(body.run_schedule)) ? String(body.run_schedule) : 'manual'

  const service = await createServiceClient()
  const { data, error } = await service
    .from('autonomous_agent_configs')
    .upsert({
      player_id:            user.id,
      is_active:            isActive,
      budget_cap_inr:       budgetCap,
      stop_loss_pct:        stopLoss,
      max_position_size:    maxPosition,
      confidence_threshold: confidenceThreshold,
      allowed_categories:   safeCategories,
      max_trades_per_day:   maxTradesPerDay,
      run_schedule:         schedule,
    }, { onConflict: 'player_id' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ config: data })
}
