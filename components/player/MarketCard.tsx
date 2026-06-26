'use client'

import Link from 'next/link'
import { Market, PriceTick } from '@/lib/types'
import { LiveDot } from '@/components/shared/LiveDot'
import { formatVolume } from '@/lib/calculations'

interface LivePrice {
  label:  string   // e.g. 'BTC/USD'
  value:  string   // e.g. '$67,420'
  source: string
}

interface Props {
  market:     Market
  ticks:      PriceTick[]
  livePrice?: LivePrice
  isHot?:     boolean
}

function relativeCreatedTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 2)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

const SOURCE_LABEL: Record<string, string> = {
  'BBC RSS':           'BBC',
  'Al Jazeera RSS':    'AJ',
  'Reuters RSS':       'Reuters',
  'football-data.org': 'Football',
  'CoinGecko':         'CoinGecko',
  'Alpha Vantage':     'Alpha Vantage',
  'Frankfurter':       'Forex',
}

export function MarketCard({ market, ticks, livePrice, isHot }: Props) {
  const isLive        = market.status === 'live'
  const now           = Date.now()
  const createdAt     = new Date(market.created_at).getTime()
  const closesAt      = new Date(market.closes_at).getTime()
  const isNew         = now - createdAt < 24 * 60 * 60 * 1000
  const closingSoon   = closesAt > now && closesAt - now < 24 * 60 * 60 * 1000
  const sourceLabel   = market.source_feed ? (SOURCE_LABEL[market.source_feed] ?? market.source_feed) : null

  return (
    <Link href={`/player/${market.id}`} className="block">
      <div
        className="rounded-2xl p-4 space-y-3 transition-transform active:scale-[0.98]"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: `1px solid ${isHot ? '#E05C2030' : 'var(--border)'}`,
          cursor: 'pointer',
        }}
      >
        {/* Row 1: category + confidence + badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-xs font-bold uppercase px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: 'var(--bg-inset)',
              color: 'var(--text)',
              letterSpacing: '0.06em',
            }}
          >
            {CATEGORY_ICON[market.category]} {market.category.replace('_', ' ')}
          </span>

          {sourceLabel && (
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'var(--bg-inset)', color: 'var(--text-faint)' }}
            >
              {sourceLabel}
            </span>
          )}

          {market.ai_confidence != null && (
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'rgba(0,200,83,0.10)', color: '#00A844' }}
            >
              Verdikt AI {market.ai_confidence.toFixed(0)}%
            </span>
          )}

          {isHot && (
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'rgba(224,92,32,0.10)', color: '#E05C20' }}
            >
              🔥 Hot
            </span>
          )}
          {isNew && !isHot && (
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'rgba(59,130,246,0.10)', color: '#3B82F6' }}
            >
              NEW
            </span>
          )}
          {closingSoon && (
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'rgba(220,38,38,0.06)', color: '#DC2626' }}
            >
              ⏱ Closing soon
            </span>
          )}
        </div>

        {/* Row 2: question + relative time */}
        <p
          className="font-bold leading-snug line-clamp-2"
          style={{ fontSize: 14, color: 'var(--text-strong)' }}
        >
          {market.question}
        </p>
        <p style={{ fontSize: 11, color: 'var(--text-faintest)', marginTop: -6 }}>
          created {relativeCreatedTime(market.created_at)}
        </p>

        {/* Row 3: live data strip — shown when a relevant price is available */}
        {livePrice && (
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
            style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border)' }}
          >
            <span className="text-xs font-bold font-mono" style={{ color: 'var(--text-strong)' }}>
              {livePrice.label}
            </span>
            <span className="text-xs font-bold font-mono" style={{ color: '#00A844' }}>
              {livePrice.value}
            </span>
            <span className="text-xs ml-auto" style={{ color: 'var(--text-faint)' }}>
              live · {livePrice.source}
            </span>
          </div>
        )}

        {/* Row 4: sparkline */}
        <Sparkline ticks={ticks} />

        {/* Row 5: YES / NO price blocks */}
        <div className="flex gap-2">
          <PriceBlock side="yes" price={market.yes_price} />
          <PriceBlock side="no"  price={market.no_price}  />
        </div>

        {/* Row 6: live indicator + volume */}
        <div className="flex items-center justify-between">
          {isLive ? (
            <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: '#00C853' }}>
              <LiveDot size={7} />
              LIVE
            </span>
          ) : (
            <span className="text-xs font-semibold" style={{ color: 'var(--text-faint)' }}>
              {market.status.replace(/_/g, ' ')}
            </span>
          )}
          <span className="text-xs font-mono" style={{ color: 'var(--text-faint)' }}>
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
      style={{ backgroundColor: isYes ? 'rgba(0,200,83,0.10)' : 'rgba(224,92,32,0.08)' }}
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

  const trend = prices[prices.length - 1]! > prices[0]! ? '#00C853' : '#E05C20'

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
        stroke={trend}
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
