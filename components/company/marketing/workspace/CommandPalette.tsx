'use client'

// WS-6 — global command palette (⌘K), interaction map §9.
// Searchable across actions · navigation · campaigns. Arrow-key navigation, Enter to
// invoke, Esc to close, recent items shown when the query is empty. Pure UI: every
// item carries a `run` callback supplied by the shell, so the palette stays decoupled
// from routing/state.

import React from 'react'
import { ACCENT, PURPLE } from '@/components/company/marketing/director/theme'

export interface PaletteCampaign { id: string; name: string }

export interface CommandItem {
  id: string
  label: string
  hint?: string
  icon: string
  group: 'Actions' | 'Navigate' | 'Campaigns'
  keywords?: string
  run: () => void
}

const RECENT_KEY = 'verdikt_ws_palette_recent'

function loadRecent(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(v) ? v.slice(0, 6) : [] } catch { return [] }
}
function pushRecent(id: string): void {
  try {
    const next = [id, ...loadRecent().filter((x) => x !== id)].slice(0, 6)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch { /* ignore */ }
}

export function CommandPalette({
  open, onClose, actions, navItems, campaigns, onSelectCampaign,
}: {
  open: boolean
  onClose: () => void
  actions: CommandItem[]
  navItems: CommandItem[]
  campaigns: PaletteCampaign[]
  onSelectCampaign: (id: string) => void
}): React.JSX.Element | null {
  const [query, setQuery] = React.useState('')
  const [active, setActive] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [recent, setRecent] = React.useState<string[]>([])

  React.useEffect(() => {
    if (open) {
      setQuery(''); setActive(0); setRecent(loadRecent())
      const t = setTimeout(() => inputRef.current?.focus(), 30)
      return () => clearTimeout(t)
    }
  }, [open])

  const campaignItems: CommandItem[] = React.useMemo(
    () => campaigns.map((c) => ({
      id: `campaign:${c.id}`, label: c.name || 'Untitled campaign', icon: '🗂️', group: 'Campaigns' as const,
      keywords: 'campaign open', run: () => onSelectCampaign(c.id),
    })),
    [campaigns, onSelectCampaign],
  )

  const all = React.useMemo(() => [...actions, ...navItems, ...campaignItems], [actions, navItems, campaignItems])

  const q = query.trim().toLowerCase()
  const filtered = React.useMemo(() => {
    if (!q) {
      // Empty query → recent first (resolved against the full set), then actions + nav.
      const recentItems = recent.map((id) => all.find((i) => i.id === id)).filter((x): x is CommandItem => !!x)
      const rest = [...actions, ...navItems].filter((i) => !recent.includes(i.id))
      return [...recentItems, ...rest]
    }
    return all.filter((i) => (`${i.label} ${i.group} ${i.keywords ?? ''}`).toLowerCase().includes(q))
  }, [q, all, actions, navItems, recent])

  React.useEffect(() => { setActive(0) }, [q])

  if (!open) return null

  const invoke = (item: CommandItem) => { pushRecent(item.id); onClose(); item.run() }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); return }
    if (e.key === 'Enter') { e.preventDefault(); const it = filtered[active]; if (it) invoke(it) }
  }

  // Group the filtered list for section headers while keeping a flat index for nav.
  let flatIndex = -1
  const showRecentHeader = !q && recent.length > 0
  const groupsOrder: CommandItem['group'][] = ['Actions', 'Navigate', 'Campaigns']

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        style={{ width: 'min(620px, 92vw)', maxHeight: '64vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 24px 70px rgba(0,0,0,0.5)', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 16, color: 'var(--text-faint)' }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search campaigns, assets, actions…"
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-strong)', fontSize: 15 }}
          />
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-faint)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 6px' }}>Esc</span>
        </div>

        <div style={{ overflowY: 'auto', padding: 8 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>No matches for “{query}”.</div>
          ) : !q ? (
            <>
              {showRecentHeader && <GroupHeader>Recent</GroupHeader>}
              {filtered.map((item) => { flatIndex++; const idx = flatIndex; return <Row key={item.id} item={item} active={idx === active} onHover={() => setActive(idx)} onClick={() => invoke(item)} /> })}
            </>
          ) : (
            groupsOrder.map((g) => {
              const items = filtered.filter((i) => i.group === g)
              if (items.length === 0) return null
              return (
                <div key={g}>
                  <GroupHeader>{g}</GroupHeader>
                  {items.map((item) => { flatIndex++; const idx = flatIndex; return <Row key={item.id} item={item} active={idx === active} onHover={() => setActive(idx)} onClick={() => invoke(item)} /> })}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

function GroupHeader({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', padding: '8px 10px 4px' }}>{children}</div>
}

function Row({ item, active, onHover, onClick }: { item: CommandItem; active: boolean; onHover: () => void; onClick: () => void }) {
  return (
    <div
      role="option"
      aria-selected={active}
      onMouseEnter={onHover}
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 10px', borderRadius: 9, cursor: 'pointer', background: active ? 'var(--bg-inset)' : 'transparent' }}
    >
      <span style={{ width: 20, textAlign: 'center', fontSize: 14 }}>{item.icon}</span>
      <span style={{ flex: 1, fontSize: 13.5, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
      {item.hint && <span style={{ fontSize: 11, color: active ? ACCENT : 'var(--text-faint)', fontWeight: 600 }}>{item.hint}</span>}
      {active && <span style={{ fontSize: 12, color: PURPLE }}>↵</span>}
    </div>
  )
}
