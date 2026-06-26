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

// --- sparkline -----------------------------------------------------------

function Sparkline({ points }: { points: number[] }) {
  const W = 380
  const H = 120
  if (points.length < 2) {
    return (
      <div style={{ height: H }} className="flex items-center justify-center">
        <span className="text-xs" style={{ color: 'var(--text-faint)' }}>Not enough data to chart</span>
      </div>
    )
  }
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const stepX = W / (points.length - 1)
  const coords = points.map((p, i) => {
    const x = i * stepX
    const y = H - ((p - min) / range) * (H - 8) - 4
    return [x, y] as const
  })
  // smooth path
  let d = `M ${coords[0][0]} ${coords[0][1]}`
  for (let i = 1; i < coords.length; i++) {
    const [px, py] = coords[i - 1]
    const [cx, cy] = coords[i]
    const mx = (px + cx) / 2
    d += ` Q ${px} ${py} ${mx} ${(py + cy) / 2} T ${cx} ${cy}`
  }
  const area = `${d} L ${W} ${H} L 0 ${H} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={GREEN} stopOpacity="0.22" />
          <stop offset="100%" stopColor={GREEN} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark-fill)" />
      <path d={d} fill="none" stroke={GREEN} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

// -------------------------------------------------------------------------

export function WalletStatement({ balance, transactions }: { balance: number; transactions: WalletTransaction[] }) {
  const [period, setPeriod] = useState<Period>('30d')
  const [hidden, setHidden] = useState(false)

  // transactions arrive newest-first. Reconstruct running balance series.
  // Walk backwards from current balance: balance_before = balance_after - amount.
  const runningSeries = useMemo(() => {
    // produce array of { created_at(ms), balanceAfter } oldest->newest
    const out: { t: number; bal: number }[] = []
    let after = balance
    for (const tx of transactions) {
      out.push({ t: new Date(tx.created_at).getTime(), bal: after })
      after = after - tx.amount // balance before this tx
    }
    return out.reverse() // oldest -> newest
  }, [balance, transactions])

  const start = periodStart(period)

  const periodTxs = useMemo(
    () => transactions.filter(tx => new Date(tx.created_at).getTime() >= start),
    [transactions, start],
  )

  const sparkPoints = useMemo(() => {
    const pts = runningSeries.filter(p => p.t >= start).map(p => p.bal)
    return pts
  }, [runningSeries, start])

  // all-time change
  const totalNetDeposits = useMemo(() => {
    let dep = 0, wd = 0
    for (const tx of transactions) {
      if (tx.type === 'deposit') dep += tx.amount
      else if (tx.type === 'withdrawal') wd += Math.abs(tx.amount)
    }
    return dep - wd
  }, [transactions])

  const change = balance - totalNetDeposits
  const changePct = totalNetDeposits !== 0 ? (change / totalNetDeposits) * 100 : 0

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
    return { volume, fees, deposited, pnl: pnlPos - pnlNeg }
  }, [periodTxs])

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
              all time
            </span>
          </div>

          <div className="mt-4 -mx-1">
            <Sparkline points={sparkPoints} />
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
