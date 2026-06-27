'use client'

import { useEffect, useMemo, useState } from 'react'
import { Market, PriceTick, PriceCache } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { MarketCard } from './MarketCard'
import { BannerCarousel, type PromoBannerLite } from './BannerCarousel'

type Category = 'all' | 'sports' | 'finance' | 'current_affairs' | 'custom'
type Mode = 'foryou' | 'trending' | 'ending' | 'volume' | 'new'

interface Props {
  initialMarkets:  Market[]
  ticksByMarket:   Record<string, PriceTick[]>
  priceCache:      Record<string, PriceCache>
  banners:         PromoBannerLite[]
}

const CATEGORIES: { label: string; value: Category }[] = [
  { label: 'All',      value: 'all' },
  { label: 'Sports',   value: 'sports' },
  { label: 'Finance',  value: 'finance' },
  { label: 'News',     value: 'current_affairs' },
  { label: 'Custom',   value: 'custom' },
]

const MODES: { label: string; value: Mode }[] = [
  { label: 'For you',     value: 'foryou' },
  { label: 'Trending',    value: 'trending' },
  { label: 'Ending soon', value: 'ending' },
  { label: 'Top volume',  value: 'volume' },
  { label: 'New',         value: 'new' },
]

// ── price_cache symbol resolution (unchanged) ───────────────────────────────────
function resolveLivePrice(question: string, category: string, cache: Record<string, PriceCache>) {
  const q = question.toLowerCase()
  if (q.includes('bitcoin') || /\bbtc\b/.test(q)) return cache['BTC']
  if (q.includes('ethereum') || /\beth\b/.test(q)) return cache['ETH']
  if (q.includes('solana') || /\bsol\b/.test(q)) return cache['SOL']
  if (/\bxrp\b/.test(q) || q.includes('ripple')) return cache['XRP']
  if (q.includes('doge') || q.includes('dogecoin')) return cache['DOGE']
  if (q.includes('gold') || /\bxau\b/.test(q)) return cache['XAU']
  if (q.includes('silver') || /\bxag\b/.test(q)) return cache['XAG']
  if (/\beur\b/.test(q) && category === 'finance') return cache['EUR']
  if (/\bgbp\b/.test(q) && category === 'finance') return cache['GBP']
  if (/\bjpy\b/.test(q) || q.includes('yen')) return cache['JPY']
  if (/\bcad\b/.test(q)) return cache['CAD']
  if (/\baud\b/.test(q)) return cache['AUD']
  if (/\bchf\b/.test(q) || q.includes('franc')) return cache['CHF']
  if (/\bcny\b/.test(q) || q.includes('yuan')) return cache['CNY']
  if (/\binr\b/.test(q) || q.includes('rupee')) return cache['INR']
  if (/\bmxn\b/.test(q) || q.includes('peso')) return cache['MXN']
  return undefined
}

