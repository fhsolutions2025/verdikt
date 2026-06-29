'use client'

import React from 'react'
import { ACCENT, PURPLE, RED } from '@/components/company/marketing/director/theme'

export interface CampaignFilter {
  statuses: string[]
  minHealth: number
}

interface CampaignFilterPopoverProps {
  value: CampaignFilter
  onChange: (next: CampaignFilter) => void
  onClose: () => void
}

const STATUS_OPTIONS: string[] = [
  'draft',
  'planning',
  'generating',
  'in_review',
  'approved',
  'published',
  'archived',
]

export function CampaignFilterPopover({ value, onChange, onClose }: CampaignFilterPopoverProps): React.JSX.Element {
  const toggleStatus = (status: string): void => {
    const next = value.statuses.includes(status)
      ? value.statuses.filter((s) => s !== status)
      : [...value.statuses, status]
    onChange({ ...value, statuses: next })
  }

  const setMinHealth = (n: number): void => {
    onChange({ ...value, minHealth: n })
  }

  const clear = (): void => {
    onChange({ statuses: [], minHealth: 0 })
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: 'var(--text-faint)',
    marginBottom: 8,
  }

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 49, background: 'transparent' }}
        onClick={onClose}
      />
      <div
        role="dialog"
        style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          zIndex: 50,
          width: 260,
          padding: 14,
          marginTop: 6,
          borderRadius: 10,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={labelStyle}>Status</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {STATUS_OPTIONS.map((status) => {
              const selected = value.statuses.includes(status)
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => toggleStatus(status)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 999,
                    fontSize: 12,
                    cursor: 'pointer',
                    color: selected ? '#fff' : 'var(--text-dim)',
                    background: selected ? PURPLE : 'var(--bg-inset)',
                    border: `1px solid ${selected ? PURPLE : 'var(--border-soft)'}`,
                  }}
                >
                  {status}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span>Min health</span>
            <span style={{ color: value.minHealth > 0 ? ACCENT : 'var(--text-strong)', fontWeight: 600 }}>
              {value.minHealth}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={value.minHealth}
            onChange={(e) => setMinHealth(Number(e.target.value))}
            style={{ width: '100%', accentColor: ACCENT }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={clear}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              color: RED,
              padding: '4px 2px',
            }}
          >
            Clear
          </button>
        </div>
      </div>
    </>
  )
}
