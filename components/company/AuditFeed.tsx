'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AuditLogEntry } from '@/lib/types'

const TYPE_COLORS: Record<string, string> = {
  trade:             '#00C853',
  seed:              '#6C3FC5',
  resolve:           '#9CA3AF',
  fee:               '#E05C20',
  operator_sync:     '#374151',
  config_change:     '#DC2626',
  market_submission: '#6C3FC5',
  risk_alert:        '#DC2626',
}

const TYPE_ALL = 'all'
const ALL_TYPES = ['trade', 'seed', 'resolve', 'fee', 'config_change', 'market_submission', 'risk_alert', 'operator_sync']
const PAGE_SIZE = 25

interface Props {
  initial:      AuditLogEntry[]
  defaultOpen?: boolean
}

// ── Heatmap ──────────────────────────────────────────────────────────────────

function ActivityHeatmap({ entries }: { entries: AuditLogEntry[] }) {
  const now  = Date.now()
  const MS24 = 24 * 60 * 60 * 1000
  const MS1H = 60 * 60 * 1000

  // Bucket events into 24 hourly slots
  const buckets = Array.from({ length: 24 }, (_, i) => {
    const bucketStart = now - MS24 + i * MS1H
    const bucketEnd   = bucketStart + MS1H
    const count = entries.filter(e => {
      const t = new Date(e.created_at).getTime()
      return t >= bucketStart && t < bucketEnd
    }).length
    const hasAlert = entries.some(e => {
      const t = new Date(e.created_at).getTime()
      return t >= bucketStart && t < bucketEnd && e.type === 'risk_alert'
    })
    const hour = new Date(bucketStart).getHours()
    return { hour, count, hasAlert }
  })

  const maxCount = Math.max(...buckets.map(b => b.count), 1)

  return (
    <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: '#4B5563', textTransform: 'uppercase' }}>
          24H Activity Heatmap
        </span>
        <span style={{ fontSize: 10, color: '#374151' }}>·</span>
        <span style={{ fontSize: 10, color: '#374151' }}>
          {entries.length} total events
        </span>
      </div>
      <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 40 }}>
        {buckets.map((b, i) => {
          const intensity = b.count / maxCount
          const color = b.hasAlert ? '#DC2626' : b.count > 0 ? '#00C853' : '#1F2937'
          const height = b.count > 0 ? Math.max(4, intensity * 36) : 4
          return (
            <div
              key={i}
              title={`${b.hour}:00 — ${b.count} event${b.count !== 1 ? 's' : ''}${b.hasAlert ? ' ⚠ alert' : ''}`}
              style={{
                flex: 1,
                height,
                borderRadius: 2,
                backgroundColor: color,
                opacity: b.count > 0 ? 0.3 + intensity * 0.7 : 0.15,
                cursor: 'default',
                transition: 'height 0.3s',
                alignSelf: 'flex-end',
                position: 'relative',
              }}
            />
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 9, color: '#374151' }}>-24h</span>
        <span style={{ fontSize: 9, color: '#374151' }}>-12h</span>
        <span style={{ fontSize: 9, color: '#374151' }}>now</span>
      </div>
    </div>
  )
}

// ── Stats row ─────────────────────────────────────────────────────────────────

