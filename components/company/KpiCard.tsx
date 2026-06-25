'use client'

import { LiveDot } from '@/components/shared/LiveDot'
import { Tooltip, InfoIcon } from '@/components/shared/Tooltip'

interface Props {
  label:    string
  value:    string | number
  sub?:     string
  live?:    boolean
  accent?:  string
  tooltip?: string
}

export function KpiCard({ label, value, sub, live = true, accent, tooltip }: Props) {
  return (
    <div
      className="relative rounded-2xl p-5"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border)',
      }}
    >
      {live && (
        <span className="absolute top-4 right-4">
          <LiveDot />
        </span>
      )}

      <p
        className="text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1"
        style={{ color: 'var(--text-dim)', letterSpacing: '0.08em' }}
      >
        {label}
        {tooltip && (
          <Tooltip content={tooltip}>
            <InfoIcon />
          </Tooltip>
        )}
      </p>

      <p
        className="font-mono font-bold"
        style={{
          fontSize: 28,
          color: accent ?? 'var(--text-strong)',
          lineHeight: 1.1,
        }}
      >
        {value}
      </p>

      {sub && (
        <p className="text-xs mt-1.5" style={{ color: 'var(--text-dim)' }}>
          {sub}
        </p>
      )}
    </div>
  )
}
