'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/shared/Toast'
import type { Position, Market, PositionStatus } from '@/lib/types'

type PositionWithMarket = Position & {
  markets: Pick<Market, 'id' | 'question' | 'yes_price' | 'no_price' | 'status' | 'closes_at' | 'category' | 'outcome'>
  isVega: boolean
}

type DateRange    = 'today' | '7d' | '30d' | 'all'
type StatusFilter = 'all' | 'open' | 'closed' | 'resolved'
type SourceFilter = 'all' | 'vega' | 'manual'

interface Props {
  initialPositions: PositionWithMarket[]
  playerId:         string
}

const STATUS_GROUPS: Record<StatusFilter, PositionStatus[]> = {
  all:      ['open', 'sold', 'resolved_won', 'resolved_lost', 'voided'],
  open:     ['open'],
  closed:   ['sold', 'voided'],
  resolved: ['resolved_won', 'resolved_lost'],
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function dayKey(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toISOString().slice(0, 10)
}

function currentPrice(pos: PositionWithMarket): number {
  return pos.side === 'yes' ? pos.markets.yes_price : pos.markets.no_price
}

function unrealisedPnl(pos: PositionWithMarket): number {
  const price = currentPrice(pos)
  return pos.shares * (price / 100) - pos.entry_value
}

function positionPnl(pos: PositionWithMarket): number | null {
  if (pos.status === 'open') return unrealisedPnl(pos)
  return pos.realized_pnl
}

export function PositionsClient({ initialPositions, playerId }: Props) {
  const [positions, setPositions] = useState<PositionWithMarket[]>(initialPositions)
  const [selling, setSelling]     = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<DateRange>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [search, setSearch]             = useState('')
  const supabase = createClient()
  const { toast } = useToast()

  // Live price + status updates
  useEffect(() => {
    const channel = supabase
      .channel('positions-bank-feed')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'markets' }, payload => {
        const updated = payload.new as Market
        setPositions(prev => prev.map(p =>
          p.market_id === updated.id
            ? { ...p, markets: { ...p.markets, yes_price: updated.yes_price, no_price: updated.no_price, status: updated.status ?? p.markets.status, outcome: updated.outcome ?? p.markets.outcome } }
            : p
        ))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'positions', filter: `player_id=eq.${playerId}` }, payload => {
        const updated = payload.new as Position
        setPositions(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p))
      })
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
    setPositions(prev => prev.map(p =>
      p.id === positionId ? { ...p, status: 'sold' as PositionStatus, realized_pnl: data.realized_pnl } : p
    ))
  }

  // ── Filtering ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const nowMs   = Date.now()
    const cutoffs: Record<DateRange, number | null> = {
      today: new Date().setHours(0, 0, 0, 0),
      '7d':  nowMs - 7 * 86_400_000,
      '30d': nowMs - 30 * 86_400_000,
      all:   null,
    }
    const cutoff = cutoffs[dateRange]
    const allowedStatuses = STATUS_GROUPS[statusFilter]
    const q = search.toLowerCase().trim()

    return positions.filter(p => {
      if (cutoff && new Date(p.entry_at).getTime() < cutoff) return false
      if (!allowedStatuses.includes(p.status)) return false
      if (sourceFilter === 'vega' && !p.isVega) return false
      if (sourceFilter === 'manual' && p.isVega) return false
      if (q && !p.markets.question.toLowerCase().includes(q)) return false
      return true
    })
  }, [positions, dateRange, statusFilter, sourceFilter, search])

  // ── Summary stats over ALL (unfiltered) positions ─────────────────────────
  const summary = useMemo(() => {
    const totalDeployed = positions.reduce((s, p) => s + p.entry_value, 0)
    const unrealised    = positions
      .filter(p => p.status === 'open')
      .reduce((s, p) => s + unrealisedPnl(p), 0)
    const realised = positions
      .filter(p => p.status !== 'open' && p.realized_pnl != null)
      .reduce((s, p) => s + (p.realized_pnl ?? 0), 0)
    const won  = positions.filter(p => p.status === 'resolved_won').length
    const lost = positions.filter(p => p.status === 'resolved_lost').length
    const winRate = won + lost > 0 ? won / (won + lost) : null
    return { totalDeployed, unrealised, realised, winRate }
  }, [positions])

  // ── Group by day ────────────────────────────────────────────────────────────
  const days = useMemo(() => {
    const map = new Map<string, PositionWithMarket[]>()
    for (const p of filtered) {
      const k = dayKey(p.entry_at)
      const arr = map.get(k) ?? []
      arr.push(p)
      map.set(k, arr)
    }
    return Array.from(map.entries()).map(([key, rows]) => {
      const dayPnl = rows.reduce((s, p) => {
        const pnl = positionPnl(p)
        return s + (pnl ?? 0)
      }, 0)
      return { key, label: dayLabel(rows[0].entry_at), rows, dayPnl }
    })
  }, [filtered])

  const fmt = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}`

  return (
    <div>
      {/* ── Summary bar ── */}
      <div
        className="grid grid-cols-4 gap-2 mb-4 p-3 rounded-2xl"
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <SummaryCell label="Deployed"    value={summary.totalDeployed.toFixed(2)} />
        <SummaryCell label="Unrealised"  value={fmt(summary.unrealised)} color={summary.unrealised >= 0 ? '#00A844' : '#DC2626'} />
        <SummaryCell label="Realised"    value={fmt(summary.realised)}   color={summary.realised >= 0 ? '#00A844' : '#DC2626'} />
        <SummaryCell label="Win rate"    value={summary.winRate != null ? `${(summary.winRate * 100).toFixed(0)}%` : '—'} />
      </div>

      {/* ── Date filters ── */}
      <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
        {(['today', '7d', '30d', 'all'] as DateRange[]).map(r => (
          <FilterPill key={r} label={r === 'today' ? 'Today' : r === 'all' ? 'All time' : r} active={dateRange === r} onClick={() => setDateRange(r)} />
        ))}
      </div>

      {/* ── Status + source filters ── */}
      <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
        {(['all', 'open', 'closed', 'resolved'] as StatusFilter[]).map(s => (
          <FilterPill key={s} label={s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)} active={statusFilter === s} onClick={() => setStatusFilter(s)} />
        ))}
      </div>
      <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
        {(['all', 'vega', 'manual'] as SourceFilter[]).map(s => (
          <FilterPill key={s} label={s === 'all' ? 'All sources' : s === 'vega' ? '★ Vega' : 'Manual'} active={sourceFilter === s} onClick={() => setSourceFilter(s)} />
        ))}
      </div>

      {/* ── Search ── */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: 'var(--text-faint)' }}>
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        <input
          type="text"
          placeholder="Search markets…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            outline: 'none',
          }}
        />
      </div>

      {/* ── Empty state ── */}
      {days.length === 0 && (
        <div className="py-16 text-center">
          <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>
            {positions.length === 0 ? 'No positions yet' : 'No positions match your filters'}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>
            {positions.length === 0 ? 'Place a trade from the Markets tab to get started.' : 'Try adjusting the date range or filters above.'}
          </p>
        </div>
      )}

      {/* ── Day-grouped statement ── */}
      <div className="space-y-6">
        {days.map(({ key, label, rows, dayPnl }) => (
          <div key={key}>
            {/* Day header */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>
                {label}
              </span>
              <span
                className="text-xs font-mono font-bold"
                style={{ color: dayPnl >= 0 ? '#00A844' : '#DC2626' }}
              >
                {fmt(dayPnl)}
              </span>
            </div>

            <div className="space-y-2">
              {rows.map(pos => (
                <PositionRow
                  key={pos.id}
                  pos={pos}
                  selling={selling}
                  onSell={sellPosition}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SummaryCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-center min-w-0">
      <p className="text-[10px] uppercase tracking-wider mb-0.5 truncate" style={{ color: 'var(--text-faint)' }}>{label}</p>
      <p
        className="font-mono font-bold text-xs truncate"
        style={{ color: color ?? 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </p>
    </div>
  )
}

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all"
      style={{
        backgroundColor: active ? 'var(--accent)' : 'var(--bg-surface)',
        color:           active ? '#fff' : 'var(--text-dim)',
        border:          `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
      }}
    >
      {label}
    </button>
  )
}

