'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Market, RiskMarket } from '@/lib/types'
import { BalanceBar } from '@/components/shared/BalanceBar'
import { useToast } from '@/components/shared/Toast'

interface Props {
  initial: RiskMarket[]
}

type Outcome = 'yes' | 'no' | 'void'

// Apply the same formula as v_market_risk_status to inbound Realtime market rows.
// Realtime subscribes to the markets table (views are not subscribable);
// this keeps in-memory state consistent with what the view returns.
function toRiskMarket(m: Market): RiskMarket {
  const imbalanced = m.yes_price > 70 || m.yes_price < 30
  return {
    ...m,
    is_imbalanced: imbalanced,
    risk_tier:     imbalanced ? 'orange' : 'green',
  }
}

export function MarketRiskMonitor({ initial }: Props) {
  const [markets, setMarkets]        = useState<RiskMarket[]>(initial)
  const [resolving, setResolving]    = useState<RiskMarket | null>(null)
  const [outcome, setOutcome]        = useState<Outcome>('yes')
  const [confirmLoading, setConfirm] = useState(false)
  const supabase                     = createClient()
  const { toast }                    = useToast()

  useEffect(() => {
    const channel = supabase
      .channel('market-risk-monitor')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'markets' },
        payload => {
          const updated = toRiskMarket(payload.new as Market)
          setMarkets(prev => {
            if (updated.status !== 'live') return prev.filter(m => m.id !== updated.id)
            const exists = prev.some(m => m.id === updated.id)
            return exists
              ? prev.map(m => m.id === updated.id ? updated : m)
              : [...prev, updated]
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const flagged = markets.filter(m => m.is_imbalanced)

  async function confirmResolve() {
    if (!resolving) return
    setConfirm(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc('resolve_market', {
      p_market_id: resolving.id,
      p_outcome:   outcome,
    }) as { error: { message: string } | null }
    setConfirm(false)
    if (error) {
      toast(`Resolution failed: ${error.message}`, 'error')
    } else {
      toast(`Market resolved — ${outcome.toUpperCase()}`, 'success')
      setMarkets(prev => prev.filter(m => m.id !== resolving.id))
      setResolving(null)
    }
  }

  return (
    <>
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border)',
        }}
      >
        <div
          className="px-5 py-4 flex items-center justify-between border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <h2
              className="text-xs font-bold uppercase tracking-widest"
              style={{ color: 'var(--text-dim)', letterSpacing: '0.08em' }}
            >
              Market Risk Monitor
            </h2>
            <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
              — {markets.length} market{markets.length !== 1 ? 's' : ''}
            </span>
          </div>
          {flagged.length > 0 && (
            <span
              className="text-xs font-bold px-2.5 py-1 rounded-full"
              style={{ backgroundColor: '#E05C2020', color: '#E05C20' }}
            >
              {flagged.length} flagged
            </span>
          )}
        </div>

        <div className="divide-y" style={{ borderColor: 'var(--border-faint)' }}>
          {markets.map(market => (
            <div key={market.id} className="px-5 py-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p
                  className="text-sm font-medium leading-snug"
                  style={{ color: 'var(--text)', maxWidth: '60%' }}
                >
                  {market.question}
                </p>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: 'var(--text-faintest)', color: 'var(--text-muted)' }}
                  >
                    {market.category}
                  </span>
                  <button
                    onClick={() => { setResolving(market); setOutcome('yes') }}
                    className="text-xs font-bold px-2.5 py-1 rounded-lg transition-all active:scale-95"
                    style={{
                      backgroundColor: 'transparent',
                      color: 'var(--text-dim)',
                      border: '1px solid rgba(255,255,255,0.18)',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = '#00C853'
                      ;(e.currentTarget as HTMLButtonElement).style.color = '#00C853'
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.18)'
                      ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-dim)'
                    }}
                  >
                    Resolve
                  </button>
                </div>
              </div>
              <BalanceBar
                yesPrice={market.yes_price}
                isImbalanced={market.is_imbalanced}
                portal="company"
              />
              {/* §5.1 — Company audience: explain what happened, not just the badge */}
              {market.is_imbalanced && (
                <p className="text-xs leading-snug" style={{ color: '#E05C2080' }}>
                  YES price at {market.yes_price.toFixed(1)}¢ — one side holding{' '}
                  {(market.yes_price > 50 ? market.yes_price : market.no_price).toFixed(1)}% of risk.
                  Review in MM Desk if no reprice in last 30 min.
                </p>
              )}
              <div className="flex items-center gap-4 text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
                <span>Vol: {market.volume.toFixed(0)}</span>
              </div>
            </div>
          ))}

          {markets.length === 0 && (
            <p className="px-5 py-6 text-sm" style={{ color: 'var(--text-dim)' }}>
              No live markets.
            </p>
          )}
        </div>
      </div>

      {/* Resolve confirmation modal */}
      {resolving && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          onClick={e => { if (e.target === e.currentTarget) setResolving(null) }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6 space-y-5"
            style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-strong)' }}
          >
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>
                Resolve Market
              </p>
              <p className="text-sm font-medium leading-snug" style={{ color: 'var(--text)' }}>
                {resolving.question}
              </p>
            </div>

            {/* Outcome picker */}
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase" style={{ color: 'var(--text-dim)' }}>Select outcome</p>
              <div className="grid grid-cols-3 gap-2">
                {(['yes', 'no', 'void'] as Outcome[]).map(o => (
                  <button
                    key={o}
                    onClick={() => setOutcome(o)}
                    className="py-3 rounded-xl text-sm font-bold transition-all"
                    style={{
                      backgroundColor: outcome === o
                        ? o === 'yes' ? '#00C853' : o === 'no' ? '#E05C20' : 'var(--text-faint)'
                        : 'var(--bg-inset)',
                      color: outcome === o ? '#FFFFFF' : 'var(--text-dim)',
                      border: `1px solid ${outcome === o ? 'transparent' : 'var(--border)'}`,
                      cursor: 'pointer',
                    }}
                  >
                    {o.toUpperCase()}
                  </button>
                ))}
              </div>
              <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                {outcome === 'yes' && 'YES holders paid 1.00 per share. NO holders lose stake.'}
                {outcome === 'no'  && 'NO holders paid 1.00 per share. YES holders lose stake.'}
                {outcome === 'void' && 'All positions refunded at entry value. No winners or losers.'}
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setResolving(null)}
                className="flex-1 py-3 rounded-xl text-sm font-bold"
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border-strong)',
                  color: 'var(--text-dim)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmResolve}
                disabled={confirmLoading}
                className="flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.97]"
                style={{
                  backgroundColor: confirmLoading ? 'var(--text-faintest)'
                    : outcome === 'yes' ? '#00C853'
                    : outcome === 'no'  ? '#E05C20'
                    : 'var(--text-faint)',
                  color: confirmLoading ? 'var(--text-dim)' : '#FFFFFF',
                  border: 'none',
                  cursor: confirmLoading ? 'wait' : 'pointer',
                }}
              >
                {confirmLoading ? 'Resolving…' : `Confirm ${outcome.toUpperCase()}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
