'use client'

import { useState } from 'react'
import { Market } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { CountdownTimer } from '@/components/shared/CountdownTimer'
import { formatVolume } from '@/lib/calculations'
import { useToast } from '@/components/shared/Toast'
import { Tooltip } from '@/components/shared/Tooltip'

interface Props {
  market:     Market
  mmId:       string
  onApproved: (id: string) => void
  onRejected: (id: string) => void
}

export function AiReadyMarketCard({ market, mmId, onApproved, onRejected }: Props) {
  const [loading, setLoading]   = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const supabase                = createClient()
  const { toast }               = useToast()

  const confidenceColor =
    (market.ai_confidence ?? 0) >= 85 ? '#00A844' :
    (market.ai_confidence ?? 0) >= 65 ? '#E05C20' : '#DC2626'

  async function approve() {
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc('approve_ai_market', {
      p_market_id: market.id,
      p_mm_id:     mmId,
    })
    setLoading(false)
    if (error) {
      toast(`Approval failed: ${error.message}`, 'error')
    } else {
      toast('Market approved and seeded', 'success')
      onApproved(market.id)
    }
  }

  async function reject() {
    setRejecting(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc('reject_ai_market', {
      p_market_id: market.id,
      p_mm_id:     mmId,
    })
    setRejecting(false)
    if (error) {
      toast(`Rejection failed: ${error.message}`, 'error')
    } else {
      toast('Market rejected', 'success')
      onRejected(market.id)
    }
  }

  return (
    <div
      className="p-5 rounded-2xl space-y-3"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border)',
      }}
    >
      {/* Category + confidence */}
      <div className="flex items-center gap-2">
        <span
          className="text-xs font-bold uppercase px-2 py-0.5 rounded-full"
          style={{ backgroundColor: 'var(--bg-inset)', color: 'var(--text)', letterSpacing: '0.06em' }}
        >
          {market.category}
        </span>
        <Tooltip content="≥85% high confidence — approve freely. 65–84% moderate — review prices. <65% low — inspect carefully before approving." position="bottom">
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full cursor-default"
            style={{
              backgroundColor: confidenceColor + '18',
              color: confidenceColor,
            }}
          >
            Verdikt AI {market.ai_confidence?.toFixed(0)}%
          </span>
        </Tooltip>
        {market.status === 'pending_mm_review' && (
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: 'rgba(224,92,32,0.08)', color: '#E05C20' }}
          >
            Needs review
          </span>
        )}
      </div>

      {/* Question */}
      <p className="text-sm font-bold leading-snug" style={{ color: 'var(--text-strong)' }}>
        {market.question}
      </p>

      {/* Suggested price chips */}
      <div className="flex items-center gap-2">
        <div
          className="px-3 py-1.5 rounded-xl"
          style={{ backgroundColor: 'rgba(0,200,83,0.10)' }}
        >
          <span className="font-mono font-bold text-lg" style={{ color: '#00A844' }}>
            {market.yes_price.toFixed(1)}¢
          </span>
          <span className="text-xs ml-1" style={{ color: '#00A844' }}>YES</span>
        </div>
        <div
          className="px-3 py-1.5 rounded-xl"
          style={{ backgroundColor: 'rgba(224,92,32,0.08)' }}
        >
          <span className="font-mono font-bold text-lg" style={{ color: '#E05C20' }}>
            {market.no_price.toFixed(1)}¢
          </span>
          <span className="text-xs ml-1" style={{ color: '#E05C20' }}>NO</span>
        </div>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--text-dim)' }}>
        <span>
          Est. vol: <span className="font-mono font-semibold" style={{ color: 'var(--text)' }}>
            {market.est_volume ? formatVolume(market.est_volume) : '—'}
          </span>
        </span>
        <span>
          Spread: <span className="font-mono font-semibold" style={{ color: 'var(--text)' }}>
            {market.spread_cents}¢
          </span>
        </span>
        <CountdownTimer closesAt={market.closes_at} />
      </div>

      {market.resolution_source && (
        <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
          Source: {market.resolution_source}
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2 pt-1">
        <button
          onClick={approve}
          disabled={loading}
          className="w-full py-3 rounded-xl text-sm font-bold transition-all active:scale-98"
          style={{
            backgroundColor: loading ? 'var(--border)' : '#00C853',
            color: loading ? 'var(--text-faint)' : '#FFFFFF',
            cursor: loading ? 'wait' : 'pointer',
            border: 'none',
          }}
        >
          {loading ? 'Approving…' : 'Approve & Seed'}
        </button>
        <button
          onClick={reject}
          disabled={rejecting || loading}
          className="w-full py-3 rounded-xl text-sm font-bold transition-all"
          style={{
            backgroundColor: 'transparent',
            border: '2px solid #DC2626',
            color: rejecting ? 'var(--text-faint)' : '#DC2626',
            cursor: rejecting ? 'wait' : 'pointer',
          }}
        >
          {rejecting ? 'Rejecting…' : 'Reject'}
        </button>
      </div>
    </div>
  )
}
