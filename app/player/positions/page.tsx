import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PositionsClient } from '@/components/player/PositionsClient'
import { PlayerTabBar } from '@/components/player/PlayerTabBar'
import type { Position, Market, Wallet } from '@/lib/types'

export type PositionWithMarket = Position & {
  markets: Pick<Market, 'id' | 'question' | 'yes_price' | 'no_price' | 'status' | 'closes_at' | 'category' | 'outcome'>
  isVega: boolean
}

export const dynamic = 'force-dynamic'

export default async function PositionsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [positionsRes, vegaLogsRes, walletRes] = await Promise.all([
    supabase
      .from('positions')
      .select(`*, markets (id, question, yes_price, no_price, status, closes_at, category, outcome)`)
      .eq('player_id', user.id)
      .order('entry_at', { ascending: false }),

    supabase
      .from('autonomous_trade_log')
      .select('position_id')
      .eq('player_id', user.id)
      .eq('action', 'entry')
      .not('position_id', 'is', null),

    supabase
      .from('wallets')
      .select('balance')
      .eq('player_id', user.id)
      .single(),
  ])

  const vegaPositionIds = new Set(
    (vegaLogsRes.data ?? []).map((r: { position_id: string }) => r.position_id)
  )

  const positions: PositionWithMarket[] = (positionsRes.data ?? []).map((p: Position & { markets: PositionWithMarket['markets'] }) => ({
    ...p,
    isVega: vegaPositionIds.has(p.id),
  }))

  const wallet = walletRes.data as Pick<Wallet, 'balance'> | null

  return (
    <main className="min-h-screen pb-24" style={{ backgroundColor: 'var(--bg-base)' }}>
      <div className="max-w-[420px] mx-auto px-4 pt-4">
        <div
          className="flex items-center justify-between px-4 py-3 rounded-2xl mb-4"
          style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
            Balance
          </span>
          <span className="font-mono font-bold text-xl" style={{ color: 'var(--text-strong)' }}>
            {wallet?.balance.toFixed(2) ?? '—'}
          </span>
        </div>

        <PositionsClient
          initialPositions={positions}
          playerId={user.id}
        />
      </div>

      <PlayerTabBar active="positions" />
    </main>
  )
}
