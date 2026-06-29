'use client'

// WS-1 — global left sidebar for the five-region Campaign Workspace (spec §Left Sidebar).
// 16 nav items, collapse-to-icons (persisted), org switcher, user, AI-credits card.
// Items without a destination yet are disabled with an explanatory tooltip (universal
// disabled-state rule) rather than dead links.

import React from 'react'
import Link from 'next/link'
import { ACCENT } from '@/components/company/marketing/director/theme'

export interface SidebarItem {
  id: string
  label: string
  icon: string
  soon?: boolean   // no destination yet → disabled + tooltip
}

export const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'dashboard', label: 'Home', icon: '🏠' },
  { id: 'campaigns', label: 'Campaigns', icon: '🗂️' },
  { id: 'director', label: 'Campaign Director', icon: '🎬' },
  { id: 'assets', label: 'Assets', icon: '🖼️' },
  { id: 'copy_studio', label: 'Copy Studio', icon: '✍️', soon: true },
  { id: 'image_studio', label: 'Image Studio', icon: '🎨', soon: true },
  { id: 'video_studio', label: 'Video Studio', icon: '🎞️', soon: true },
  { id: 'brand', label: 'Brand Kit', icon: '🏷️' },
  { id: 'knowledge', label: 'Knowledge Base', icon: '📚' },
  { id: 'publishing', label: 'Publishing', icon: '🚀' },
  { id: 'approvals', label: 'Approvals', icon: '✅' },
  { id: 'analytics', label: 'Analytics', icon: '📊' },
  { id: 'calendar', label: 'Calendar', icon: '📅' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
  { id: 'help', label: 'Help', icon: '❓', soon: true },
]

const COLLAPSE_KEY = 'verdikt_ws_sidebar_collapsed'

export function Sidebar({
  active, onNavigate, org, user, credits, collapsed: collapsedProp, onToggleCollapse,
}: {
  active: string
  onNavigate: (id: string) => void
  org?: { name: string; plan?: string }
  user?: { name: string; role?: string }
  credits?: { used: number; total: number; resetDays?: number }
  // Optional controlled collapse (WS-6 ⌘B + WS-7 responsive). Falls back to internal state.
  collapsed?: boolean
  onToggleCollapse?: () => void
}): React.JSX.Element {
  const [collapsedState, setCollapsedState] = React.useState(false)
  React.useEffect(() => {
    if (collapsedProp !== undefined) return
    try { setCollapsedState(localStorage.getItem(COLLAPSE_KEY) === '1') } catch { /* ignore */ }
  }, [collapsedProp])
  const collapsed = collapsedProp ?? collapsedState
  const toggle = () => {
    if (onToggleCollapse) { onToggleCollapse(); return }
    setCollapsedState(c => { const n = !c; try { localStorage.setItem(COLLAPSE_KEY, n ? '1' : '0') } catch { /* ignore */ }; return n })
  }

  const width = collapsed ? 64 : 232
  const lowCredits = credits ? credits.used / Math.max(credits.total, 1) > 0.9 : false

  return (
    <nav style={{
      width, flexShrink: 0, height: '100%', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: 4,
      borderRight: '1px solid var(--border)', background: 'var(--bg-surface)', padding: '12px 10px',
      transition: 'width .15s',
    }}>
      {/* Wordmark + collapse */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px 12px' }}>
        <Link href="/company" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontWeight: 800, fontSize: 18, color: ACCENT }}>V</span>
          {!collapsed && <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-strong)', whiteSpace: 'nowrap' }}>VERDIKT</span>}
        </Link>
        <div style={{ flex: 1 }} />
        <button onClick={toggle} title={collapsed ? 'Expand' : 'Collapse'} aria-label="Toggle sidebar"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 14, padding: 2 }}>
          {collapsed ? '»' : '«'}
        </button>
      </div>

      {/* Org switcher */}
      {org && !collapsed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 8px', borderRadius: 10, background: 'var(--bg-inset)', marginBottom: 6 }}>
          <span style={{ width: 26, height: 26, borderRadius: 7, background: ACCENT + '22', color: ACCENT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>{org.name.charAt(0)}</span>
          <div style={{ minWidth: 0, lineHeight: 1.2 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{org.name}</div>
            {org.plan && <div style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>{org.plan}</div>}
          </div>
        </div>
      )}

      {/* Nav items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
        {SIDEBAR_ITEMS.map(item => {
          const isActive = item.id === active
          const disabled = !!item.soon
          return (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              title={collapsed ? item.label : (disabled ? `${item.label} — coming soon` : undefined)}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => { if (!disabled) onNavigate(item.id) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 11, width: '100%', boxSizing: 'border-box',
                padding: collapsed ? '9px 0' : '9px 10px', justifyContent: collapsed ? 'center' : 'flex-start',
                border: 'none', borderRadius: 9, font: 'inherit', textAlign: 'left',
                background: isActive ? 'rgba(108,63,197,0.14)' : 'transparent',
                color: isActive ? '#9B6FF5' : disabled ? 'var(--text-faintest)' : 'var(--text-dim)',
                fontSize: 13.5, fontWeight: isActive ? 700 : 500,
                cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1,
              }}
            >
              <span style={{ fontSize: 16, width: 18, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
              {!collapsed && item.soon && <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-faint)', background: 'var(--fill-soft)', borderRadius: 999, padding: '2px 6px' }}>Soon</span>}
            </button>
          )
        })}
      </div>

      <div style={{ flex: 1 }} />

      {/* AI credits */}
      {credits && !collapsed && (
        <div style={{ padding: '10px 10px', borderRadius: 10, background: 'var(--bg-inset)', marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-dim)' }}>
            <span>AI Credits</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: lowCredits ? '#E0A020' : 'var(--text-strong)' }}>{credits.used.toLocaleString()} / {credits.total.toLocaleString()}</span>
          </div>
          <div style={{ height: 5, background: 'var(--border-soft)', borderRadius: 3, marginTop: 6, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, (credits.used / Math.max(credits.total, 1)) * 100)}%`, background: lowCredits ? '#E0A020' : ACCENT, borderRadius: 3 }} />
          </div>
          {typeof credits.resetDays === 'number' && <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 5 }}>Resets in {credits.resetDays} days</div>}
        </div>
      )}

      {/* User */}
      {user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 6px', borderTop: '1px solid var(--border-soft)' }}>
          <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#6C3FC5', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{user.name.charAt(0)}</span>
          {!collapsed && (
            <div style={{ minWidth: 0, lineHeight: 1.2 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
              {user.role && <div style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>{user.role}</div>}
            </div>
          )}
        </div>
      )}
    </nav>
  )
}
