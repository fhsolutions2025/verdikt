import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// ── GET: platform-wide Vega performance & calibration (Ops) ──────────────────
export async function GET() {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = await createServiceClient()

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const [logRes, configsRes, cbTodayRes] = await Promise.all([
    service.from('autonomous_trade_log')
      .select('action, market_id, side, amount, realized_pnl, agent_probability, edge_pp'),
    service.from('autonomous_agent_configs').select('is_active'),
    service.from('autonomous_trade_log')
      .select('action', { count: 'exact', head: false })
      .in('action', ['circuit_breaker', 'belief_failure'])
      .gte('created_at', todayStart.toISOString()),
  ])

  const rows = logRes.data ?? []
  const configs = configsRes.data ?? []
  const circuit_breaker_hits_today = (cbTodayRes.data ?? []).length

  const entries = rows.filter(r => r.action === 'entry')

  // ── Aggregates ──
  const total_deployed = entries.reduce((s, r) => s + Number(r.amount ?? 0), 0)
  const total_pnl = rows.reduce((s, r) => s + Number(r.realized_pnl ?? 0), 0)
  const trades = entries.length

  // ── Edge ──
  const edgeRows = entries.filter(r => r.edge_pp != null)
  const avg_edge_pp = edgeRows.length > 0
    ? edgeRows.reduce((s, r) => s + Number(r.edge_pp), 0) / edgeRows.length
    : null

  // ── Markets for the entry rows ──
  const marketIds = Array.from(new Set(entries.map(r => r.market_id).filter(Boolean))) as string[]
  const marketMap = new Map<string, { status: string | null; outcome: string | null }>()
  if (marketIds.length > 0) {
    const { data: markets } = await service
      .from('markets')
      .select('id, status, outcome')
      .in('id', marketIds)
    for (const m of markets ?? []) {
      marketMap.set(m.id as string, { status: m.status ?? null, outcome: m.outcome ?? null })
    }
  }

  const isResolved = (m?: { status: string | null; outcome: string | null }) =>
    !!m && m.status === 'resolved' && (m.outcome === 'yes' || m.outcome === 'no')

  // ── Calibration / win-rate over resolved entries ──
  const resolvedEntries = entries.filter(r => isResolved(marketMap.get(r.market_id as string)))
  const resolved_count = resolvedEntries.length

  let wins = 0
  let brierSum = 0
  let brierCount = 0
  for (const r of resolvedEntries) {
    const m = marketMap.get(r.market_id as string)!
    const win = r.side === m.outcome
    if (win) wins++
    if (r.agent_probability != null) {
      const actual = win ? 1 : 0
      const p = Number(r.agent_probability) / 100
      brierSum += (p - actual) ** 2
      brierCount++
    }
  }

  const win_rate = resolved_count > 0 ? wins / resolved_count : null
  const brier = brierCount > 0 ? brierSum / brierCount : null

  // ── Open positions: entries whose market is NOT resolved/voided ──
  const open_positions = entries.filter(r => {
    const m = marketMap.get(r.market_id as string)
    const status = m?.status
    return status !== 'resolved' && status !== 'voided'
  }).length

  // ── Active agents ──
  const active_agents = configs.filter(c => c.is_active).length

  // ── Calibration label from brier ──
  const calibration_label =
    brier == null ? '—'
      : brier < 0.18 ? 'Excellent'
        : brier < 0.25 ? 'Good'
          : brier < 0.33 ? 'Fair'
            : 'Needs work'

  return NextResponse.json({
    total_deployed,
    total_pnl,
    trades,
    resolved_count,
    win_rate,
    brier,
    avg_edge_pp,
    open_positions,
    active_agents,
    calibration_label,
    circuit_breaker_hits_today,
  })
}
