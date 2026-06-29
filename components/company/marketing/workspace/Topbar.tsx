'use client'

// WS-1 — workspace topbar (spec §Topbar): breadcrumb, campaign title + status, favorite,
// AI-agents pill, Create menu, global search (⌘K), notifications, help.

import React from 'react'
import { ACCENT, PURPLE } from '@/components/company/marketing/director/theme'

export function Topbar({
  campaignTitle, campaignStatus, activeAgents, favorite,
  onBreadcrumb, onToggleFavorite, onCreate, onOpenPalette, onOpenNotifications, onOpenHelp,
}: {
  campaignTitle: string
  campaignStatus?: string
  activeAgents: number
  favorite?: boolean
  onBreadcrumb: () => void
  onToggleFavorite?: () => void
  onCreate: (type: string) => void
  onOpenPalette: () => void
  onOpenNotifications?: () => void
  onOpenHelp?: () => void
}): React.JSX.Element {
  const [createOpen, setCreateOpen] = React.useState(false)

  return (
    <header style={{
      display: 'flex', alignItems: 'center', gap: 14, height: 52, flexShrink: 0,
      padding: '0 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)',
    }}>
      {/* Breadcrumb + title */}
      <button onClick={onBreadcrumb} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 13, padding: 0 }}>Campaigns</button>
      <span style={{ color: 'var(--text-faintest)' }}>/</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '28vw' }}>{campaignTitle}</span>
      {campaignStatus && (
        <span style={{ fontSize: 10.5, fontWeight: 700, color: ACCENT, background: ACCENT + '1F', padding: '2px 8px', borderRadius: 999 }}>{campaignStatus}</span>
      )}
      <button onClick={onToggleFavorite} title="Favorite" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: favorite ? '#E0A020' : 'var(--text-faint)', padding: 0 }}>{favorite ? '★' : '☆'}</button>

      <div style={{ flex: 1 }} />

      {/* AI agents pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 11px', borderRadius: 999, background: 'var(--bg-inset)', border: '1px solid var(--border)' }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: ACCENT, boxShadow: `0 0 6px ${ACCENT}` }} />
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>AI Agents</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-strong)' }}>{activeAgents} Active</span>
      </div>

      {/* Create */}
      <div style={{ position: 'relative' }}>
        <button onClick={() => setCreateOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: PURPLE, color: '#fff', border: 'none', borderRadius: 9, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Create</button>
        {createOpen && (
          <>
            <div onClick={() => setCreateOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 41, minWidth: 180, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 6, boxShadow: '0 12px 32px rgba(0,0,0,0.35)' }}>
              {[['campaign', 'New campaign'], ['asset', 'New asset'], ['copy', 'New copy'], ['image', 'New image'], ['video', 'New video']].map(([t, label]) => (
                <button key={t} onClick={() => { setCreateOpen(false); onCreate(t) }} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: 13, padding: '8px 10px', borderRadius: 7 }}>{label}</button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Search / ⌘K */}
      <button onClick={onOpenPalette} title="Search (⌘K)" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 9, padding: '6px 12px', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 12.5 }}>
        <span>🔍</span><span>Search</span><span style={{ fontFamily: 'monospace', fontSize: 11, opacity: 0.7 }}>⌘K</span>
      </button>

      <button onClick={onOpenNotifications} title="Notifications" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text-dim)' }}>🔔</button>
      <button onClick={onOpenHelp} title="Help" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: 'var(--text-dim)' }}>❓</button>
    </header>
  )
}
