'use client'

import { useState } from 'react'
import { Market, FeeConfig } from '@/lib/types'
import { tradePreview } from '@/lib/calculations'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/shared/Toast'

interface Props {
  market:    Market
  feeConfig: FeeConfig | null
  playerId:  string
  onTraded:  (result: { newYesPrice: number; newNoPrice: number }) => void
}

export function TradeTicket({ market, feeConfig, playerId, onTraded }: Props) {
  const [side, setSide]     = useState<'yes' | 'no'>('yes')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase              = createClient()
  const { toast }             = useToast()

  const feeRate = feeConfig ? feeConfig.taker_fee_pct / 100 : 0.0075
  const amountNum = parseFloat(amount) || 0

  const preview = amountNum > 0
    ? tradePreview(amountNum, market.yes_price, market.no_price, side, feeRate)
    : null

  async function confirmTrade() {
    if (!preview || amountNum <= 0) return
    setLoading(true)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('execute_trade', {
      p_market_id:   market.id,
      p_taker_id:    playerId,
      p_side:        side,
      p_amount:      amountNum,
      p_is_simulated: false,
    }) as { data: { new_yes_price: number; new_no_price: number } | null; error: { message: string } | null }

    setLoading(false)

    if (error || !data) {
      toast(error?.message ?? 'Unknown error', 'error')
      return
    }

    toast(`Trade confirmed — ${preview.shares} ${side.toUpperCase()} shares`, 'success')
    setAmount('')
    onTraded({ newYesPrice: data.new_yes_price, newNoPrice: data.new_no_price })
  }

  return (
    <div
      className="sticky bottom-0 p-4 space-y-3"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderTop: '2px solid var(--border)',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.06)',
      }}
    >
      {/* Side toggle */}
      <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <SideButton
          label="YES"
          active={side === 'yes'}
          onClick={() => setSide('yes')}
          activeColor="#00C853"
        />
        <SideButton
          label="NO"
          active={side === 'no'}
          onClick={() => setSide('no')}
          activeColor="#E05C20"
        />
      </div>

      {/* Amount input */}
      <div
        className="rounded-xl px-4 py-3 flex items-center"
        style={{ backgroundColor: 'var(--bg-base)' }}
      >
        <input
          type="number"
          inputMode="numeric"
          placeholder="0"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          className="flex-1 bg-transparent font-mono font-bold text-2xl text-center outline-none"
          style={{ color: 'var(--text-strong)', minWidth: 0 }}
          min={0}
        />
      </div>

      {/* Calculation block — MANDATORY per PRD §3.3 */}
      {preview && (
        <div
          className="rounded-xl px-4 py-3 space-y-2"
          style={{ backgroundColor: 'var(--bg-base)' }}
        >
          <CalcRow label="Shares received"    value={preview.shares.toFixed(2)}      mono />
          <CalcRow label="Potential payout"   value={preview.potentialPayout.toFixed(2)} mono />
          <div className="border-t pt-2" style={{ borderColor: 'var(--border)' }} />
          <CalcRow
            label="Fee"
            value={preview.fee.toFixed(2)}
            mono
            color="#E05C20"
          />
          <CalcRow
            label="Total cost"
            value={preview.totalCost.toFixed(2)}
            mono
            bold
          />
        </div>
      )}

      {/* Confirm button */}
      <button
        onClick={confirmTrade}
        disabled={!preview || loading || amountNum <= 0}
        className="w-full py-3.5 rounded-xl font-bold text-sm transition-all active:scale-[0.97]"
        style={{
          backgroundColor: !preview || amountNum <= 0 ? 'var(--border)' : '#00C853',
          color:            !preview || amountNum <= 0 ? 'var(--text-faint)' : '#FFFFFF',
          cursor:           !preview || amountNum <= 0 ? 'not-allowed' : loading ? 'wait' : 'pointer',
          border: 'none',
        }}
      >
        {loading ? 'Confirming…' : `Buy ${side.toUpperCase()}`}
      </button>

      {/* Safe-bet disclosure */}
      <p className="text-center text-xs" style={{ color: 'var(--text-faint)' }}>
        Fee: {(feeRate * 100).toFixed(2)}% · Payout per winning share: 1.00
      </p>
    </div>
  )
}

function SideButton({
  label, active, onClick, activeColor,
}: {
  label: string
  active: boolean
  onClick: () => void
  activeColor: string
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 py-2.5 font-bold text-sm transition-all"
      style={{
        backgroundColor: active ? activeColor : 'transparent',
        color:            active ? '#FFFFFF' : activeColor,
        border: 'none',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

function CalcRow({
  label, value, mono = false, color, bold = false,
}: {
  label: string
  value: string
  mono?: boolean
  color?: string
  bold?: boolean
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span
        className={mono ? 'font-mono text-sm' : 'text-sm'}
        style={{
          color:      color ?? 'var(--text-strong)',
          fontWeight: bold ? 700 : 600,
        }}
      >
        {value}
      </span>
    </div>
  )
}