function formatLivePrice(entry: PriceCache) {
  const isCrypto = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'].includes(entry.symbol)
  const isCommodity = ['XAU', 'XAG'].includes(entry.symbol)
  if (isCrypto || isCommodity) {
    const formatted = entry.price >= 1000
      ? `$${entry.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
      : `$${entry.price.toFixed(2)}`
    return { label: entry.label, value: formatted, source: entry.source }
  }
  return { label: entry.label, value: `1 USD = ${entry.price.toFixed(4)} ${entry.symbol}`, source: entry.source }
}

export function PlayerFeedClient({ initialMarkets, ticksByMarket, priceCache, banners }: Props) {
  const [markets, setMarkets] = useState<Market[]>(initialMarkets)
  const [ticks, setTicks]     = useState(ticksByMarket)
  const [category, setCategory] = useState<Category>('all')
  const [mode, setMode]       = useState<Mode>('foryou')
  const [search, setSearch]   = useState('')
  const supabase              = createClient()

  useEffect(() => {
    const channel = supabase
      .channel('player-feed-markets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'markets' }, payload => {
        const updated = payload.new as Market
        if (updated.status === 'live') {
          setMarkets(prev => prev.find(m => m.id === updated.id) ? prev.map(m => m.id === updated.id ? updated : m) : [updated, ...prev])
        } else {
          setMarkets(prev => prev.filter(m => m.id !== updated.id))
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'price_ticks' }, payload => {
        const tick = payload.new as PriceTick
        setTicks(prev => ({ ...prev, [tick.market_id]: [...(prev[tick.market_id] ?? []).slice(-19), tick] }))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // "hot" threshold for the single status badge
  const hotThreshold = useMemo(() => {
    const v = markets.map(m => m.volume).sort((a, b) => b - a)
    return v[Math.floor(v.length * 0.15)] ?? Infinity
  }, [markets])

  // Single, deduped list — sorted by the active discovery mode.
  const feed = useMemo(() => {
    const base = markets.filter(m =>
      (category === 'all' || m.category === category) &&
      (!search || m.question.toLowerCase().includes(search.toLowerCase())),
    )
    const byVol  = (a: Market, b: Market) => b.volume - a.volume
    const byNew  = (a: Market, b: Market) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    const byEnd  = (a: Market, b: Market) => new Date(a.closes_at).getTime() - new Date(b.closes_at).getTime()
    switch (mode) {
      case 'ending':   return [...base].sort(byEnd)
      case 'new':      return [...base].sort(byNew)
      case 'trending':
      case 'volume':   return [...base].sort(byVol)
      default:         return [...base].sort(byVol)
    }
  }, [markets, category, search, mode])

  return (
    <div className="max-w-[440px] mx-auto" style={{ backgroundColor: 'var(--bg-surface)' }}>
      <BannerCarousel banners={banners} />

      {/* Markets is the default (and only) home view; Results lives in the menu. */}
      <>
          {/* Search */}
          <div className="px-4 pt-4 pb-3">
            <input
              type="text"
              placeholder="Search markets…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search markets"
              className="w-full px-4 py-3 rounded-xl text-sm outline-none"
              style={{ backgroundColor: 'var(--bg-inset)', border: '1px solid var(--border)', color: 'var(--text-strong)', fontFamily: 'inherit' }}
            />
          </div>

          {/* Category chips — scalable, selected state not colour-only */}
          <div className="flex gap-2 px-4 pb-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {CATEGORIES.map(c => {
              const on = category === c.value
              return (
                <button
                  key={c.value}
                  onClick={() => setCategory(c.value)}
                  aria-pressed={on}
                  className="flex-shrink-0 px-3.5 rounded-full text-xs transition-all"
                  style={{
                    minHeight: 36,
                    fontWeight: on ? 800 : 600,
                    backgroundColor: on ? 'rgba(0,200,83,0.16)' : 'var(--bg-inset)',
                    color: on ? '#00A844' : 'var(--text-dim)',
                    border: `1px solid ${on ? '#00C853' : 'var(--border)'}`,
                    cursor: 'pointer',
                  }}
                >{c.label}</button>
              )
            })}
          </div>

          {/* Discovery mode — single deduped list, re-sorted */}
          <div className="flex gap-2 px-4 pb-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {MODES.map(m => {
              const on = mode === m.value
              return (
                <button
                  key={m.value}
                  onClick={() => setMode(m.value)}
                  aria-pressed={on}
                  className="flex-shrink-0 px-3 py-1.5 text-xs transition-all"
                  style={{
                    fontWeight: on ? 700 : 500,
                    color: on ? 'var(--text-strong)' : 'var(--text-faint)',
                    borderBottom: `2px solid ${on ? '#00C853' : 'transparent'}`,
                    background: 'none', cursor: 'pointer',
                  }}
                >{m.label}</button>
              )
            })}
          </div>

          <p className="px-4 pb-3 text-xs" style={{ color: 'var(--text-faint)' }}>
            {feed.length} live market{feed.length !== 1 ? 's' : ''} · prices update in real time
          </p>

          <div className="px-4 space-y-3 pb-6">
            {feed.map(m => {
              const priceEntry = resolveLivePrice(m.question, m.category, priceCache)
              const lp = priceEntry ? formatLivePrice(priceEntry) : undefined
              return (
                <div key={m.id} className="card-enter">
                  <MarketCard market={m} ticks={(ticks[m.id] ?? []).slice(-20)} livePrice={lp} isHot={m.volume >= hotThreshold && m.volume > 0} />
                </div>
              )
            })}
            {feed.length === 0 && (
              <div className="py-12 text-center">
                <p className="text-sm" style={{ color: 'var(--text-faint)' }}>No live markets match your filter.</p>
              </div>
            )}
          </div>
        </>
    </div>
  )
}
