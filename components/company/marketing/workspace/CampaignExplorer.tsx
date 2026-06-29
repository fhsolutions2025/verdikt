'use client'

// WS-2 — Campaign Explorer column (spec §Campaign Explorer): search, status tabs,
// filter popover, campaign cards with lifecycle progress, right-click actions
// (rename/duplicate/archive/delete/export), hover meta, and double-click pin.

import React from 'react'
import { ACCENT, PURPLE } from '@/components/company/marketing/director/theme'
import { CampaignContextMenu } from './CampaignContextMenu'
import { CampaignFilterPopover, type CampaignFilter } from './CampaignFilterPopover'

export interface ExplorerCampaign {
  id: string
  name: string
  status: string
  created_at: string
}

type Tab = 'all' | 'active' | 'archived'

const STAGE_PROGRESS: Record<string, number> = {
  draft: 5, planning: 20, generating: 55, in_review: 75, awaiting_review: 75,
  revision: 65, approved: 90, scheduled: 95, publishing: 97, published: 100,
  completed: 100, archived: 100, voided: 100,
}
function stageProgress(status: string): number {
  return STAGE_PROGRESS[(status || '').toLowerCase()] ?? 10
}

function statusBucket(s: string): Tab {
  const v = (s || '').toLowerCase()
  if (v === 'archived' || v === 'voided' || v === 'published' || v === 'completed') return 'archived'
  return 'active'
}

const PIN_KEY = 'verdikt_ws_pinned_campaigns'

export function CampaignExplorer({
  campaigns, selectedId, onSelect, onNew, onRefresh,
}: {
  campaigns: ExplorerCampaign[]
  selectedId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onRefresh?: () => void
}): React.JSX.Element {
  const [q, setQ] = React.useState('')
  const [tab, setTab] = React.useState<Tab>('all')
  const [filter, setFilter] = React.useState<CampaignFilter>({ statuses: [], minHealth: 0 })
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [menu, setMenu] = React.useState<{ id: string; name: string; x: number; y: number } | null>(null)
  const [pinned, setPinned] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => { try { setPinned(JSON.parse(localStorage.getItem(PIN_KEY) || '[]')) } catch { /* ignore */ } }, [])
  const togglePin = (id: string) => setPinned(prev => {
    const next = prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    try { localStorage.setItem(PIN_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    return next
  })

  const filtered = campaigns
    .filter(c => {
      if (q && !c.name.toLowerCase().includes(q.toLowerCase())) return false
      if (tab !== 'all' && statusBucket(c.status) !== tab) return false
      if (filter.statuses.length && !filter.statuses.includes(c.status.toLowerCase())) return false
      if (filter.minHealth > 0 && stageProgress(c.status) < filter.minHealth) return false
      return true
    })
    .sort((a, b) => (pinned.includes(b.id) ? 1 : 0) - (pinned.includes(a.id) ? 1 : 0))

  const runAction = async (id: string, name: string, action: 'rename' | 'duplicate' | 'archive' | 'delete' | 'export') => {
    if (busy) return
    if (action === 'export') {
      const data = await fetch(`/api/company/marketing/v2/campaigns/${id}`).then(r => r.json()).catch(() => null)
      if (data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob); const a = document.createElement('a')
        a.href = url; a.download = `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`; a.click(); URL.revokeObjectURL(url)
      }
      return
    }
    let body: { action: string; name?: string } = { action }
    if (action === 'rename') {
      const next = typeof window !== 'undefined' ? window.prompt('Rename campaign', name) : null
      if (!next || !next.trim()) return
      body = { action, name: next.trim() }
    }
    if (action === 'delete' && typeof window !== 'undefined' && !window.confirm(`Delete "${name}"? This cannot be undone.`)) return
    setBusy(true)
    try {
      await fetch(`/api/company/marketing/v2/campaigns/${id}/actions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      onRefresh?.()
    } finally { setBusy(false) }
  }

  return (
    <div style={{ width: 280, flexShrink: 0, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', background: 'var(--bg-base)' }}>
      <div style={{ padding: '12px 12px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search campaigns…"
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 12px', color: 'var(--text-strong)', fontSize: 13, outline: 'none' }} />
        <button onClick={onNew} style={{ width: '100%', background: PURPLE, color: '#fff', border: 'none', borderRadius: 9, padding: '9px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ New Campaign</button>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {(['all', 'active', 'archived'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, background: tab === t ? 'var(--bg-inset)' : 'transparent', border: `1px solid ${tab === t ? 'var(--border)' : 'transparent'}`,
              borderRadius: 8, padding: '5px', fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
              color: tab === t ? 'var(--text-strong)' : 'var(--text-faint)',
            }}>{t}</button>
          ))}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setFilterOpen(o => !o)} title="Filter" style={{
              background: filter.statuses.length || filter.minHealth ? 'rgba(108,63,197,0.16)' : 'transparent',
              border: `1px solid ${filter.statuses.length || filter.minHealth ? PURPLE + '55' : 'var(--border)'}`,
              borderRadius: 8, padding: '5px 9px', fontSize: 12, cursor: 'pointer', color: 'var(--text-dim)',
            }}>⛃</button>
            {filterOpen && <CampaignFilterPopover value={filter} onChange={setFilter} onClose={() => setFilterOpen(false)} />}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 12px', color: 'var(--text-faint)' }}>
            <div style={{ fontSize: 26, marginBottom: 8 }}>🗂️</div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>{q || tab !== 'all' || filter.statuses.length ? 'No campaigns match.' : 'No campaigns yet.'}</div>
            {!q && tab === 'all' && !filter.statuses.length && <button onClick={onNew} style={{ marginTop: 10, background: 'none', border: `1px solid ${PURPLE}55`, color: PURPLE, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Create your first campaign</button>}
          </div>
        ) : filtered.map(c => {
          const sel = c.id === selectedId
          const isPinned = pinned.includes(c.id)
          const progress = stageProgress(c.status)
          return (
            <div
              key={c.id}
              onClick={() => onSelect(c.id)}
              onDoubleClick={() => togglePin(c.id)}
              onContextMenu={(e) => { e.preventDefault(); setMenu({ id: c.id, name: c.name, x: e.clientX, y: e.clientY }) }}
              style={{
                display: 'flex', flexDirection: 'column', gap: 7, width: '100%', textAlign: 'left',
                padding: '11px 12px', borderRadius: 11, cursor: 'pointer',
                background: sel ? 'rgba(108,63,197,0.12)' : 'var(--bg-surface)',
                border: `1px solid ${sel ? PURPLE + '55' : 'var(--border)'}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isPinned && <span title="Pinned" style={{ fontSize: 11 }}>📌</span>}
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-strong)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setMenu({ id: c.id, name: c.name, x: e.clientX, y: e.clientY }) }}
                  title="Actions" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 15, lineHeight: 1, padding: '0 2px' }}
                >⋯</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'capitalize', color: 'var(--text-faint)' }}>{c.status}</span>
                <span style={{ fontSize: 10.5, color: 'var(--text-faintest)' }}>· {new Date(c.created_at).toLocaleDateString()}</span>
              </div>
              <div style={{ height: 4, background: 'var(--border-soft)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${progress}%`, background: progress >= 100 ? ACCENT : PURPLE, borderRadius: 3 }} />
              </div>
            </div>
          )
        })}
      </div>

      {menu && (
        <CampaignContextMenu
          x={menu.x} y={menu.y}
          onAction={(action) => runAction(menu.id, menu.name, action)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