function StatsRow({ entries }: { entries: AuditLogEntry[] }) {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const today      = entries.filter(e => new Date(e.created_at) >= todayStart)

  const counts: Record<string, number> = {}
  for (const e of today) counts[e.type] = (counts[e.type] ?? 0) + 1

  const stats = [
    { label: 'Trades',  count: counts['trade']             ?? 0, color: '#00C853' },
    { label: 'Alerts',  count: (counts['risk_alert'] ?? 0) + (counts['config_change'] ?? 0), color: '#DC2626' },
    { label: 'Seeds',   count: counts['seed']              ?? 0, color: '#6C3FC5' },
    { label: 'Fees',    count: counts['fee']               ?? 0, color: '#E05C20' },
    { label: 'Reviews', count: counts['market_submission'] ?? 0, color: '#6C3FC5' },
    { label: 'Resolved',count: counts['resolve']           ?? 0, color: '#9CA3AF' },
  ]

  return (
    <div style={{
      display: 'flex',
      gap: 0,
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      overflowX: 'auto',
    }}>
      {stats.map(s => (
        <div key={s.label} style={{
          flex: 1,
          minWidth: 70,
          padding: '10px 14px',
          borderRight: '1px solid rgba(255,255,255,0.04)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'monospace', color: s.count > 0 ? s.color : '#374151' }}>
            {s.count}
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#4B5563', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {s.label}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Fraud Alerts Panel ────────────────────────────────────────────────────────

function FraudAlertsPanel({ entries }: { entries: AuditLogEntry[] }) {
  const alerts = entries.filter(e => e.type === 'risk_alert').slice(0, 5)
  if (alerts.length === 0) return null

  return (
    <div style={{
      margin: '0',
      padding: '12px 20px',
      backgroundColor: 'rgba(220,38,38,0.06)',
      borderBottom: '1px solid rgba(220,38,38,0.2)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 20,
          height: 20,
          borderRadius: 4,
          backgroundColor: 'rgba(220,38,38,0.2)',
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1L11 10H1L6 1Z" stroke="#DC2626" strokeWidth="1.5" strokeLinejoin="round"/>
            <line x1="6" y1="4.5" x2="6" y2="7" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="6" cy="8.5" r="0.5" fill="#DC2626"/>
          </svg>
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Risk Alerts — {alerts.length} active
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {alerts.map(a => (
          <div key={a.id} style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            padding: '6px 10px',
            backgroundColor: 'rgba(220,38,38,0.08)',
            borderRadius: 6,
            border: '1px solid rgba(220,38,38,0.15)',
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#DC2626', flexShrink: 0, marginTop: 5 }} />
            <span style={{ fontSize: 12, color: '#FCA5A5', flex: 1 }}>{a.description}</span>
            <span style={{ fontSize: 11, color: '#6B7280', flexShrink: 0, fontFamily: 'monospace' }}>
              {formatTime(a.created_at)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function AuditFeed({ initial, defaultOpen = false }: Props) {
  const [entries, setEntries] = useState<AuditLogEntry[]>(initial)
  const [open, setOpen]       = useState(defaultOpen)
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [typeFilter, setTypeFilter] = useState<string>(TYPE_ALL)
  const supabase              = createClient()

  useEffect(() => {
    const channel = supabase
      .channel('audit-log-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_log' },
        payload => {
          setEntries(prev => [payload.new as AuditLogEntry, ...prev].slice(0, 500))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const filtered = useMemo(() => (
    typeFilter === TYPE_ALL ? entries : entries.filter(e => e.type === typeFilter)
  ), [entries, typeFilter])

  const shown = filtered.slice(0, visible)

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const todayCount = entries.filter(e => new Date(e.created_at) >= todayStart).length

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: '#161B22',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Collapsible header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4"
        style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <div className="flex items-center gap-3">
          <h2
            className="text-xs font-bold uppercase tracking-widest"
            style={{ color: '#6B7280', letterSpacing: '0.08em' }}
          >
            Live Activity
          </h2>
          <span style={{
            backgroundColor: '#00C85320',
            color: '#00C853',
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 999,
          }}>
            {todayCount} today
          </span>
        </div>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
          <path
            d={open ? 'M2 8L6 4L10 8' : 'M2 4L6 8L10 4'}
            stroke="#4B5563"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <>
          {/* Heatmap */}
          <ActivityHeatmap entries={entries} />

          {/* Stats */}
          <StatsRow entries={entries} />

          {/* Fraud/risk alert panel */}
          <FraudAlertsPanel entries={entries} />

          {/* Type filter bar */}
          <div style={{
            display: 'flex',
            gap: 4,
            padding: '10px 20px',
            overflowX: 'auto',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            {[TYPE_ALL, ...ALL_TYPES].map(t => {
              const active = typeFilter === t
              const color  = TYPE_COLORS[t] ?? '#6B7280'
              return (
                <button
                  key={t}
                  onClick={() => { setTypeFilter(t); setVisible(PAGE_SIZE) }}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 999,
                    border: `1px solid ${active ? color : 'rgba(255,255,255,0.08)'}`,
                    backgroundColor: active ? color + '20' : 'transparent',
                    color: active ? color : '#6B7280',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    textTransform: 'capitalize',
                  }}
                >
                  {t === TYPE_ALL ? 'All' : t.replace(/_/g, ' ')}
                </button>
              )
            })}
          </div>

          {/* Event list */}
          <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
            {shown.map(entry => {
              const isSubmission = entry.type === 'market_submission'
              const isAlert      = entry.type === 'risk_alert'
              const isConfig     = entry.type === 'config_change'
              const accent       = isAlert || isConfig ? '#DC2626' : isSubmission ? '#6C3FC5' : undefined
              return (
                <div
                  key={entry.id}
                  className="px-5 py-3 flex items-start gap-3"
                  style={accent ? {
                    borderLeft:      `3px solid ${accent}`,
                    backgroundColor: accent + '08',
                  } : undefined}
                >
                  <span
                    className="mt-0.5 text-xs font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{
                      color:           TYPE_COLORS[entry.type] ?? '#6B7280',
                      backgroundColor: (TYPE_COLORS[entry.type] ?? '#6B7280') + '18',
                    }}
                  >
                    {entry.type.replace(/_/g, ' ')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm truncate"
                      style={{
                        color:      isAlert ? '#FCA5A5' : '#D1D5DB',
                        fontWeight: (isSubmission || isAlert) ? 700 : 400,
                      }}
                    >
                      {entry.description}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {entry.amount != null && (
                        <span className="font-mono text-xs" style={{ color: '#6B7280' }}>
                          {entry.amount.toFixed(2)}
                        </span>
                      )}
                      <span className="text-xs" style={{ color: '#374151' }}>
                        {formatTime(entry.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}

            {filtered.length === 0 && (
              <p className="px-5 py-6 text-sm" style={{ color: '#6B7280' }}>
                {typeFilter === TYPE_ALL ? 'No activity yet.' : `No ${typeFilter.replace(/_/g, ' ')} events.`}
              </p>
            )}
          </div>

          {visible < filtered.length && (
            <div className="px-5 py-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
              <button
                onClick={() => setVisible(v => v + PAGE_SIZE)}
                className="text-xs font-bold"
                style={{ color: '#4B5563', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                Load more ({filtered.length - visible} remaining)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function formatTime(ts: string) {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
