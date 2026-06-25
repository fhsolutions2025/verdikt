import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ playerId: string }> }
) {
  const { role } = await getAuthContext()
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { playerId } = await params
  const service      = await createServiceClient()

  const [profileRes, walletRes, positionsRes, tradesRes, txRes] = await Promise.all([
    service.from('profiles').select('id, display_name, operator_id, created_at, role').eq('id', playerId).single(),
    service.from('wallets').select('balance').eq('player_id', playerId).single(),
    service.from('positions')
      .select('id, market_id, side, shares, entry_price, entry_value, entry_at, status, realized_pnl')
      .eq('player_id', playerId)
      .order('entry_at', { ascending: false })
      .limit(20),
    service.from('trades')
      .select('id, market_id, side, amount, fee, created_at')
      .eq('taker_id', playerId)
      .order('created_at', { ascending: false })
      .limit(20),
    service.from('wallet_transactions')
      .select('id, type, amount, description, created_at')
      .eq('wallet_id', (await service.from('wallets').select('id').eq('player_id', playerId).single()).data?.id ?? '')
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  if (!profileRes.data) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  }

  // Enrich positions with market questions
  const positions = positionsRes.data ?? []
  const trades    = tradesRes.data ?? []
  const mktSet    = new Set<string>()
  for (const p of positions) mktSet.add(p.market_id)
  for (const t of trades)    mktSet.add(t.market_id)
  const mktIds    = Array.from(mktSet)

  const { data: markets } = mktIds.length > 0
    ? await service.from('markets').select('id, question').in('id', mktIds)
    : { data: [] }

  const mktMap = new Map<string, string>()
  for (const m of (markets ?? [])) mktMap.set(m.id, m.question)

  const totalPnl = positions.reduce((s, p) => s + (p.realized_pnl ?? 0), 0)
  const totalVol = trades.reduce((s, t) => s + t.amount, 0)
  const balance  = walletRes.data?.balance ?? 0

  const player = {
    id:             profileRes.data.id,
    display_name:   profileRes.data.display_name,
    operator_id:    profileRes.data.operator_id,
    created_at:     profileRes.data.created_at,
    balance,
    trade_count:    trades.length,
    open_positions: positions.filter(p => p.status === 'open').length,
    total_pnl:      totalPnl,
    volume:         totalVol,
    last_active:    trades[0]?.created_at ?? null,
    risk_flag:      totalPnl < -200 || (totalVol > 500 && balance < 5),
    positions: positions.map(p => ({
      id:              p.id,
      market_question: mktMap.get(p.market_id) ?? p.market_id,
      side:            p.side,
      shares:          p.shares,
      entry_price:     p.entry_price,
      entry_value:     p.entry_value,
      status:          p.status,
      realized_pnl:    p.realized_pnl,
      entry_at:        p.entry_at,
    })),
    recent_trades: trades.map(t => ({
      id:              t.id,
      market_question: mktMap.get(t.market_id) ?? t.market_id,
      side:            t.side,
      amount:          t.amount,
      fee:             t.fee,
      created_at:      t.created_at,
    })),
    transactions: txRes.data ?? [],
  }

  return NextResponse.json({ player })
}
