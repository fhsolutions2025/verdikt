import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { role } = await getAuthContext()
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = await createServiceClient()

  // Fetch all player profiles
  const { data: profiles, error: profileErr } = await service
    .from('profiles')
    .select('id, display_name, operator_id, created_at')
    .eq('role', 'player')
    .order('created_at', { ascending: false })

  if (profileErr || !profiles) {
    return NextResponse.json({ error: 'Failed to load players' }, { status: 500 })
  }

  if (profiles.length === 0) {
    return NextResponse.json({ players: [] })
  }

  const playerIds = profiles.map(p => p.id)

  // Fetch wallets, positions, trades in parallel
  const [walletsRes, positionsRes, tradesRes] = await Promise.all([
    service.from('wallets').select('player_id, balance').in('player_id', playerIds),
    service.from('positions').select('player_id, status, realized_pnl, entry_value').in('player_id', playerIds),
    service.from('trades').select('taker_id, amount, created_at').in('taker_id', playerIds),
  ])

  const walletMap = new Map<string, number>()
  for (const w of (walletsRes.data ?? [])) {
    walletMap.set(w.player_id, w.balance)
  }

  const posMap = new Map<string, { open: number; pnl: number }>()
  for (const p of (positionsRes.data ?? [])) {
    const cur = posMap.get(p.player_id) ?? { open: 0, pnl: 0 }
    if (p.status === 'open') cur.open++
    if (p.realized_pnl != null) cur.pnl += p.realized_pnl
    posMap.set(p.player_id, cur)
  }

  const tradeMap = new Map<string, { count: number; volume: number; last: string | null }>()
  for (const t of (tradesRes.data ?? [])) {
    const id  = t.taker_id!
    const cur = tradeMap.get(id) ?? { count: 0, volume: 0, last: null }
    cur.count++
    cur.volume += t.amount
    if (!cur.last || t.created_at > cur.last) cur.last = t.created_at
    tradeMap.set(id, cur)
  }

  const players = profiles.map(p => {
    const pos      = posMap.get(p.id)   ?? { open: 0, pnl: 0 }
    const trd      = tradeMap.get(p.id) ?? { count: 0, volume: 0, last: null }
    const balance  = walletMap.get(p.id) ?? 0

    // Risk flag: negative P&L > 200¢ or very high volume with 0 balance
    const risk_flag = pos.pnl < -200 || (trd.volume > 500 && balance < 5)

    return {
      id:             p.id,
      display_name:   p.display_name,
      operator_id:    p.operator_id,
      created_at:     p.created_at,
      balance,
      trade_count:    trd.count,
      open_positions: pos.open,
      total_pnl:      pos.pnl,
      volume:         trd.volume,
      last_active:    trd.last,
      risk_flag,
    }
  })

  return NextResponse.json({ players })
}
