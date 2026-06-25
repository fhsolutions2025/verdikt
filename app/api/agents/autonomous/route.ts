import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth'

// ── GET: platform-wide autonomous-agent (Vega) overview for Ops ──────────────
export async function GET() {
  const { user, role } = await getAuthContext()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = await createServiceClient()
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)

  const [flagRes, configsRes, todayRes] = await Promise.all([
    service.from('autonomous_global_config').select('agents_enabled, paused_reason, updated_at').eq('id', 1).single(),
    service.from('autonomous_agent_configs').select('is_active, total_deployed, total_pnl'),
    service.from('autonomous_trade_log')
      .select('action')
      .gte('created_at', todayStart.toISOString()),
  ])

  const configs = configsRes.data ?? []
  const todayRows = todayRes.data ?? []

  const activeCount    = configs.filter(c => c.is_active).length
  const totalDeployed  = configs.reduce((s, c) => s + Number(c.total_deployed ?? 0), 0)
  const totalPnl       = configs.reduce((s, c) => s + Number(c.total_pnl ?? 0), 0)

  const entriesToday   = todayRows.filter(r => r.action === 'entry').length
  const exitsToday     = todayRows.filter(r => r.action === 'stop_loss' || r.action === 'exit').length
  const errorsToday    = todayRows.filter(r => r.action === 'error').length

  return NextResponse.json({
    agents_enabled: flagRes.data?.agents_enabled ?? true,
    paused_reason:  flagRes.data?.paused_reason ?? null,
    updated_at:     flagRes.data?.updated_at ?? null,
    active_count:   activeCount,
    total_count:    configs.length,
    total_deployed: totalDeployed,
    total_pnl:      totalPnl,
    entries_today:  entriesToday,
    exits_today:    exitsToday,
    errors_today:   errorsToday,
  })
}

// ── PUT: toggle the global kill-switch ───────────────────────────────────────
export async function PUT(req: NextRequest) {
  const { user, role } = await getAuthContext()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const enabled = Boolean(body.agents_enabled)
  const reason  = enabled ? null : String(body.paused_reason ?? 'Paused by Ops').slice(0, 300)

  const service = await createServiceClient()
  const { error } = await service
    .from('autonomous_global_config')
    .update({
      agents_enabled: enabled,
      paused_reason:  reason,
      updated_at:     new Date().toISOString(),
      updated_by:     user.id,
    })
    .eq('id', 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Audit the kill-switch action
  await service.from('audit_log').insert({
    type:        'config_change',
    description: enabled ? 'Autonomous agents globally ENABLED' : `Autonomous agents globally PAUSED: ${reason}`,
    actor_id:    user.id,
  }).then(() => {}, () => {})

  return NextResponse.json({ ok: true, agents_enabled: enabled })
}
