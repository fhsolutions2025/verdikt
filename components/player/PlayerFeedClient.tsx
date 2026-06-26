'use client'

import { useEffect, useState } from 'react'
import { Market, PriceTick, PriceCache } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { MarketCard } from './MarketCard'
import { VisualHero } from './VisualHero'

type Category = 'all' | 'sports' | 'finance' | 'current_affairs' | 'custom'

interface Props {
  initialMarkets:  Market[]
  ticksByMarket:   Record<string, PriceTick[]>
  priceCache:      Record<string, PriceCache>
}

const FILTERS: { label: string; value: Category }[] = [
  { label: 'All',          value: 'all' },
  { label: '⚽ Sports',    value: 'sports' },
  { label: '📈 Finance',   value: 'finance' },
  { label: '🌍 Current',   value: 'current_affairs' },
  { label: '✨ Custom',    value: 'custom' },
]

// Match a market question + category to a price_cache symbol
function resolveLivePrice(
  question: string,
  category: string,
  cache: Record<string, PriceCache>,
) {
  const q = question.toLowerCase()

  // Crypto
  if (q.includes('bitcoin') || /\bbtc\b/.test(q)) return cache['BTC']
  if (q.includes('ethereum') || /\beth\b/.test(q)) return cache['ETH']
  if (q.includes('solana') || /\bsol\b/.test(q)) return cache['SOL']
  if (/\bxrp\b/.test(q) || q.includes('ripple')) return cache['XRP']
  if (q.includes('doge') || q.includes('dogecoin')) return cache['DOGE']

  // Commodities
  if (q.includes('gold') || /\bxau\b/.test(q)) return cache['XAU']
  if (q.includes('silver') || /\bxag\b/.test(q)) return cache['XAG']

  // Forex — match specific pairs first, then broad keywords
  if (/\beur\b/.test(q) && category === 'finance') return cache['EUR']
  if (/\bgbp\b/.test(q) && category === 'finance') return cache['GBP']
  if (/\bjpy\b/.test(q) || q.includes('yen')) return cache['JPY']
  if (/\bcad\b/.test(q)) return cache['CAD']
  if (/\baud\b/.test(q)) return cache['AUD']
  if (/\bchf\b/.test(q) || q.includes('franc')) return cache['CHF']
  if (/\bcny\b/.test(q) || q.includes('yuan')) return cache['CNY']
  if (/\binr\b/.test(q) || q.includes('rupee')) return cache['INR']
  if (/\bmxn\b/.test(q) || q.includes('peso')) return cache['MXN']
  if (/\bbrl\b/.test(q) || q.includes('real') && category === 'finance') return cache['BRL']

  return undefined
}

