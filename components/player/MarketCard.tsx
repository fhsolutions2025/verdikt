'use client'

import Link from 'next/link'
import { Market, PriceTick } from '@/lib/types'
import { LiveDot } from '@/components/shared/LiveDot'
import { formatVolume } from '@/lib/calculations'

interface Props {
  market: Market
  ticks:  PriceTick[]
}

export function MarketCard({ market, ticks }: Props) {
  const isLive = market.status === 'live'

  return (
    <Link href={`/player/${market.id}`} className="block">
      <div
        className="rounded-2xl p-4 space-y-3 transition-transform active:scale-[0.98]"
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E5E7EB',
          cursor: 'pointer',
        }}
      >
        {/* Row 1: category + confidence */}
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-bold uppercase px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: '#F3F4F6',
              color: '#374151',
              letterSpacing: '0.06em',
            }}
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
        </div>

        {/* Row 2: question */}
        <p
          className="font-bold leading-snug line-clamp-2"
          style={{ fontSize: 14, color: '#111A11' }}
        >
          {market.question}
        </p>

        {/* Row 3: sparkline */}
        <Sparkline ticks={ticks} />

        {/* Row 4: YES / NO price blocks */}
        <div className="flex gap-2">
          <PriceBlock side="yes" price={market.yes_price} />
          <PriceBlock side="no"  price={market.no_price}  />
        </div>

        {/* Row 5: live indicator + volume */}
        <div className="flex items-center justify-between">
          {isLive ? (
            <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: '#00C853' }}>
              <LiveDot size={7} />
              LIVE
            </span>
          ) : (
            <span className="text-xs font-semibold" style={{ color: '#9CA3AF' }}>
              {market.status.replace(/_/g, ' ')}
            </span>
          )}
          <span className="text-xs font-mono" style={{ color: '#9CA3AF' }}>
            Vol: {formatVolume(market.volume)}
          </span>
        </div>
      </div>
    </Link>
  )
}

function PriceBlock({ side, price }: { side: 'yes' | 'no'; price: number }) {
  const isYes = side === 'yes'
  return (
    <div
      className="flex-1 flex items-center justify-between px-3 py-2 rounded-xl"
      style={{ backgroundColor: isYes ? '#F0FFF4' : '#FFF8F0' }}
    >
      <span
        className="text-xs font-bold uppercase"
        style={{ color: isYes ? '#00A844' : '#E05C20' }}
      >
        {side}
      </span>
      <span
        className="font-mono font-bold"
        style={{ fontSize: 19, color: isYes ? '#00A844' : '#E05C20' }}
      >
        {price}¢
      </span>
    </div>
  )
}

function Sparkline({ ticks }: { ticks: PriceTick[] }) {
  if (ticks.length < 2) {
    return <div style={{ height: 32 }} />
  }

  const prices = ticks.map(t => t.price)
  const min    = Math.min(...prices)
  const max    = Math.max(...prices)
  const range  = max - min || 1
  const W      = 280
  const H      = 32

  const points = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * W
    const y = H - ((p - min) / range) * H
    return `${x},${y}`
  }).join(' ')

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={H}
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke="#00C853"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

const CATEGORY_ICON: Record<string, string> = {
  sports:          '⚽',
  finance:         '📈',
  politics:        '🗳',
  current_affairs: '🌍',
  custom:          '✨',
}
