import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PriceChart } from '@/components/player/PriceChart'
import { OrderBookDepth } from '@/components/player/OrderBookDepth'
import { RecentTradesFeed } from '@/components/player/RecentTradesFeed'
import { MarketDetailClient } from '@/components/player/MarketDetailClient'
import { CountdownTimer } from '@/components/shared/CountdownTimer'
import { LiveDot } from '@/components/shared/LiveDot'
import { formatVolume } from '@/lib/calculations'
import { TradeTicketClientWrapper } from '@/components/player/TradeTicketClientWrapper'
import type { Market, PriceTick, Order, Trade, FeeConfig } from '@/lib/types'

export const dynamic = 'force-dynamic'

interface Props {
  params: { marketId: string }
}

export default async function MarketDetailPage({ params }: Props) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [mRes, tRes, oRes, trRes, fcRes] = await Promise.all([
    supabase.from('markets').select('*').eq('id', params.marketId).single(),
    supabase.from('price_ticks').select('*')
      .eq('market_id', params.marketId)
      .order('recorded_at', { ascending: true })
      .limit(100),
    supabase.from('orders').select('*')
      .eq('market_id', params.marketId)
      .in('status', ['open', 'partially_filled']),
    supabase.from('trades').select('*')
      .eq('market_id', params.marketId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('fee_config').select('*'),
  ])

  const market      = mRes.data   as Market | null
  const ticks       = tRes.data   as PriceTick[] | null
  const orders      = oRes.data   as Order[] | null
  const recentTrades = trRes.data as Trade[] | null
  const feeConfigs  = fcRes.data  as FeeConfig[] | null

  if (!market) notFound()

  const feeConfig = feeConfigs?.find(f => f.category === market.fee_category) ?? null
  const isLive    = market.status === 'live'

  const CATEGORY_ICON: Record<string, string> = {
    sports: '⚽', finance: '📈', politics: '🗳',
    current_affairs: '🌍', custom: '✨',
  }

  return (
    <main className="min-h-screen pb-40" style={{ backgroundColor: '#F9FAFB' }}>
      <div className="max-w-[420px] mx-auto">

        {/* Hero header */}
        <div className="px-4 pt-4 pb-4 space-y-3" style={{ backgroundColor: '#F9FAFB' }}>
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-bold uppercase px-2 py-0.5 rounded-full"
              style={{ backgroundColor: '#F3F4F6', color: '#374151', letterSpacing: '0.06em' }}
            >
              {CATEGORY_ICON[market.category]} {market.category}
            </span>
            {market.ai_confidence != null && (
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: '#F0FFF4', color: '#00A844' }}
              >
                Verdikt AI {market.ai_confidence.toFixed(0)}%
              </span>
            )}
            {isLive && (
              <span className="flex items-center gap-1 text-xs font-bold" style={{ color: '#00C853' }}>
                <LiveDot size={7} /> LIVE
              </span>
            )}
          </div>

          <h1 className="font-bold text-base leading-snug" style={{ color: '#111A11' }}>
            {market.question}
          </h1>

          {/* Price blocks */}
          <div className="flex gap-2">
            <MarketDetailClient market={market} />
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-4 text-xs" style={{ color: '#6B7280' }}>
            <span className="font-mono">Vol: {formatVolume(market.volume)}</span>
            <CountdownTimer closesAt={market.closes_at} />
          </div>

          {market.resolution_source && (
            <p className="text-xs" style={{ color: '#9CA3AF' }}>
              Resolution: {market.resolution_source}
            </p>
          )}
        </div>

        {/* Chart */}
        <div className="px-4 pb-4" style={{ backgroundColor: '#FFFFFF' }}>
          <PriceChart marketId={market.id} initial={ticks ?? []} />
        </div>

        {/* Order book */}
        <div className="px-4 py-4 space-y-4" style={{ backgroundColor: '#FFFFFF' }}>
          <OrderBookDepth orders={orders ?? []} />
        </div>

        {/* Recent trades */}
        <div className="px-4 py-4" style={{ backgroundColor: '#FFFFFF' }}>
          <RecentTradesFeed marketId={market.id} initial={recentTrades ?? []} />
        </div>
      </div>

      {/* Sticky trade ticket */}
      {isLive && (
        <div className="fixed bottom-0 left-0 right-0 max-w-[420px] mx-auto">
          <TradeTicketClientWrapper
            marketId={market.id}
            feeConfig={feeConfig}
            playerId={user.id}
          />
        </div>
      )}
    </main>
  )
}
