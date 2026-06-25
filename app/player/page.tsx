import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PlayerFeedClient } from '@/components/player/PlayerFeedClient'
import { PlayerTabBar } from '@/components/player/PlayerTabBar'
import type { Market, PriceTick, PriceCache } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function PlayerPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [marketsRes, priceCacheRes] = await Promise.all([
    supabase
      .from('markets')
      .select('*')
      .in('status', ['live', 'ai_ready'])
      .order('volume', { ascending: false }),
    supabase
      .from('price_cache')
      .select('*')
      // Only use prices fetched within the last 10 minutes
      .gte('fetched_at', new Date(Date.now() - 10 * 60 * 1000).toISOString()),
  ])

  const markets    = marketsRes.data as Market[] | null
  const priceRows  = (priceCacheRes.data ?? []) as PriceCache[]

  // Index price_cache by symbol for O(1) lookup in components
  const priceCache: Record<string, PriceCache> = {}
  for (const row of priceRows) {
    priceCache[row.symbol] = row
  }

  // Fetch recent ticks for sparklines
  const marketIds = (markets ?? []).map(m => m.id)
  const allTicksRes = marketIds.length > 0
    ? await supabase
        .from('price_ticks')
        .select('*')
        .in('market_id', marketIds)
        .order('recorded_at', { ascending: true })
    : { data: [] }
  const allTicks = allTicksRes.data as PriceTick[] | null

  // Group ticks by market_id
  const ticksByMarket: Record<string, PriceTick[]> = {}
  for (const tick of allTicks ?? []) {
    if (!ticksByMarket[tick.market_id]) ticksByMarket[tick.market_id] = []
    ticksByMarket[tick.market_id]!.push(tick)
  }

  return (
    <main
      className="min-h-screen pb-24"
      style={{ backgroundColor: '#FFFFFF' }}
    >
      <PlayerFeedClient
        initialMarkets={markets ?? []}
        ticksByMarket={ticksByMarket}
        priceCache={priceCache}
      />
      <PlayerTabBar active="markets" />
    </main>
  )
}
