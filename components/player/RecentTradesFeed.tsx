'use client'

import { useEffect, useState } from 'react'
import { Trade } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

interface Props {
  marketId: string
  initial:  Trade[]
}

export function RecentTradesFeed({ marketId, initial }: Props) {
  const [trades, setTrades] = useState<Trade[]>(initial)
  const supabase            = createClient()

  useEffect(() => {
    const channel = supabase
      .channel(`recent-trades-${marketId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'trades',
          filter: `market_id=eq.${marketId}`,
        },
        payload => {
          setTrades(prev => [payload.new as Trade, ...prev].slice(0, 20))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [marketId])

  return (
    <div className="space-y-2">
      <h3
        className="text-xs font-bold uppercase tracking-widest"
        style={{ color: 'var(--text-dim)', letterSpacing: '0.08em' }}
      >
        Recent Trades
      </h3>

      <div className="space-y-1.5">
        {trades.slice(0, 10).map(t => (
          <div
            key={t.id}
            className="flex items-center justify-between px-3 py-2 rounded-xl"
            style={{
              backgroundColor: t.side === 'yes' ? 'rgba(0,200,83,0.06)' : 'rgba(224,92,32,0.06)',
            }}
          >
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-bold uppercase"
                style={{ color: t.side === 'yes' ? '#00A844' : '#E05C20' }}
              >
                {t.side}
              </span>
              {t.is_simulated && (
                <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                  {t.simulated_trader_name ?? 'Bot'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs font-semibold" style={{ color: 'var(--text)' }}>
                {t.price}¢
              </span>
              <span className="font-mono text-xs" style={{ color: 'var(--text-faint)' }}>
                {t.amount.toFixed(0)}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                {formatAge(t.created_at)}
              </span>
            </div>
          </div>
        ))}

        {trades.length === 0 && (
          <p className="text-sm py-2" style={{ color: 'var(--text-faint)' }}>
            No trades yet on this market.
          </p>
        )}
      </div>
    </div>
  )
}

function formatAge(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}
