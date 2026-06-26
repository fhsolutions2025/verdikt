'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/shared/Toast'
import type { Market, MarketCategory, MarketStatus } from '@/lib/types'

interface Props {
  playerId:           string
  initialSubmissions: Market[]
}

const CATEGORIES: { key: MarketCategory; label: string }[] = [
  { key: 'sports',          label: 'Sports' },
  { key: 'finance',         label: 'Finance' },
  { key: 'politics',        label: 'Politics' },
  { key: 'current_affairs', label: 'Current Affairs' },
  { key: 'custom',          label: 'Custom' },
]

// Default close date: 30 days out, formatted for <input type="date">
function defaultCloseDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}

export function CreateMarketClient({ playerId, initialSubmissions }: Props) {
  const [question, setQuestion]       = useState('')
  const [category, setCategory]       = useState<MarketCategory>('sports')
  const [closesAt, setClosesAt]       = useState(defaultCloseDate())
  const [gut, setGut]                 = useState(50)
  const [loading, setLoading]         = useState(false)
  const [submissions, setSubmissions] = useState<Market[]>(initialSubmissions)
  const supabase                      = createClient()
  const { toast }                     = useToast()

  // Keep the player's submission list live as it moves through review.
  useEffect(() => {
    const channel = supabase
      .channel('my-submissions')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'markets', filter: `created_by=eq.${playerId}` },
        payload => {
          const updated = payload.new as Market
          setSubmissions(prev => prev.map(m => m.id === updated.id ? updated : m))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [playerId])

  const trimmed   = question.trim()
  const canSubmit = trimmed.length >= 10 && closesAt !== '' && !loading

  async function submit() {
    if (!canSubmit) return
    setLoading(true)

    // Close at end of the selected day, in the user's local timezone.
    const closeIso = new Date(`${closesAt}T23:59:00`).toISOString()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('submit_player_market', {
      p_player_id:     playerId,
      p_question:      trimmed,
      p_category:      category,
      p_closes_at:     closeIso,
      p_gut_yes_price: gut,
    }) as { data: { market_id: string; status: MarketStatus } | null; error: { message: string } | null }

    setLoading(false)

    if (error || !data) {
      toast(error?.message ?? 'Submission failed', 'error')
      return
    }

    // Optimistically prepend the new submission so the player sees it instantly.
    const now = new Date().toISOString()
    const optimistic: Market = {
      id:                data.market_id,
      question:          trimmed,
      category,
      fee_category:      'user_created',
      bundle_id:         null,
      yes_price:         gut,
      no_price:          100 - gut,
      ai_confidence:     null,
      status:            data.status,
      resolution_source: null,
      closes_at:         closeIso,
      resolved_at:       null,
      outcome:           null,
      volume:            0,
      est_volume:        null,
      spread_cents:      2,
      created_by:               playerId,
      creator_type:             'player_mm',
      created_at:               now,
      updated_at:               now,
      player_original_question: null,
      rejection_reason:         null,
    }
    setSubmissions(prev => [optimistic, ...prev])

    toast('Submitted — our engine is drafting your market', 'success')
    setQuestion('')
    setGut(50)
    setClosesAt(defaultCloseDate())

    // Kick off AI normalization immediately rather than waiting for the 2-min cron.
    fetch('/api/normalize-byv', { method: 'POST' }).catch(() => {})
  }

  return (
    <div className="max-w-[420px] mx-auto px-4 pt-6 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="font-bold text-xl" style={{ color: 'var(--text-strong)' }}>
          Bring Your Verdikt
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
          Submit any yes/no question. Our engine drafts it into a tradeable
          market, then a market maker reviews it before it goes live.
        </p>
      </div>

      {/* Form */}
      <div
        className="rounded-2xl p-5 space-y-5"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        {/* Question */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>
            Your question
          </label>
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            rows={3}
            placeholder="Will Arsenal win the Premier League this season?"
            className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none"
            style={{
              backgroundColor: 'var(--bg-base)',
              border: '1px solid var(--border)',
              color: 'var(--text-strong)',
              fontFamily: 'inherit',
            }}
          />
          <p className="text-xs" style={{ color: trimmed.length >= 10 ? 'var(--text-faint)' : '#E05C20' }}>
            {trimmed.length < 10
              ? `Add at least ${10 - trimmed.length} more character${10 - trimmed.length === 1 ? '' : 's'}`
              : 'Must resolve to a clear yes or no.'}
          </p>
        </div>

        {/* Category */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>
            Category
          </label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(c => {
              const active = category === c.key
              return (
                <button
                  key={c.key}
                  onClick={() => setCategory(c.key)}
                  className="px-3 py-1.5 rounded-full text-xs font-bold transition-all"
                  style={{
                    backgroundColor: active ? '#00C853' : 'var(--bg-inset)',
                    color:           active ? '#FFFFFF' : 'var(--text-dim)',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {c.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Close date */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>
            Closes on
          </label>
          <input
            type="date"
            value={closesAt}
            min={new Date().toISOString().slice(0, 10)}
            onChange={e => setClosesAt(e.target.value)}
            className="w-full px-4 py-3 rounded-xl text-sm outline-none"
            style={{
              backgroundColor: 'var(--bg-base)',
              border: '1px solid var(--border)',
              color: 'var(--text-strong)',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Gut probability */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>
              Your gut: chance of YES
            </label>
            <span className="font-mono font-bold text-sm" style={{ color: '#00A844' }}>
              {gut}%
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={99}
            value={gut}
            onChange={e => setGut(parseInt(e.target.value, 10))}
            className="w-full"
            style={{ accentColor: '#00C853' }}
          />
          <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
            This sets the market&apos;s opening price. The engine may adjust it.
          </p>
        </div>

        {/* Submit */}
        <button
          onClick={submit}
          disabled={!canSubmit}
          className="w-full py-3.5 rounded-xl font-bold text-sm transition-all active:scale-[0.97]"
          style={{
            backgroundColor: canSubmit ? '#00C853' : 'var(--border)',
            color:           canSubmit ? '#FFFFFF' : 'var(--text-faint)',
            border: 'none',
            cursor:          canSubmit ? (loading ? 'wait' : 'pointer') : 'not-allowed',
          }}
        >
          {loading ? 'Submitting…' : 'Submit for review'}
        </button>
      </div>

      {/* My submissions */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>
          My Submissions
        </h2>
        {submissions.length === 0 ? (
          <div
            className="rounded-2xl p-6 text-center"
            style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
          >
            <p className="text-sm" style={{ color: 'var(--text-faint)' }}>
              Nothing submitted yet. Your markets will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {submissions.map(m => (
              <div
                key={m.id}
                className="rounded-2xl p-4 space-y-2"
                style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
              >
                <p className="text-sm font-medium leading-snug" style={{ color: 'var(--text-strong)' }}>
                  {m.player_original_question ?? m.question}
                </p>
                <div className="flex items-center justify-between">
                  <StatusPill status={m.status} />
                  <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                    Closes {new Date(m.closes_at).toLocaleDateString()}
                  </span>
                </div>
                {m.status === 'voided' && m.rejection_reason && (
                  <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(220,38,38,0.10)', color: '#DC2626' }}>
                    {m.rejection_reason}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const STATUS_META: Record<MarketStatus, { label: string; bg: string; fg: string; pulse?: boolean }> = {
  pending_ai:         { label: 'AI Reviewing…',           bg: 'rgba(99,102,241,0.10)', fg: '#4338CA', pulse: true },
  ai_ready:           { label: 'Awaiting Company Review', bg: 'rgba(245,158,11,0.14)', fg: '#D29922' },
  pending_mm_review:  { label: 'Awaiting MM Approval',   bg: 'rgba(245,158,11,0.14)', fg: '#D29922' },
  pending_compliance: { label: 'In compliance',           bg: 'rgba(245,158,11,0.14)', fg: '#D29922' },
  live:               { label: 'Live ✓',                  bg: 'rgba(0,200,83,0.16)', fg: '#16A34A' },
  resolved:           { label: 'Resolved',                bg: 'var(--bg-inset)', fg: 'var(--text-dim)' },
  voided:             { label: 'Not accepted',            bg: 'rgba(220,38,38,0.10)', fg: '#DC2626' },
}

function StatusPill({ status }: { status: MarketStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.pending_ai
  return (
    <span
      className={`text-xs font-bold px-2.5 py-1 rounded-full${meta.pulse ? ' animate-pulse' : ''}`}
      style={{ backgroundColor: meta.bg, color: meta.fg }}
    >
      {meta.label}
    </span>
  )
}
