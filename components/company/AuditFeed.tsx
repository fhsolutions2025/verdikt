'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AuditLogEntry } from '@/lib/types'

const TYPE_COLORS: Record<string, string> = {
  trade:        '#00C853',
  seed:         '#6C3FC5',
  resolve:      '#9CA3AF',
  fee:          '#E05C20',
  operator_sync:'#374151',
  config_change:'#DC2626',
  market_submission:'#4338CA',
  risk_alert:       '#DC2626',
}

interface Props {
  initial: AuditLogEntry[]
}

export function AuditFeed({ initial }: Props) {
  const [entries, setEntries] = useState<AuditLogEntry[]>(initial)
  const supabase              = createClient()

  useEffect(() => {
    const channel = supabase
      .channel('audit-log-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_log' },
        payload => {
          setEntries(prev => [payload.new as AuditLogEntry, ...prev].slice(0, 50))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: '#161B22',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div className="px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <h2
          className="text-xs font-bold uppercase tracking-widest"
          style={{ color: '#6B7280', letterSpacing: '0.08em' }}
        >
          Live Activity
        </h2>
      </div>

      <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
        {entries.slice(0, 20).map(entry => (
          <div key={entry.id} className="px-5 py-3 flex items-start gap-3">
            <span
              className="mt-0.5 text-xs font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0"
              style={{
                color: TYPE_COLORS[entry.type] ?? '#6B7280',
                backgroundColor: (TYPE_COLORS[entry.type] ?? '#6B7280') + '18',
              }}
            >
              {entry.type}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate" style={{ color: '#D1D5DB' }}>
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
        ))}
        {entries.length === 0 && (
          <p className="px-5 py-6 text-sm" style={{ color: '#374151' }}>
            No activity yet.
          </p>
        )}
      </div>
    </div>
  )
}

function formatTime(ts: string) {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
