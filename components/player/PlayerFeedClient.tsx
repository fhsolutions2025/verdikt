'use client'

import { useEffect, useState } from 'react'
import { Market, PriceTick } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { MarketCard } from './MarketCard'

type Category = 'all' | 'sports' | 'finance' | 'politics' | 'current_affairs' | 'custom'

interface Props {
  initialMarkets: Market[]
  ticksByMarket:  Record<string, PriceTick[]>
}

const FILTERS: { label: string; value: Category }[] = [
  { label: 'All',            value: 'all' },
  { label: '⚽ Sports',      value: 'sports' },
  { label: '📈 Finance',     value: 'finance' },
  { label: '🗳 Politics',    value: 'politics' },
  { label: '🌍 Current',     value: 'current_affairs' },
  { label: '✨ Custom',      value: 'custom' },
]

export function PlayerFeedClient({ initialMarkets, ticksByMarket }: Props) {
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

  return (
    <div
      className="max-w-[420px] mx-auto"
      style={{ backgroundColor: '#FFFFFF' }}
    >
      {/* Search */}
      <div className="px-4 pt-4 pb-3">
        <input
          type="text"
          placeholder="Search markets…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
          style={{
            backgroundColor: '#F3F4F6',
            border: '1px solid #E5E7EB',
            color: '#111A11',
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
              backgroundColor: filter === f.value ? '#00C853' : '#F3F4F6',
              color:            filter === f.value ? '#FFFFFF'  : '#374151',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Live activity strip */}
      <div
        className="mx-4 mb-4 px-4 py-2.5 rounded-xl text-xs font-semibold"
        style={{ backgroundColor: '#F0FFF4', color: '#00A844' }}
      >
        {filtered.filter(m => m.status === 'live').length} live markets · prices update in real time
      </div>

      {/* Market cards */}
      <div className="px-4 space-y-3 pb-6">
        {filtered.map(m => (
          <div key={m.id} className="card-enter">
            <MarketCard
              market={m}
              ticks={(ticks[m.id] ?? []).slice(-20)}
            />
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-sm" style={{ color: '#9CA3AF' }}>
              No markets match your filter.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
