'use client'

// WS-1 — Campaign Explorer column (spec §Campaign Explorer): search, status tabs,
// campaign cards with thumbnail/status/dates/progress/health. Click selects a campaign.

import React from 'react'
import { ACCENT, PURPLE } from '@/components/company/marketing/director/theme'

export interface ExplorerCampaign {
  id: string
  name: string
  status: string
  created_at: string
  progress?: number   // 0-100
  health?: number     // 0-100
}

type Tab = 'all' | 'active' | 'archived'

function statusBucket(s: string): Tab {
  const v = (s || '').toLowerCase()
  if (v === 'archived' || v === 'voided') return 'archived'
  if (v === 'published' || v === 'completed') return 'archived'
  return 'active'
}

export function CampaignExplorer({
  campaigns, selectedId, onSelect, onNew,
}: {
  campaigns: ExplorerCampaign[]
  selectedId: string | null
  onSelect: (id: string) => void
  onNew: () => void
}): React.JSX.Element {
  const [q, setQ] = React.useState('')
  const [tab, setTab] = React.useState<Tab>('all')

  const filtered = campaigns.filter(c => {
    if (q && !c.name.toLowerCase().includes(q.toLowerCase())) return false
    if (tab !== 'all' && statusBucket(c.status) !== tab) return false
    return true
  })

  return (
    <div style={{ width: 280, flexShrink: 0, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', background: 'var(--bg-base)' }}>
      <div style={{ padding: '12px 12px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search campaigns…"
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 12px', color: 'var(--text-strong)', fontSize: 13, outline: 'none' }} />
        <button onClick={onNew} style={{ width: '100%', background: PURPLE, color: '#fff', border: 'none', borderRadius: 9, padding: '9px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ New Campaign</button>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'active', 'archived'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, background: tab === t ? 'var(--bg-inset)' : 'transparent', border: `1px solid ${tab === t ? 'var(--border)' : 'transparent'}`,
              borderRadius: 8, padding: '5px', fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
              color: tab === t ? 'var(--text-strong)' : 'var(--text-faint)',
            }}>{t}</button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 12px', color: 'var(--text-faint)' }}>
            <div style={{ fontSize: 26, marginBottom: 8 }}>🗂️</div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>{q || tab !== 'all' ? 'No campaigns match.' : 'No campaigns yet.'}</div>
            {!q && tab === 'all' && <button onClick={onNew} style={{ marginTop: 10, background: 'none', border: `1px solid ${PURPLE}55`, color: PURPLE, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Create your first campaign</button>}
          </div>
        ) : filtered.map(c => {
          const sel = c.id === selectedId
          const health = typeof c.health === 'number' ? c.health : null
          const healthColor = health == null ? 'var(--text-faint)' : health >= 60 ? ACCENT : health >= 40 ? '#E0A020' : '#DC2626'
          return (
            <button key={c.id} onClick={() => onSelect(c.id)} style={{
              display: 'flex', flexDirection: 'column', gap: 7, width: '100%', textAlign: 'left',
              padding: '11px 12px', borderRadius: 11, cursor: 'pointer',
              background: sel ? 'rgba(108,63,197,0.12)' : 'var(--bg-surface)',
              border: `1px solid ${sel ? PURPLE + '55' : 'var(--border)'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-strong)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'capitalize', color: 'var(--text-faint)' }}>{c.status}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{new Date(c.created_at).toLocaleDateString()}</div>
              {typeof c.progress === 'number' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 4, background: 'var(--border-soft)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${c.progress}%`, background: ACCENT, borderRadius: 3 }} />
                  </div>
                  {health != null && <span style={{ fontSize: 10.5, fontWeight: 800, fontFamily: 'monospace', color: healthColor }}>{health}%</span>}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
