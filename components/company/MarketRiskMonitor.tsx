'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Market } from '@/lib/types'
import { BalanceBar } from '@/components/shared/BalanceBar'
import { isMarketImbalanced } from '@/lib/calculations'

interface Props {
  initial: Market[]
}

export function MarketRiskMonitor({ initial }: Props) {
  const [markets, setMarkets] = useState<Market[]>(initial)
  const supabase              = createClient()

  useEffect(() => {
    const channel = supabase
      .channel('market-risk-monitor')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'markets' },
        payload => {
          setMarkets(prev =>
            prev.map(m =>
              m.id === (payload.new as Market).id ? payload.new as Market : m
            )
          )
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const live       = markets.filter(m => m.status === 'live')
  const flagged    = live.filter(m => isMarketImbalanced(m.yes_price))

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: '#161B22',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div
        className="px-5 py-4 flex items-center justify-between border-b"
        style={{ borderColor: 'rgba(255,255,255,0.08)' }}
      >
        <h2
          className="text-xs font-bold uppercase tracking-widest"
          style={{ color: '#6B7280', letterSpacing: '0.08em' }}
        >
          Market Risk Monitor
        </h2>
        {flagged.length > 0 && (
          <span
            className="text-xs font-bold px-2.5 py-1 rounded-full"
            style={{ backgroundColor: '#E05C2020', color: '#E05C20' }}
          >
            {flagged.length} flagged
          </span>
        )}
      </div>

      <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
        {live.map(market => (
          <div key={market.id} className="px-5 py-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p
                className="text-sm font-medium leading-snug"
                style={{ color: '#D1D5DB', maxWidth: '70%' }}
              >
                {market.question}
              </p>
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: '#374151', color: '#9CA3AF' }}
              >
                {market.category}
              </span>
            </div>
            <BalanceBar yesPrice={market.yes_price} portal="company" />
            <div className="flex items-center gap-4 text-xs font-mono" style={{ color: '#6B7280' }}>
              <span>Vol: {market.volume.toFixed(0)}</span>
            </div>
          </div>
        ))}

        {live.length === 0 && (
          <p className="px-5 py-6 text-sm" style={{ color: '#374151' }}>
            No live markets.
          </p>
        )}
      </div>
    </div>
  )
}
