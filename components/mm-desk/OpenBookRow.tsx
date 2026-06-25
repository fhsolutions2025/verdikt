'use client'

import { useState } from 'react'
import { Market } from '@/lib/types'
import { BalanceBar } from '@/components/shared/BalanceBar'
import { capitalAtRisk, isMarketImbalanced } from '@/lib/calculations'
import { CountdownTimer } from '@/components/shared/CountdownTimer'

interface Props {
  market: Market
}

export function OpenBookRow({ market }: Props) {
  const [hedgeOpen, setHedgeOpen] = useState(false)
  const yesCap    = market.yes_price
  const noCap     = market.no_price
  const atRisk    = capitalAtRisk(yesCap, noCap)
  const imbalanced = isMarketImbalanced(market.yes_price)

  // §5.1 — MM audience: explain the signal as an action, not just a label
  const heavySide   = market.yes_price > 50 ? 'YES' : 'NO'
  const heavyPrice  = market.yes_price > 50 ? market.yes_price : market.no_price
  const hedgeNote   = `Book is skewed ${heavySide} (${heavyPrice}¢). Widen spread or reduce ${heavySide} exposure to rebalance.`

  return (
    <div
      className="p-5 rounded-2xl space-y-3"
      style={{
        backgroundColor: '#FFFFFF',
        border: `1px solid ${imbalanced ? '#E05C2040' : '#E5E7EB'}`,
      }}
    >
      {/* Question */}
      <p className="text-sm font-bold leading-snug" style={{ color: '#111A11' }}>
        {market.question}
      </p>

      {/* Price chips */}
      <div className="flex gap-2">
        <PriceChip side="yes" price={market.yes_price} />
        <PriceChip side="no"  price={market.no_price}  />
      </div>

      {/* Balance bar */}
      <BalanceBar
        yesPrice={market.yes_price}
        isImbalanced={imbalanced}
        portal="mm-desk"
      />

      {/* §5.1 — Expandable hedge note on flagged rows, collapsed by default */}
      {imbalanced && (
        <div>
          <button
            onClick={() => setHedgeOpen(o => !o)}
            className="text-xs font-bold"
            style={{ color: '#E05C20', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            {hedgeOpen ? '▲ Hide guidance' : '▼ Hedge guidance'}
          </button>
          {hedgeOpen && (
            <p
              className="mt-1.5 text-xs leading-snug rounded-lg px-3 py-2"
              style={{ backgroundColor: '#FFF8F0', color: '#92400E' }}
            >
              {hedgeNote}
            </p>
          )}
        </div>
      )}

      {/* Metadata row */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        <span className="font-mono" style={{ color: '#6B7280' }}>
          Spread: <strong style={{ color: '#111A11' }}>{market.spread_cents}¢</strong>
        </span>
        <span className="font-mono" style={{ color: '#6B7280' }}>
          Exposure: <strong style={{ color: '#111A11' }}>{atRisk.toFixed(0)}</strong>
        </span>
        <span className="font-mono" style={{ color: '#6B7280' }}>
          Vol: <strong style={{ color: '#111A11' }}>{market.volume.toFixed(0)}</strong>
        </span>
        <CountdownTimer closesAt={market.closes_at} />
      </div>
    </div>
  )
}

function PriceChip({ side, price }: { side: 'yes' | 'no'; price: number }) {
  const isYes = side === 'yes'
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
      style={{
        backgroundColor: isYes ? '#F0FFF4' : '#FFF8F0',
      }}
    >
      <span
        className="text-xs font-bold uppercase"
        style={{ color: isYes ? '#00A844' : '#E05C20' }}
      >
        {side}
      </span>
      <span
        className="font-mono font-bold"
        style={{ fontSize: 18, color: isYes ? '#00A844' : '#E05C20' }}
      >
        {price}¢
      </span>
    </div>
  )
}
