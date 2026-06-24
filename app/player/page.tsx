import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PlayerFeedClient } from '@/components/player/PlayerFeedClient'
import { PlayerTabBar } from '@/components/player/PlayerTabBar'
import type { Market, PriceTick } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function PlayerPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const marketsRes = await supabase
    .from('markets')
    .select('*')
    .in('status', ['live', 'ai_ready'])
    .order('volume', { ascending: false })
  const markets = marketsRes.data as Market[] | null

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
      />
      <PlayerTabBar active="markets" />
    </main>
  )
}
