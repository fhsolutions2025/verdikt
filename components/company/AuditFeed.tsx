'use client'

import { useEffect, useState } from 'react'
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

const PAGE_SIZE = 20

interface Props {
  initial:      AuditLogEntry[]
  defaultOpen?: boolean
}

export function AuditFeed({ initial, defaultOpen = false }: Props) {
  const [entries, setEntries]   = useState<AuditLogEntry[]>(initial)
  const [open, setOpen]         = useState(defaultOpen)
  const [visible, setVisible]   = useState(PAGE_SIZE)
  const supabase                = createClient()

  useEffect(() => {
    const channel = supabase
      .channel('audit-log-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_log' },
        payload => {
          setEntries(prev => [payload.new as AuditLogEntry, ...prev].slice(0, 200))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const todayCount = entries.filter(e => new Date(e.created_at) >= todayStart).length
  const shown      = entries.slice(0, visible)

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
          <span className="text-xs" style={{ color: '#4B5563' }}>
            — {todayCount} events today
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
          <div
            className="divide-y"
            style={{ borderColor: 'rgba(255,255,255,0.04)' }}
          >
            {shown.map(entry => {
              const isSubmission = entry.type === 'market_submission'
              return (
                <div
                  key={entry.id}
                  className="px-5 py-3 flex items-start gap-3"
                  style={isSubmission ? {
                    borderLeft:      '3px solid #6C3FC5',
                    backgroundColor: 'rgba(108,63,197,0.08)',
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
                        color:      '#D1D5DB',
                        fontWeight: isSubmission ? 700 : 400,
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

            {entries.length === 0 && (
              <p className="px-5 py-6 text-sm" style={{ color: '#6B7280' }}>
                No activity yet.
              </p>
            )}
          </div>

          {visible < entries.length && (
            <div className="px-5 py-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
              <button
                onClick={() => setVisible(v => v + PAGE_SIZE)}
                className="text-xs font-bold"
                style={{ color: '#4B5563', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                Load more ({entries.length - visible} remaining)
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
