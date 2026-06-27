'use client'

import Link from 'next/link'
import { Market, PriceTick } from '@/lib/types'
import { LiveDot } from '@/components/shared/LiveDot'
import { formatVolume } from '@/lib/calculations'
import { timeToClose } from '@/lib/marketTime'
import { useTheme } from '@/components/shared/ThemeProvider'
import { ThemeImage } from '@/components/shared/PageAssets'
import { thumbnailSlotCandidates } from '@/lib/pageAssets'

interface LivePrice { label: string; value: string; source: string }

interface Props {
  market:     Market
  ticks:      PriceTick[]
  livePrice?: LivePrice
  isHot?:     boolean
}

const CATEGORY_LABEL: Record<string, string> = {
  sports: 'Sports', finance: 'Finance', politics: 'Politics',
  current_affairs: 'News', custom: 'Custom',
}

// One status badge max — priority order.
function statusBadge(isHot: boolean, isNew: boolean): { label: string; color: string } | null {
  if (isHot) return { label: 'Hot', color: '#E05C20' }
  if (isNew) return { label: 'New', color: '#3B82F6' }
  return null
}

export function MarketCard({ market, ticks, livePrice, isHot = false }: Props) {
  const now      = Date.now()
  const isNew    = now - new Date(market.created_at).getTime() < 24 * 60 * 60 * 1000
  const ttc      = timeToClose(market.closes_at, now)
  const badge    = statusBadge(isHot, isNew)
  const prob     = Math.round(market.yes_price)

  const { skin } = useTheme()
  const isVisual = skin === 'visual'
  const thumbSlots = thumbnailSlotCandidates(market.id, market.category)

  // trend from ticks
  const prices = ticks.map(t => t.price)
  const up = prices.length >= 2 ? prices[prices.length - 1]! >= prices[0]! : true

  // 1 — meta row (tertiary): category · one status · time-to-expire
  const meta = (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold px-2 py-0.5 rounded-md" style={{ backgroundColor: 'var(--bg-inset)', color: 'var(--text-dim)' }}>
        {CATEGORY_LABEL[market.category] ?? market.category}
      </span>
      {badge && (
        <span className="text-xs font-bold px-2 py-0.5 rounded-md" style={{ backgroundColor: `${badge.color}1A`, color: badge.color }}>
          {badge.label}
        </span>
      )}
      <span className="ml-auto text-xs font-medium" style={{ color: ttc.closingSoon ? '#DC2626' : 'var(--text-faint)' }}>
        {ttc.text}
      </span>
    </div>
  )

  // 2 — question (primary)
  const question = (
    <p className="leading-snug line-clamp-2" style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-strong)' }}>
      {market.question}
    </p>
  )

  return (
    <Link href={`/player/${market.id}`} className="block">
      <div
        className="rounded-2xl transition-transform active:scale-[0.985]"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', cursor: 'pointer', padding: 16 }}
      >
        {isVisual ? (
          <div className="flex gap-3 items-start" style={{ marginBottom: 12 }}>
            <ThemeImage slot={thumbSlots} width={64} height={64} rounded={12} placeholderLabel={CATEGORY_LABEL[market.category] ?? ''} />
            <div className="flex-1 min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{meta}{question}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>{meta}{question}</div>
        )}

        {/* 3 — probability (primary) + movement (secondary) */}
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono font-bold" style={{ fontSize: 24, color: 'var(--text-strong)' }}>{prob}%</span>
            <span className="text-xs" style={{ color: 'var(--text-faint)' }}>chance</span>
          </div>
          <div style={{ width: 96 }}><Sparkline ticks={ticks} up={up} /></div>
        </div>

        {/* 4 — trade actions (secondary) */}
        <div className="flex gap-2" style={{ marginBottom: 12 }}>
          <PriceBlock side="yes" price={market.yes_price} />
          <PriceBlock side="no"  price={market.no_price}  />
        </div>

        {/* 5 — metadata (tertiary): live · volume (· underlying) */}
        <div className="flex items-center gap-2" style={{ fontSize: 11 }}>
          <span className="flex items-center gap-1 font-semibold" style={{ color: '#00A844' }}>
            <LiveDot size={6} /> Live
          </span>
          <span style={{ color: 'var(--text-faint)' }}>· Vol {formatVolume(market.volume)}</span>
          {livePrice && (
            <span className="ml-auto font-mono" style={{ color: 'var(--text-faint)' }}>
              {livePrice.label} {livePrice.value}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

function PriceBlock({ side, price }: { side: 'yes' | 'no'; price: number }) {
  const isYes = side === 'yes'
  const color = isYes ? '#00A844' : '#E05C20'
  return (
    <div
      className="flex-1 flex items-center justify-between rounded-xl"
      style={{ backgroundColor: isYes ? 'rgba(0,200,83,0.10)' : 'rgba(224,92,32,0.08)', padding: '10px 14px', minHeight: 44 }}
    >
      <span className="text-xs font-bold uppercase" style={{ color }}>{side}</span>
      <span className="font-mono font-bold" style={{ fontSize: 18, color }}>{price}¢</span>
    </div>
  )
}

function Sparkline({ ticks, up }: { ticks: PriceTick[]; up: boolean }) {
  if (ticks.length < 2) return <div style={{ height: 28 }} />
  const prices = ticks.map(t => t.price)
  const min = Math.min(...prices), max = Math.max(...prices), range = max - min || 1
  const W = 96, H = 28
  const points = prices.map((p, i) => `${(i / (prices.length - 1)) * W},${H - ((p - min) / range) * H}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke={up ? '#00C853' : '#E05C20'} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
