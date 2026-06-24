'use client'

import { useEffect, useState } from 'react'
import { Position, Market } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/shared/Toast'

type PositionWithMarket = Position & { markets: Pick<Market, 'id' | 'question' | 'yes_price' | 'no_price' | 'status' | 'closes_at' | 'category'> }

interface Props {
  initialPositions: PositionWithMarket[]
  playerId:         string
}

export function PositionsClient({ initialPositions, playerId }: Props) {
  const [positions, setPositions] = useState<PositionWithMarket[]>(initialPositions)
  const [selling, setSelling]     = useState<string | null>(null)
  const supabase                  = createClient()
  const { toast }                 = useToast()

  // Live P&L updates when market prices change
  useEffect(() => {
    const channel = supabase
      .channel('positions-markets-feed')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'markets' },
        payload => {
          const updated = payload.new as Market
          setPositions(prev =>
            prev.map(p =>
              p.market_id === updated.id
                ? { ...p, markets: { ...p.markets, yes_price: updated.yes_price, no_price: updated.no_price } }
                : p
            )
          )
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'positions' },
        payload => {
          const updated = payload.new as Position
          if (updated.status !== 'open') {
            setPositions(prev => prev.filter(p => p.id !== updated.id))
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  async function sellPosition(positionId: string) {
    setSelling(positionId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('sell_position', {
      p_position_id: positionId,
      p_player_id:   playerId,
    }) as { data: { realized_pnl: number; sale_value: number; new_balance: number } | null; error: { message: string } | null }
    setSelling(null)

    if (error || !data) {
      toast(error?.message ?? 'Unknown error', 'error')
      return
    }

    toast(`Sold · P&L: ${data.realized_pnl >= 0 ? '+' : ''}${data.realized_pnl.toFixed(2)}`, 'success')
    setPositions(prev => prev.filter(p => p.id !== positionId))
  }

  if (positions.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="font-bold text-sm" style={{ color: '#374151' }}>No open positions</p>
        <p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>
          Place a trade from the Markets tab to get started.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {positions.map(pos => {
        const m = pos.markets
        const currPrice   = pos.side === 'yes' ? m.yes_price : m.no_price
        const currValue   = pos.shares * (currPrice / 100)
        const pnl         = currValue - pos.entry_value
        const pnlPct      = (pnl / pos.entry_value) * 100
        const isProfit    = pnl >= 0
        const isYes       = pos.side === 'yes'
        const isSelling   = selling === pos.id

        return (
          <div
            key={pos.id}
            className="rounded-2xl p-4 space-y-3"
            style={{ backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB' }}
          >
            {/* Market question */}
            <p className="text-sm font-bold leading-snug" style={{ color: '#111A11' }}>
              {m.question}
            </p>

            {/* Side badge */}
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-bold uppercase px-2.5 py-1 rounded-full"
                style={{
                  backgroundColor: isYes ? '#F0FFF4' : '#FFF8F0',
                  color:           isYes ? '#00A844' : '#E05C20',
                }}
              >
                {pos.side.toUpperCase()} · {pos.shares.toFixed(2)} shares
              </span>
            </div>

            {/* P&L grid */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <PnlCell
                label="Entry"
                value={`${pos.entry_price.toFixed(0)}¢`}
                mono
              />
              <PnlCell
                label="Current"
                value={`${currPrice.toFixed(0)}¢`}
                mono
                color={isYes ? '#00A844' : '#E05C20'}
              />
              <PnlCell
                label="P&L"
                value={`${isProfit ? '+' : ''}${pnl.toFixed(2)}`}
                mono
                color={isProfit ? '#00A844' : '#DC2626'}
                sub={`${isProfit ? '+' : ''}${pnlPct.toFixed(1)}%`}
              />
            </div>

            {/* Sell button */}
            <button
              onClick={() => sellPosition(pos.id)}
              disabled={isSelling}
              className="w-full py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
              style={{
                backgroundColor: isSelling ? '#E5E7EB' : 'transparent',
                color:           isSelling ? '#9CA3AF' : '#374151',
                border:          `1px solid ${isSelling ? '#E5E7EB' : '#D1D5DB'}`,
                cursor:          isSelling ? 'wait' : 'pointer',
              }}
            >
              {isSelling ? 'Selling…' : `Sell at ${currPrice.toFixed(0)}¢`}
            </button>
          </div>
        )
      })}
    </div>
  )
}

function PnlCell({
  label, value, mono = false, color, sub,
}: {
  label: string; value: string; mono?: boolean; color?: string; sub?: string
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs" style={{ color: '#9CA3AF' }}>{label}</p>
      <p
        className={mono ? 'font-mono font-bold text-sm' : 'font-bold text-sm'}
        style={{ color: color ?? '#111A11' }}
      >
        {value}
      </p>
      {sub && <p className="font-mono text-xs" style={{ color }}>{sub}</p>}
    </div>
  )
}