function statusBadge(status: PositionStatus): { label: string; color: string; bg: string } {
  switch (status) {
    case 'open':          return { label: 'OPEN',     color: '#00A844', bg: 'rgba(0,168,68,0.10)' }
    case 'sold':          return { label: 'SOLD',     color: '#6B7280', bg: 'rgba(107,114,128,0.12)' }
    case 'resolved_won':  return { label: 'WON',      color: '#00A844', bg: 'rgba(0,168,68,0.12)' }
    case 'resolved_lost': return { label: 'LOST',     color: '#DC2626', bg: 'rgba(220,38,38,0.10)' }
    case 'voided':        return { label: 'VOIDED',   color: '#6B7280', bg: 'rgba(107,114,128,0.08)' }
  }
}

function PositionRow({ pos, selling, onSell }: {
  pos: PositionWithMarket
  selling: string | null
  onSell: (id: string) => void
}) {
  const m           = pos.markets
  const isOpen      = pos.status === 'open'
  const isSelling   = selling === pos.id
  const isYes       = pos.side === 'yes'
  const price       = isOpen ? currentPrice(pos) : pos.entry_price
  const pnl         = positionPnl(pos)
  const badge       = statusBadge(pos.status)

  return (
    <div
      className="rounded-xl p-3 space-y-2.5"
      style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      {/* Question */}
      <p className="text-sm font-semibold leading-snug line-clamp-2" style={{ color: 'var(--text-strong)' }}>
        {m.question}
      </p>

      {/* Badge row */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: isYes ? 'rgba(0,200,83,0.10)' : 'rgba(224,92,32,0.08)',
            color:           isYes ? '#00A844' : '#E05C20',
          }}
        >
          {pos.side.toUpperCase()} · {pos.shares.toFixed(2)}
        </span>
        <span
          className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
          style={{ backgroundColor: badge.bg, color: badge.color }}
        >
          {badge.label}
        </span>
        {pos.isVega && (
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: 'rgba(99,102,241,0.10)', color: '#818CF8' }}
          >
            ★ Vega
          </span>
        )}
      </div>

      {/* P&L grid */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <MiniCell label="Invested" value={pos.entry_value.toFixed(2)} />
        <MiniCell label="Entry"  value={`${pos.entry_price.toFixed(0)}¢`} />
        <MiniCell label={isOpen ? 'Current' : 'Exit'} value={`${price.toFixed(0)}¢`} />
        <MiniCell
          label={isOpen ? 'Unrealised' : 'Realised'}
          value={pnl != null ? `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}` : '—'}
          color={pnl == null ? undefined : pnl >= 0 ? '#00A844' : '#DC2626'}
        />
      </div>

      {/* Sell button for open positions only */}
      {isOpen && (
        <button
          onClick={() => onSell(pos.id)}
          disabled={isSelling}
          className="w-full py-2 rounded-lg text-sm font-bold transition-all active:scale-[0.97]"
          style={{
            backgroundColor: isSelling ? 'var(--border)' : 'transparent',
            color:           isSelling ? 'var(--text-faint)' : 'var(--text)',
            border:          '1px solid var(--border)',
            cursor:          isSelling ? 'wait' : 'pointer',
          }}
        >
          {isSelling ? 'Selling…' : `Sell at ${currentPrice(pos).toFixed(0)}¢`}
        </button>
      )}
    </div>
  )
}

function MiniCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] truncate" style={{ color: 'var(--text-faint)' }}>{label}</p>
      <p
        className="font-mono font-bold text-xs truncate"
        style={{ color: color ?? 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </p>
    </div>
  )
}
