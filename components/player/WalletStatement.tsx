'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { PlayerTabBar } from '@/components/player/PlayerTabBar'
import type { WalletTransaction, TransactionType } from '@/lib/types'

type Period = '7d' | '30d' | '3m' | '1y' | 'all'

const PERIODS: { key: Period; label: string }[] = [
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: '3m', label: '3M' },
  { key: '1y', label: '1Y' },
  { key: 'all', label: 'All' },
]

const PERIOD_LABEL: Record<Period, string> = {
  '7d': 'past 7 days',
  '30d': 'past 30 days',
  '3m': 'past 3 months',
  '1y': 'past year',
  all: 'all time',
}

const GREEN = '#00A844'
const RED = '#DC2626'
const ORANGE = '#E05C20'

function periodStart(period: Period): number {
  if (period === 'all') return 0
  const now = Date.now()
  const day = 86_400_000
  switch (period) {
    case '7d': return now - 7 * day
    case '30d': return now - 30 * day
    case '3m': return now - 90 * day
    case '1y': return now - 365 * day
  }
}

function humanizeType(type: TransactionType): string {
  switch (type) {
    case 'deposit': return 'Deposit'
    case 'withdrawal': return 'Withdrawal'
    case 'trade': return 'Trade'
    case 'sell': return 'Position Sold'
    case 'payout': return 'Payout'
    case 'fee': return 'Trading Fee'
    case 'maker_rebate': return 'Maker Rebate'
    case 'maker_spread': return 'Maker Spread'
    case 'holding_reward': return 'Holding Reward'
    case 'creator_royalty': return 'Creator Royalty'
    default: return type
  }
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function signed(n: number): string {
  return `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n))}`
}

// --- icons ---------------------------------------------------------------

function TypeIcon({ type }: { type: TransactionType }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (type) {
    case 'deposit':
      return <svg {...common} stroke={GREEN}><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
    case 'withdrawal':
      return <svg {...common} stroke={ORANGE}><path d="M12 19V5M5 12l7-7 7 7" /></svg>
    case 'fee':
      return <svg {...common} stroke={RED}><circle cx="7" cy="7" r="2" /><circle cx="17" cy="17" r="2" /><path d="M19 5L5 19" /></svg>
    case 'trade':
      return <svg {...common} stroke="var(--text-dim)"><path d="M7 16V8M17 16V8M3 12h18" /></svg>
    case 'sell':
    case 'payout':
    case 'holding_reward':
    case 'creator_royalty':
      return <svg {...common} stroke={GREEN}><path d="M3 17l6-6 4 4 7-7M14 7h6v6" /></svg>
    case 'maker_rebate':
    case 'maker_spread':
      return <svg {...common} stroke={GREEN}><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
    default:
      return <svg {...common} stroke="var(--text-dim)"><circle cx="12" cy="12" r="9" /></svg>
  }
}

function iconTint(type: TransactionType): string {
  switch (type) {
    case 'deposit': return GREEN
    case 'withdrawal': return ORANGE
    case 'fee': return RED
    case 'sell':
    case 'payout':
    case 'holding_reward':
    case 'creator_royalty':
    case 'maker_rebate':
    case 'maker_spread': return GREEN
    default: return 'var(--text-dim)'
  }
}

function hexAlpha(color: string, alpha: string): string {
  return color.startsWith('#') ? `${color}${alpha}` : 'var(--bg-inset)'
}

// --- interactive balance chart -------------------------------------------

function BalanceChart({ series, positive }: { series: { t: number; bal: number }[]; positive?: boolean }) {
  const W = 380
  const H = 120
  const [hover, setHover] = useState<number | null>(null)

  if (series.length < 2) {
    return (
      <div style={{ height: H }} className="flex items-center justify-center">
        <span className="text-xs" style={{ color: 'var(--text-faint)' }}>Not enough data to chart</span>
      </div>
    )
  }

  const vals  = series.map(s => s.bal)
  const min   = Math.min(...vals)
  const max   = Math.max(...vals)
  const range = max - min || 1
  const stepX = W / (series.length - 1)
  // Colour by trading performance (P&L sign), not by raw endpoints — a deposit can
  // lift the balance line while trading is down, so we never want a rising-because-
  // of-a-deposit line to read green when the period's P&L is negative.
  const up    = positive ?? (series[series.length - 1].bal >= series[0].bal)
  const stroke = up ? GREEN : RED

  const coords = series.map((s, i) => {
    const x = i * stepX
    const y = H - ((s.bal - min) / range) * (H - 14) - 7
    return [x, y] as const
  })

  let d = `M ${coords[0][0]} ${coords[0][1]}`
  for (let i = 1; i < coords.length; i++) {
    const [px, py] = coords[i - 1]
    const [cx, cy] = coords[i]
    const mx = (px + cx) / 2
    d += ` Q ${px} ${py} ${mx} ${(py + cy) / 2} T ${cx} ${cy}`
  }
  const area = `${d} L ${W} ${H} L 0 ${H} Z`

  const onMove = (clientX: number, rect: DOMRect) => {
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    setHover(Math.round(frac * (series.length - 1)))
  }

  const hi = hover != null ? series[hover] : null
  const hx = hover != null ? coords[hover][0] : 0
  const hy = hover != null ? coords[hover][1] : 0
  // Keep the tooltip inside the card.
  const leftPct = hover != null ? (hover / (series.length - 1)) * 100 : 0
  const tipAlign = leftPct > 70 ? 'right' : leftPct < 30 ? 'left' : 'center'

  return (
    <div
      style={{ position: 'relative', touchAction: 'none' }}
      onPointerMove={e => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
      onPointerDown={e => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
      onPointerLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block' }}>
        <defs>
          <linearGradient id="bal-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#bal-fill)" />
        <path d={d} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {/* Peak / trough markers — hidden while scrubbing to avoid clutter */}
        {hover == null && (() => {
          const peakI   = vals.indexOf(max)
          const troughI = vals.indexOf(min)
          const dots: React.ReactNode[] = []
          if (max !== min) {
            dots.push(<circle key="pk" cx={coords[peakI][0]}   cy={coords[peakI][1]}   r={3} fill={GREEN} stroke="var(--bg-surface)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />)
            dots.push(<circle key="tr" cx={coords[troughI][0]} cy={coords[troughI][1]} r={3} fill={RED}   stroke="var(--bg-surface)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />)
          }
          return <>{dots}</>
        })()}
        {hover != null && (
          <>
            <line x1={hx} y1={0} x2={hx} y2={H} stroke="var(--text-faint)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            <circle cx={hx} cy={hy} r={3.5} fill={stroke} stroke="var(--bg-surface)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>

      {hi && (
        <div
          style={{
            position: 'absolute', top: -6, left: `${leftPct}%`,
            transform: tipAlign === 'center' ? 'translateX(-50%)' : tipAlign === 'right' ? 'translateX(-100%)' : 'translateX(0)',
            pointerEvents: 'none', whiteSpace: 'nowrap',
            backgroundColor: 'var(--bg-inset)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '5px 9px', boxShadow: '0 6px 18px rgba(0,0,0,0.4)', zIndex: 5,
          }}
        >
          <div className="font-mono font-bold text-xs" style={{ color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>
            {fmt(hi.bal)}
          </div>
          <div className="text-[10px]" style={{ color: 'var(--text-faint)' }}>
            {new Date(hi.t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        </div>
      )}
    </div>
  )
}

// -------------------------------------------------------------------------

export function WalletStatement({ balance, transactions }: { balance: number; transactions: WalletTransaction[] }) {
  const [period, setPeriod] = useState<Period>('30d')
  const [hidden, setHidden] = useState(false)
  const [explain, setExplain] = useState<{ loading: boolean; text: string | null; error: string | null }>(
    { loading: false, text: null, error: null },
  )

  // Reconstruct the running balance series. Transactions arrive newest-first;
  // walk backwards from the current balance (balance_before = balance_after −
  // amount). After the loop, `after` is the opening balance before the very
  // first transaction — we keep it as an anchor point so the chart and the
  // change figure start from real starting capital, not from zero.
  const seriesFull = useMemo(() => {
    const pts: { t: number; bal: number }[] = []
    let after = balance
    for (const tx of transactions) {
      pts.push({ t: new Date(tx.created_at).getTime(), bal: after })
      after = after - tx.amount
    }
    const oldestT = transactions.length
      ? new Date(transactions[transactions.length - 1].created_at).getTime()
      : Date.now()
    pts.push({ t: oldestT - 1, bal: after }) // opening anchor
    return pts.reverse() // oldest -> newest
  }, [balance, transactions])

  const start = periodStart(period)

  const periodTxs = useMemo(
    () => transactions.filter(tx => new Date(tx.created_at).getTime() >= start),
    [transactions, start],
  )

  // The hero "change" is the period's true P&L: the balance delta across the
  // window MINUS external cashflows (deposits/withdrawals) inside it. Subtracting
  // flows is essential — otherwise a deposit reads as profit (the original bug).
  // The chart still plots raw balance (deposits included), but is coloured by this
  // P&L sign so a deposit-driven rise never shows green while trading is down.
  const { chartSeries, change, changePct } = useMemo(() => {
    if (seriesFull.length === 0) {
      return { chartSeries: [] as { t: number; bal: number }[], change: 0, changePct: 0 }
    }
    const before   = seriesFull.filter(p => p.t < start)
    const inWindow  = seriesFull.filter(p => p.t >= start)
    const baseline = before.length ? before[before.length - 1].bal : seriesFull[0].bal
    const baseT    = period === 'all' ? seriesFull[0].t : start
    const cs = before.length
      ? [{ t: baseT, bal: baseline }, ...inWindow]
      : (inWindow.length ? inWindow : [{ t: baseT, bal: baseline }])
    const endBal = cs[cs.length - 1].bal

    // Net external cashflow inside the window (deposits +, withdrawals −).
    const netFlow = periodTxs.reduce(
      (s, tx) => s + (tx.type === 'deposit' || tx.type === 'withdrawal' ? tx.amount : 0),
      0,
    )
    const ch = (endBal - baseline) - netFlow
    // % is performance over the capital base for the window.
    const capitalBase = Math.abs(baseline) > 1 ? Math.abs(baseline) : Math.abs(baseline + netFlow)
    const pct = capitalBase > 0 ? (ch / capitalBase) * 100 : 0
    return { chartSeries: cs, change: ch, changePct: pct }
  }, [seriesFull, start, period, periodTxs])

  // stat tiles over period
  const stats = useMemo(() => {
    let volume = 0, fees = 0, deposited = 0
    let pnlPos = 0, pnlNeg = 0
    for (const tx of periodTxs) {
      const abs = Math.abs(tx.amount)
      if (tx.type === 'trade' || tx.type === 'sell') volume += abs
      if (tx.type === 'fee') fees += abs
      if (tx.type === 'deposit') deposited += tx.amount
      if (tx.type === 'sell' || tx.type === 'payout' || tx.type === 'maker_rebate' || tx.type === 'maker_spread' || tx.type === 'holding_reward' || tx.type === 'creator_royalty') pnlPos += tx.amount
      if (tx.type === 'trade' || tx.type === 'fee') pnlNeg += abs
    }
    return { volume, fees, deposited, gains: pnlPos, pnl: pnlPos - pnlNeg }
  }, [periodTxs])

  // Always-on intelligence: best/worst trading day in the window, plus a plain
  // sentence that explains the period's move in terms of its real drivers.
  const insights = useMemo(() => {
    const dayMap = new Map<string, number>()
    for (const tx of periodTxs) {
      const k = new Date(tx.created_at).toISOString().slice(0, 10)
      let v = 0
      if (tx.type === 'sell' || tx.type === 'payout' || tx.type === 'maker_rebate' || tx.type === 'maker_spread' || tx.type === 'holding_reward' || tx.type === 'creator_royalty') v = tx.amount
      else if (tx.type === 'trade' || tx.type === 'fee') v = -Math.abs(tx.amount)
      if (v !== 0) dayMap.set(k, (dayMap.get(k) ?? 0) + v)
    }
    let best: { day: string; pnl: number } | null = null
    let worst: { day: string; pnl: number } | null = null
    for (const [day, pnl] of Array.from(dayMap.entries())) {
      if (!best || pnl > best.pnl) best = { day, pnl }
      if (!worst || pnl < worst.pnl) worst = { day, pnl }
    }

    const dir = change >= 0 ? 'up' : 'down'
    let driver: string
    if (stats.pnl < 0) {
      driver = `${fmt(Math.abs(stats.pnl))} in net trading losses`
      if (stats.fees > 0) driver += ` (incl. ${fmt(stats.fees)} fees)`
    } else if (stats.pnl > 0) {
      driver = `${fmt(stats.pnl)} in net trading gains`
    } else {
      driver = 'no trading activity'
    }
    const sentence = `You're ${dir} ${Math.abs(changePct).toFixed(1)}% over the ${PERIOD_LABEL[period]} — ${driver}.`
    return { best, worst, sentence }
  }, [periodTxs, change, changePct, stats, period])

  const dayFmt = (day: string) =>
    new Date(day + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

  async function runExplain() {
    setExplain({ loading: true, text: null, error: null })
    try {
      const res = await fetch('/api/wallet/insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period:    PERIOD_LABEL[period],
          balance,
          change,
          changePct,
          volume:    stats.volume,
          netPnl:    stats.pnl,
          gains:     stats.gains,
          fees:      stats.fees,
          deposited: stats.deposited,
          bestDay:   insights.best,
          worstDay:  insights.worst,
        }),
      })
      const d = await res.json()
      if (res.ok && d.text) setExplain({ loading: false, text: d.text, error: null })
      else setExplain({ loading: false, text: null, error: d.error ?? 'Could not generate insight.' })
    } catch {
      setExplain({ loading: false, text: null, error: 'Network error.' })
    }
  }

  const maskedBalance = hidden ? '••••••' : fmt(balance)

  return (
    <main className="min-h-screen pb-24" style={{ backgroundColor: 'var(--bg-base)' }}>
      <div className="max-w-[420px] mx-auto px-4 pt-4 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/player"
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
            aria-label="Back"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <h1 className="text-base font-bold" style={{ color: 'var(--text-strong)' }}>Account Statement</h1>
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
            aria-hidden
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
          </div>
        </div>

        {/* Balance hero */}
        <div
          className="rounded-2xl p-5"
          style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center justify-between mb-1">
            <p
              className="text-xs font-bold uppercase tracking-widest"
              style={{ color: 'var(--text-dim)', letterSpacing: '0.08em' }}
            >
              Account Balance
            </p>
            <button
              onClick={() => setHidden(h => !h)}
              className="w-7 h-7 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'var(--bg-inset)' }}
              aria-label={hidden ? 'Show balance' : 'Hide balance'}
            >
              {hidden ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>

          <p
            className="font-mono font-bold"
            style={{ fontSize: 40, color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}
          >
            {maskedBalance}
          </p>

          <div className="flex items-center gap-1.5 mt-1">
            <span
              className="font-mono font-semibold text-sm"
              style={{ color: change >= 0 ? GREEN : RED, fontVariantNumeric: 'tabular-nums' }}
            >
              {signed(change)} ({change >= 0 ? '+' : '−'}{Math.abs(changePct).toFixed(1)}%)
            </span>
            <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
              P&amp;L · {PERIOD_LABEL[period]}
            </span>
          </div>

          <div className="mt-4 -mx-1">
            <BalanceChart series={chartSeries} positive={change >= 0} />
          </div>
        </div>

        {/* Period tabs */}
        <div
          className="flex rounded-xl p-1"
          style={{ backgroundColor: 'var(--bg-inset)', border: '1px solid var(--border)' }}
        >
          {PERIODS.map(p => {
            const active = p.key === period
            return (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className="flex-1 text-xs font-semibold py-1.5 rounded-lg transition-colors"
                style={{
                  backgroundColor: active ? 'var(--bg-surface)' : 'transparent',
                  color: active ? 'var(--text-strong)' : 'var(--text-dim)',
                  border: active ? '1px solid var(--border)' : '1px solid transparent',
                }}
              >
                {p.label}
              </button>
            )
          })}
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 gap-3">
          <StatTile label="Volume" value={fmt(stats.volume)} />
          <StatTile
            label="Net P&L"
            value={signed(stats.pnl)}
            color={stats.pnl >= 0 ? GREEN : RED}
          />
          <StatTile label="Fees" value={`−${fmt(stats.fees)}`} color={RED} />
          <StatTile label="Deposited" value={fmt(stats.deposited)} color={GREEN} />
        </div>

        {/* Insights */}
        <div
          className="rounded-2xl p-4"
          style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <p
            className="text-xs font-bold uppercase tracking-widest mb-2"
            style={{ color: 'var(--text-dim)', letterSpacing: '0.08em' }}
          >
            Insights
          </p>

          {/* Plain-English summary */}
          <p className="text-sm leading-snug" style={{ color: 'var(--text)' }}>
            {insights.sentence}
          </p>

          {/* Capital vs performance — kills the "is this profit or my own money?" confusion */}
          <div className="flex items-stretch gap-2 mt-3">
            <div className="flex-1 rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg-inset)' }}>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Capital deposited</p>
              <p className="font-mono font-bold text-sm" style={{ color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}>{fmt(stats.deposited)}</p>
            </div>
            <div className="flex-1 rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--bg-inset)' }}>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Trading performance</p>
              <p className="font-mono font-bold text-sm" style={{ color: stats.pnl >= 0 ? GREEN : RED, fontVariantNumeric: 'tabular-nums' }}>{signed(stats.pnl)}</p>
            </div>
          </div>

          {/* Best / worst day chips */}
          {(insights.best || insights.worst) && (
            <div className="flex gap-2 mt-2">
              {insights.best && insights.best.pnl > 0 && (
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: hexAlpha(GREEN, '1A'), color: GREEN }}>
                  ▲ Best {dayFmt(insights.best.day)} · {signed(insights.best.pnl)}
                </span>
              )}
              {insights.worst && insights.worst.pnl < 0 && (
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: hexAlpha(RED, '1A'), color: RED }}>
                  ▼ Worst {dayFmt(insights.worst.day)} · {signed(insights.worst.pnl)}
                </span>
              )}
            </div>
          )}

          {/* On-demand Vega narrative */}
          <button
            onClick={runExplain}
            disabled={explain.loading}
            className="w-full mt-3 py-2 rounded-lg text-sm font-bold transition-all active:scale-[0.98]"
            style={{
              backgroundColor: explain.loading ? 'var(--bg-inset)' : hexAlpha('#818CF8', '14'),
              border: '1px solid rgba(129,140,248,0.35)',
              color: '#818CF8',
              cursor: explain.loading ? 'wait' : 'pointer',
            }}
          >
            {explain.loading ? 'Vega is reviewing…' : '✨ Explain my ' + (period === 'all' ? 'history' : 'period')}
          </button>

          {explain.error && (
            <p className="text-xs mt-2" style={{ color: RED }}>{explain.error}</p>
          )}
          {explain.text && (
            <p className="text-sm leading-relaxed mt-2 whitespace-pre-line" style={{ color: 'var(--text)' }}>
              {explain.text}
            </p>
          )}
        </div>

        {/* Transaction history */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2
              className="text-xs font-bold uppercase tracking-widest"
              style={{ color: 'var(--text-dim)', letterSpacing: '0.08em' }}
            >
              Transaction History
            </h2>
          </div>

          {periodTxs.map(tx => {
            const tint = iconTint(tx.type)
            const d = new Date(tx.created_at)
            return (
              <div
                key={tx.id}
                className="px-4 py-3 flex items-center gap-3 border-b"
                style={{ borderColor: 'var(--bg-inset)' }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: hexAlpha(tint, '22') }}
                >
                  <TypeIcon type={tx.type} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                    {humanizeType(tx.type)}
                  </p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-faint)' }}>
                    {tx.description}
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>
                    {d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} ·{' '}
                    {d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <span
                  className="font-mono font-bold text-sm shrink-0"
                  style={{ color: tx.amount >= 0 ? GREEN : RED, fontVariantNumeric: 'tabular-nums' }}
                >
                  {signed(tx.amount)}
                </span>
              </div>
            )
          })}

          {periodTxs.length === 0 && (
            <p className="px-4 py-10 text-sm text-center" style={{ color: 'var(--text-faint)' }}>
              No transactions in the {PERIOD_LABEL[period]}.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 pb-2">
          <p className="text-[11px] leading-tight" style={{ color: 'var(--text-faint)' }}>
            Demo account · play money,<br />for illustration only
          </p>
          <a
            href={`/api/wallet/export?period=${period}`}
            download
            className="text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-1.5"
            style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-strong)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            Export Statement
          </a>
        </div>
      </div>

      <PlayerTabBar active="wallet" />
    </main>
  )
}

function StatTile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      className="rounded-2xl p-3"
      style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      <p
        className="text-[10px] font-bold uppercase tracking-widest mb-1"
        style={{ color: 'var(--text-dim)', letterSpacing: '0.08em' }}
      >
        {label}
      </p>
      <p
        className="font-mono font-bold text-base truncate"
        style={{ color: color ?? 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </p>
    </div>
  )
}