function formatLivePrice(entry: PriceCache) {
  // Crypto and commodities: dollar value
  const isCrypto = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'].includes(entry.symbol)
  const isCommodity = ['XAU', 'XAG'].includes(entry.symbol)
  if (isCrypto || isCommodity) {
    const formatted = entry.price >= 1000
      ? `$${entry.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
      : `$${entry.price.toFixed(2)}`
    return { label: entry.label, value: formatted, source: entry.source }
  }
  // Forex: rate is how many units of this currency per 1 USD
  return {
    label:  entry.label,
    value:  `1 USD = ${entry.price.toFixed(4)} ${entry.symbol}`,
    source: entry.source,
  }
}

export function PlayerFeedClient({ initialMarkets, ticksByMarket, priceCache }: Props) {
  const [markets, setMarkets]   = useState<Market[]>(initialMarkets)
  const [ticks, setTicks]       = useState(ticksByMarket)
  const [filter, setFilter]     = useState<Category>('all')
  const [search, setSearch]     = useState('')
  const supabase                = createClient()

  useEffect(() => {
    const channel = supabase
      .channel('player-feed-markets')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'markets' },
        payload => {
          const updated = payload.new as Market
          if (updated.status === 'live') {
            setMarkets(prev => {
              const exists = prev.find(m => m.id === updated.id)
              return exists
                ? prev.map(m => m.id === updated.id ? updated : m)
                : [updated, ...prev]
            })
          } else if (updated.status === 'resolved' || updated.status === 'voided') {
            setMarkets(prev => prev.filter(m => m.id !== updated.id))
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'price_ticks' },
        payload => {
          const tick = payload.new as PriceTick
          setTicks(prev => ({
            ...prev,
            [tick.market_id]: [...(prev[tick.market_id] ?? []).slice(-19), tick],
          }))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const filtered = markets.filter(m => {
    const matchCat    = filter === 'all' || m.category === filter
    const matchSearch = !search || m.question.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const liveFiltered = filtered.filter(m => m.status === 'live')

  // Trending = top 3 live markets by volume (used in carousel)
  const trending = [...markets]
    .filter(m => m.status === 'live' && m.volume > 0)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 4)

  // Top ~20% by volume are "hot" for badge purposes
  const volumeValues = markets.map(m => m.volume).sort((a, b) => b - a)
  const hotThreshold = volumeValues[Math.floor(volumeValues.length * 0.15)] ?? Infinity

  return (
    <div
      className="max-w-[420px] mx-auto"
      style={{ backgroundColor: 'var(--bg-surface)' }}
    >
      {/* Hero / CTA — Visual skin only */}
      <VisualHero />

      {/* Search */}
      <div className="px-4 pt-4 pb-3">
        <input
          type="text"
          placeholder="Search markets…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
          style={{
            backgroundColor: 'var(--bg-inset)',
            border: '1px solid var(--border)',
            color: 'var(--text-strong)',
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Category filters */}
      <div className="flex gap-2 px-4 pb-4 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all"
            style={{
              backgroundColor: filter === f.value ? '#00C853' : 'var(--bg-inset)',
              color:            filter === f.value ? '#FFFFFF'  : 'var(--text)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Trending carousel — only shown on "All" with no search */}
      {filter === 'all' && !search && trending.length >= 2 && (
        <div className="px-4 pb-4">
          <p className="text-xs font-bold uppercase mb-2" style={{ color: 'var(--text-faint)', letterSpacing: '0.06em' }}>
            🔥 Trending
          </p>
          <div
            className="flex gap-3 overflow-x-auto pb-1"
            style={{ scrollbarWidth: 'none' }}
          >
            {trending.map(m => {
              const priceEntry = resolveLivePrice(m.question, m.category, priceCache)
              const lp = priceEntry ? formatLivePrice(priceEntry) : undefined
              return (
                <div key={m.id} style={{ minWidth: 220, maxWidth: 240, flexShrink: 0 }}>
                  <MarketCard
                    market={m}
                    ticks={(ticks[m.id] ?? []).slice(-20)}
                    livePrice={lp}
                    isHot
                  />
                </div>
              )
            })}
          </div>
          <div className="mt-4 border-t" style={{ borderColor: 'var(--bg-inset)' }} />
        </div>
      )}

      {/* Live activity strip */}
      <div
        className="mx-4 mb-4 px-4 py-2.5 rounded-xl text-xs font-semibold"
        style={{ backgroundColor: 'rgba(0,200,83,0.10)', color: '#00A844' }}
      >
        {liveFiltered.length} live markets · prices update in real time
      </div>

      {/* Market cards */}
      <div className="px-4 space-y-3 pb-6">
        {filtered.map(m => {
          const priceEntry = resolveLivePrice(m.question, m.category, priceCache)
          const lp         = priceEntry ? formatLivePrice(priceEntry) : undefined
          const isHot      = m.volume >= hotThreshold && m.volume > 0
          return (
            <div key={m.id} className="card-enter">
              <MarketCard
                market={m}
                ticks={(ticks[m.id] ?? []).slice(-20)}
                livePrice={lp}
                isHot={isHot}
              />
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm" style={{ color: 'var(--text-faint)' }}>
              No markets match your filter.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
