'use client'

import { useEffect, useState } from 'react'
import { Market } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/shared/Toast'
import { Tooltip } from '@/components/shared/Tooltip'

interface Props {
  initial: Market[]
}

export function PendingReviewSection({ initial }: Props) {
  const [markets, setMarkets]       = useState<Market[]>(initial)
  const supabase                    = createClient()

  useEffect(() => {
    const channel = supabase
      .channel('pending-review-markets')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'markets' },
        payload => {
          const updated = payload.new as Market
          if (updated.status === 'ai_ready' && updated.creator_type === 'player_mm') {
            setMarkets(prev => {
              const exists = prev.some(m => m.id === updated.id)
              return exists
                ? prev.map(m => m.id === updated.id ? updated : m)
                : [updated, ...prev]
            })
          } else {
            // Market moved out of pending state (accepted / rejected)
            setMarkets(prev => prev.filter(m => m.id !== updated.id))
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  if (markets.length === 0) return null

  function remove(id: string) {
    setMarkets(prev => prev.filter(m => m.id !== id))
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: '#161B22',
        border: '1px solid rgba(255,165,0,0.3)',
      }}
    >
      {/* Header */}
      <div
        className="px-5 py-4 flex items-center gap-3 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.08)' }}
      >
        <h2
          className="text-xs font-bold uppercase tracking-widest"
          style={{ color: '#6B7280', letterSpacing: '0.08em' }}
        >
          Pending Review
        </h2>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: '#E05C2020', color: '#E05C20' }}
        >
          {markets.length}
        </span>
      </div>

      <div className="p-4 space-y-3">
        {markets.map(m => (
          <PendingCard key={m.id} market={m} onDone={remove} />
        ))}
      </div>
    </div>
  )
}

function PendingCard({ market, onDone }: { market: Market; onDone: (id: string) => void }) {
  const [loading, setLoading]         = useState<'accept' | 'reject' | null>(null)
  const [showReason, setShowReason]   = useState(false)
  const [reason, setReason]           = useState('')
  const supabase                      = createClient()
  const { toast }                     = useToast()

  const conf        = market.ai_confidence ?? 0
  const confColor   = conf >= 65 ? '#00C853' : '#E05C20'
  const daysToClose = Math.ceil(
    (new Date(market.closes_at).getTime() - Date.now()) / 86_400_000
  )
  const original = market.player_original_question ?? market.question

  async function accept() {
    setLoading('accept')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc('company_accept_submission', {
      p_market_id: market.id,
    })
    setLoading(null)
    if (error) {
      toast(`Failed: ${error.message}`, 'error')
    } else {
      toast('Sent to MM queue', 'success')
      onDone(market.id)
    }
  }

  async function reject() {
    if (!reason.trim()) { setShowReason(true); return }
    setLoading('reject')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc('company_reject_submission', {
      p_market_id: market.id,
      p_reason:    reason.trim(),
    })
    setLoading(null)
    if (error) {
      toast(`Failed: ${error.message}`, 'error')
    } else {
      toast('Submission rejected', 'success')
      onDone(market.id)
    }
  }

  return (
    <div
      style={{
        backgroundColor: '#0D1117',
        border: '1px solid rgba(255,165,0,0.3)',
        borderRadius: 14,
        padding: 16,
      }}
    >
      {/* Row 1: badges + timestamp */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: '#E05C2018', color: '#E05C20' }}
        >
          PLAYER SUBMISSION
        </span>
        <Tooltip content="≥65%: AI fully rewrites the question. 40–64%: question kept as-is, needs extra review. <40%: auto-voided." position="bottom">
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full cursor-default"
            style={{ backgroundColor: confColor + '18', color: confColor }}
          >
            AI {conf}%
          </span>
        </Tooltip>
        {daysToClose < 7 && (
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: '#E05C2018', color: '#E05C20' }}
          >
            ⚠ {daysToClose}d to close
          </span>
        )}
        <span className="text-xs ml-auto" style={{ color: '#4B5563' }}>
          {new Date(market.created_at).toLocaleTimeString('en-GB', {
            hour: '2-digit', minute: '2-digit',
          })}
        </span>
      </div>

      {/* Row 2: Original question */}
      <p className="text-xs mb-1" style={{ color: '#6B7280' }}>
        Original: <span style={{ color: '#9CA3AF' }}>{original}</span>
      </p>

      {/* Row 3: AI cleaned question */}
      <p className="text-sm font-bold leading-snug mb-3" style={{ color: '#FFFFFF' }}>
        AI: {market.question}
      </p>

      {/* Row 4: prices + resolution source */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="flex gap-2">
          <span
            className="font-mono text-sm font-bold px-2.5 py-1 rounded-lg"
            style={{ backgroundColor: '#00C85318', color: '#00C853' }}
          >
            YES {market.yes_price.toFixed(1)}¢
          </span>
          <span
            className="font-mono text-sm font-bold px-2.5 py-1 rounded-lg"
            style={{ backgroundColor: '#E05C2018', color: '#E05C20' }}
          >
            NO {market.no_price.toFixed(1)}¢
          </span>
        </div>
        {market.resolution_source && (
          <span className="text-xs" style={{ color: '#4B5563' }}>
            via {market.resolution_source}
          </span>
        )}
      </div>

      {/* Row 5: actions */}
      <div className="flex flex-col gap-2">
        <button
          onClick={accept}
          disabled={loading !== null}
          style={{
            width: '100%',
            backgroundColor: loading === 'accept' ? '#374151' : '#00A844',
            color: '#FFFFFF',
            borderRadius: 10,
            padding: 14,
            border: 'none',
            fontSize: 13,
            fontWeight: 800,
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading === 'accept' ? 'Accepting…' : 'ACCEPT & SEND TO MM →'}
        </button>

        {showReason ? (
          <div className="space-y-2">
            <input
              autoFocus
              type="text"
              placeholder="Reason for rejection…"
              value={reason}
              onChange={e => setReason(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && reject()}
              style={{
                width: '100%',
                backgroundColor: '#161B22',
                border: '1.5px solid #DC2626',
                color: '#FFFFFF',
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 13,
                fontFamily: 'inherit',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={reject}
                disabled={!reason.trim() || loading !== null}
                style={{
                  flex: 1,
                  backgroundColor: loading === 'reject' ? '#374151' : 'transparent',
                  border: '1.5px solid #DC2626',
                  color: loading === 'reject' ? '#6B7280' : '#DC2626',
                  borderRadius: 10,
                  padding: 12,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: loading ? 'wait' : 'pointer',
                }}
              >
                {loading === 'reject' ? 'Rejecting…' : 'Confirm Reject'}
              </button>
              <button
                onClick={() => setShowReason(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#6B7280',
                  borderRadius: 10,
                  padding: '12px 16px',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowReason(true)}
            disabled={loading !== null}
            style={{
              width: '100%',
              backgroundColor: 'transparent',
              border: '1.5px solid #DC2626',
              color: '#DC2626',
              borderRadius: 10,
              padding: 12,
              fontSize: 13,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            Reject
          </button>
        )}
      </div>
    </div>
  )
}
