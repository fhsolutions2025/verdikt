import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PlayerFeedClient } from '@/components/player/PlayerFeedClient'
import { PlayerTabBar } from '@/components/player/PlayerTabBar'
import type { Market, PriceTick, PriceCache } from '@/lib/types'

export const dynamic = 'force-dynamic'

export interface ResolvedMarket {
  id: string
  question: string
  category: string
  outcome: string | null
  resolved_at: string | null
  volume: number
  my_pnl: number | null
  my_side: string | null
}

export default async function PlayerPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Tradeable feed = LIVE only. ai_ready markets stay in company/MM review.
  const [marketsRes, priceCacheRes, resolvedRes] = await Promise.all([
    supabase
      .from('markets')
      .select('*')
      .eq('status', 'live')
      .order('volume', { ascending: false }),
    supabase
      .from('price_cache')
      .select('*')
      .gte('fetched_at', new Date(Date.now() - 10 * 60 * 1000).toISOString()),
    supabase
      .from('markets')
      .select('id, question, category, outcome, resolved_at, volume')
      .eq('status', 'resolved')
      .order('resolved_at', { ascending: false })
      .limit(40),
  ])

  const markets    = marketsRes.data as Market[] | null
  const priceRows  = (priceCacheRes.data ?? []) as PriceCache[]
  const resolvedRaw = (resolvedRes.data ?? []) as Omit<ResolvedMarket, 'my_pnl' | 'my_side'>[]

  // Pull this player's settled positions on the resolved markets for P&L display.
  const resolvedIds = resolvedRaw.map(m => m.id)
  const myPos: Record<string, { pnl: number; side: string }> = {}
  if (resolvedIds.length > 0) {
    const posRes = await supabase
      .from('positions')
      .select('market_id, side, realized_pnl')
      .eq('player_id', user.id)
      .in('market_id', resolvedIds)
    for (const p of (posRes.data ?? []) as { market_id: string; side: string; realized_pnl: number | null }[]) {
      myPos[p.market_id] = { pnl: Number(p.realized_pnl ?? 0), side: p.side }
    }
  }
  const resolvedMarkets: ResolvedMarket[] = resolvedRaw.map(m => ({
    ...m,
    my_pnl:  myPos[m.id]?.pnl ?? null,
    my_side: myPos[m.id]?.side ?? null,
  }))

  const priceCache: Record<string, PriceCache> = {}
  for (const row of priceRows) priceCache[row.symbol] = row

  // Recent ticks for sparklines
  const marketIds = (markets ?? []).map(m => m.id)
  const allTicksRes = marketIds.length > 0
    ? await supabase.from('price_ticks').select('*').in('market_id', marketIds).order('recorded_at', { ascending: true })
    : { data: [] }
  const allTicks = allTicksRes.data as PriceTick[] | null

  const ticksByMarket: Record<string, PriceTick[]> = {}
  for (const tick of allTicks ?? []) {
    if (!ticksByMarket[tick.market_id]) ticksByMarket[tick.market_id] = []
    ticksByMarket[tick.market_id]!.push(tick)
  }

  return (
    <main className="min-h-screen pb-24" style={{ backgroundColor: 'var(--bg-surface)' }}>
      <PlayerFeedClient
        initialMarkets={markets ?? []}
        ticksByMarket={ticksByMarket}
        priceCache={priceCache}
        resolvedMarkets={resolvedMarkets}
      />
      <PlayerTabBar active="markets" />
    </main>
  )
}
