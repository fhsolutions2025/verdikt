'use client'

import { useEffect, useState } from 'react'
import { PriceTick } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

interface Props {
  marketId: string
  initial:  PriceTick[]
}

export function PriceChart({ marketId, initial }: Props) {
  const [ticks, setTicks]     = useState<PriceTick[]>(initial)
  const [flashing, setFlash]  = useState<'up' | 'down' | null>(null)
  const supabase               = createClient()

  useEffect(() => {
    const channel = supabase
      .channel(`price-chart-${marketId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'price_ticks',
          filter: `market_id=eq.${marketId}`,
        },
        payload => {
          const newTick = payload.new as PriceTick
          setTicks(prev => {
            const last = prev[prev.length - 1]
            setFlash(last && newTick.price > last.price ? 'up' : 'down')
            setTimeout(() => setFlash(null), 450)
            return [...prev.slice(-99), newTick]
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [marketId])

  if (ticks.length < 2) {
    return (
      <div
        className="w-full rounded-2xl flex items-center justify-center"
        style={{ height: 180, backgroundColor: 'var(--bg-inset)' }}
      >
        <span className="text-sm" style={{ color: 'var(--text-faint)' }}>No price data yet</span>
      </div>
    )
  }

  const prices  = ticks.map(t => t.price)
  const minP    = Math.max(0,   Math.min(...prices) - 5)
  const maxP    = Math.min(100, Math.max(...prices) + 5)
  const range   = maxP - minP || 1
  const W       = 600
  const H       = 160

  const points  = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * W
    const y = H - ((p - minP) / range) * H
    return `${x},${y}`
  }).join(' ')

  const lastPrice  = prices[prices.length - 1]
  const prevPrice  = prices[prices.length - 2]
  const lineColor  = lastPrice >= prevPrice ? '#00C853' : '#E05C20'

  const flashBg = flashing === 'up'
    ? 'rgba(0,200,83,0.15)'
    : flashing === 'down'
    ? 'rgba(224,92,32,0.15)'
    : 'transparent'

  return (
    <div
      className="w-full rounded-2xl overflow-hidden relative"
      style={{
        height: 180,
        backgroundColor: flashBg,
        transition: 'background-color 0.4s ease',
      }}
    >
      {/* Price labels */}
      <div className="absolute left-2 top-2 space-y-1">
        <span className="font-mono text-xs font-bold" style={{ color: 'var(--text-dim)' }}>
          {Math.round(maxP)}¢
        </span>
      </div>
      <div className="absolute left-2 bottom-2">
        <span className="font-mono text-xs font-bold" style={{ color: 'var(--text-dim)' }}>
          {Math.round(minP)}¢
        </span>
      </div>

      {/* Current price badge */}
      <div className="absolute right-3 top-3">
        <span
          className="font-mono font-bold text-sm px-2.5 py-1 rounded-lg"
          style={{
            backgroundColor: lineColor + '20',
            color: lineColor,
          }}
        >
          {lastPrice.toFixed(1)}¢
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        className="pt-4"
      >
        <polyline
          points={points}
          fill="none"
          stroke={lineColor}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}
