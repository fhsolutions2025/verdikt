'use client'

import { useState } from 'react'
import { Market } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { BalanceBar } from '@/components/shared/BalanceBar'
import { capitalAtRisk, isMarketImbalanced } from '@/lib/calculations'
import { CountdownTimer } from '@/components/shared/CountdownTimer'
import { useToast } from '@/components/shared/Toast'
import { Tooltip } from '@/components/shared/Tooltip'

interface Props {
  market: Market
}

export function OpenBookRow({ market }: Props) {
  const [hedgeOpen, setHedgeOpen]   = useState(false)
  const [localSpread, setLocalSpread] = useState(market.spread_cents)
  const [applying, setApplying]     = useState(false)
  const supabase                    = createClient()
  const { toast }                   = useToast()
  const yesCap    = market.yes_price
  const noCap     = market.no_price
  const atRisk    = capitalAtRisk(yesCap, noCap)
  const imbalanced = isMarketImbalanced(market.yes_price)

  async function applySpread() {
    setApplying(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc('update_market_spread', {
      p_market_id: market.id,
      p_spread:    localSpread,
    })
    setApplying(false)
    if (error) {
      toast(`Failed: ${error.message}`, 'error')
    } else {
      toast(`Spread updated to ${localSpread}¢`, 'success')
    }
  }

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
        <Tooltip content="Price in cents. YES + NO always = 100. Reflects the market's implied probability." position="bottom">
          <PriceChip side="yes" price={market.yes_price} />
        </Tooltip>
        <Tooltip content="Price in cents. YES + NO always = 100. Reflects the market's implied probability." position="bottom">
          <PriceChip side="no"  price={market.no_price}  />
        </Tooltip>
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
            <>
              <p
                className="mt-1.5 text-xs leading-snug rounded-lg px-3 py-2"
                style={{ backgroundColor: '#FFF8F0', color: '#92400E' }}
              >
                {hedgeNote}
              </p>
              {/* Spread adjustment control */}
              <div
                className="mt-2 flex items-center gap-3"
                style={{
                  backgroundColor: '#F0FFF4',
                  border: '1px solid #00C853',
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <span className="text-xs font-bold flex-shrink-0" style={{ color: '#111A11' }}>
                  Adjust Spread
                </span>
                <input
                  type="range"
                  min={0}
                  max={5}
                  step={0.5}
                  value={localSpread}
                  onChange={e => setLocalSpread(Number(e.target.value))}
                  style={{ flex: 1, accentColor: '#00C853' }}
                />
                <span className="font-mono text-xs font-bold flex-shrink-0" style={{ color: '#00A844' }}>
                  {localSpread}¢
                </span>
                <button
                  onClick={applySpread}
                  disabled={applying}
                  style={{
                    backgroundColor: applying ? '#E5E7EB' : '#00A844',
                    color:           applying ? '#9CA3AF' : '#FFFFFF',
                    borderRadius:    8,
                    padding:         '8px 16px',
                    border:          'none',
                    cursor:          applying ? 'wait' : 'pointer',
                    fontSize:        12,
                    fontWeight:      700,
                    flexShrink:      0,
                  }}
                >
                  {applying ? '…' : 'APPLY'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Metadata row */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        <Tooltip content="Bid-ask spread per share. You earn half on every trade. Wider = more income, less competitive pricing." position="top">
          <span className="font-mono cursor-default" style={{ color: '#6B7280' }}>
            Spread: <strong style={{ color: '#111A11' }}>{market.spread_cents}¢</strong>
          </span>
        </Tooltip>
        <Tooltip content="Capital at risk if all open positions resolve against the book." position="top">
          <span className="font-mono cursor-default" style={{ color: '#6B7280' }}>
            Exposure: <strong style={{ color: '#111A11' }}>{atRisk.toFixed(0)}</strong>
          </span>
        </Tooltip>
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
