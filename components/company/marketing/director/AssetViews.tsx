'use client'

// Alternate views (timeline + kanban) and a right-click context menu for the
// Asset Workspace (spec §Asset Workspace view_modes + right-click). Self-contained:
// only React + theme tokens + the AssetItem type. Inline styles on CSS variables.

import React from 'react'
import { ACCENT, PURPLE, RED, AMBER } from '@/components/company/marketing/director/theme'
import type { AssetItem } from './types'

// ── Local helpers ────────────────────────────────────────────────────────────────
function stateColor(state: AssetItem['state']): string {
  return state === 'completed' ? ACCENT
    : state === 'in_progress' ? AMBER
    : state === 'failed' ? RED
    : 'var(--text-faint)'        // queued
}

function stateLabel(state: AssetItem['state']): string {
  return state === 'completed' ? 'Completed'
    : state === 'in_progress' ? 'In Progress'
    : state === 'failed' ? 'Failed'
    : 'Queued'
}

function typeIcon(type: AssetItem['type']): string {
  return type === 'image' ? '🖼️'
    : type === 'video' ? '🎬'
    : type === 'carousel' ? '🟦'
    : '✍️'              // copy
}

// ── 1. Timeline view ──────────────────────────────────────────────────────────────
interface AssetTimelineViewProps {
  assets: AssetItem[]
  onSelect: (id: string) => void
}

export function AssetTimelineView({ assets, onSelect }: AssetTimelineViewProps) {
  return (
    <div style={{ position: 'relative', padding: '4px 0 4px 4px' }}>
      {/* The vertical line running through the dots. */}
      <div
        aria-hidden
        style={{
          position: 'absolute', top: 0, bottom: 0, left: 11, width: 2,
          background: 'var(--border)',
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {assets.map(asset => (
          <div
            key={asset.id}
            onClick={() => onSelect(asset.id)}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(asset.id) } }}
            style={{
              position: 'relative', display: 'flex', alignItems: 'stretch', gap: 14,
              cursor: 'pointer', paddingLeft: 4,
            }}
          >
            {/* Left dot sitting on the line. */}
            <span
              style={{
                position: 'relative', zIndex: 1, flexShrink: 0, marginTop: 16,
                width: 14, height: 14, borderRadius: 999, background: stateColor(asset.state),
                border: '3px solid var(--bg-base)', boxSizing: 'border-box',
              }}
            />
            {/* Card. */}
            <div
              style={{
                flex: 1, minWidth: 0, background: 'var(--bg-surface)',
                border: '1px solid var(--border)', borderRadius: 12,
                boxShadow: 'var(--shadow-card)', padding: '12px 14px',
                display: 'flex', alignItems: 'center', gap: 12,
              }}
            >
              <span style={{ fontSize: 22, flexShrink: 0, lineHeight: 1 }}>{typeIcon(asset.type)}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{
                  fontSize: 14, fontWeight: 700, color: 'var(--text-strong)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {asset.label}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>
                  {asset.channel ?? 'All channels'}
                </div>
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: stateColor(asset.state), flexShrink: 0 }}>
                {stateLabel(asset.state)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 2. Kanban view ──────────────────────────────────────────────────────────────
interface AssetKanbanViewProps {
  assets: AssetItem[]
  onSelect: (id: string) => void
}

const KANBAN_COLUMNS: { state: AssetItem['state']; title: string }[] = [
  { state: 'queued', title: 'Queued' },
  { state: 'in_progress', title: 'In Progress' },
  { state: 'completed', title: 'Completed' },
  { state: 'failed', title: 'Failed' },
]

export function AssetKanbanView({ assets, onSelect }: AssetKanbanViewProps) {
  return (
    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
      {KANBAN_COLUMNS.map(col => {
        const items = assets.filter(a => a.state === col.state)
        return (
          <div
            key={col.state}
            style={{
              flex: '1 0 200px', minWidth: 200,
              background: 'var(--bg-inset)', border: '1px solid var(--border-soft)',
              borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column', gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 2px 4px' }}>
              <span style={{ width: 9, height: 9, borderRadius: 999, background: stateColor(col.state), flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-strong)' }}>{col.title}</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-faint)', marginLeft: 'auto' }}>{items.length}</span>
            </div>
            {items.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-faint)', textAlign: 'center', padding: '14px 0' }}>—</div>
            ) : (
              items.map(asset => (
                <div
                  key={asset.id}
                  onClick={() => onSelect(asset.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(asset.id) } }}
                  style={{
                    background: 'var(--bg-surface)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: '9px 11px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 9,
                  }}
                >
                  <span style={{ fontSize: 17, flexShrink: 0, lineHeight: 1 }}>{typeIcon(asset.type)}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 700, color: 'var(--text-strong)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {asset.label}
                    </div>
                    {asset.channel && (
                      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>{asset.channel}</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── 3. Context menu ──────────────────────────────────────────────────────────────
interface AssetContextMenuProps {
  x: number
  y: number
  asset: AssetItem
  onAction: (action: string) => void
  onClose: () => void
}

interface MenuEntry {
  action: string
  label: string
  danger?: boolean
  divider?: boolean
}

const MENU_ITEMS: MenuEntry[] = [
  { action: 'open', label: 'Open' },
  { action: 'rename', label: 'Rename' },
  { action: 'duplicate', label: 'Duplicate' },
  { action: 'variants', label: 'Create variants' },
  { action: 'regenerate', label: 'Regenerate' },
  { action: 'approve', label: 'Approve' },
  { action: 'review', label: 'Send for review' },
  { action: 'export', label: 'Export' },
  { action: 'delete', label: 'Delete', danger: true, divider: true },
]

const MENU_WIDTH = 190
const MENU_EST_HEIGHT = 340

export function AssetContextMenu({ x, y, asset, onAction, onClose }: AssetContextMenuProps) {
  // Clamp on-screen (guard against SSR where window is undefined).
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const left = Math.max(8, Math.min(x, vw - MENU_WIDTH - 8))
  const top = Math.max(8, Math.min(y, vh - MENU_EST_HEIGHT - 8))

  const run = (action: string) => { onAction(action); onClose() }

  return (
    <>
      {/* Transparent backdrop: any click closes the menu. */}
      <div
        onClick={onClose}
        onContextMenu={e => { e.preventDefault(); onClose() }}
        style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'transparent' }}
      />
      <div
        role="menu"
        // Title attr surfaces which asset this menu acts on.
        title={asset.label}
        style={{
          position: 'fixed', left, top, zIndex: 81, minWidth: MENU_WIDTH,
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: 'var(--shadow-card, 0 8px 28px rgba(0,0,0,.22))',
          padding: 6, display: 'flex', flexDirection: 'column',
        }}
      >
        {MENU_ITEMS.map(item => (
          <React.Fragment key={item.action}>
            {item.divider && (
              <div style={{ height: 1, background: 'var(--border-soft)', margin: '5px 4px' }} />
            )}
            <button
              role="menuitem"
              onClick={() => run(item.action)}
              style={{
                appearance: 'none', border: 'none', background: 'transparent',
                textAlign: 'left', cursor: 'pointer', width: '100%',
                padding: '8px 10px', borderRadius: 7, fontSize: 13.5, fontWeight: 600,
                color: item.danger ? RED : 'var(--text-strong)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = item.danger ? `${RED}1F` : 'var(--fill-soft)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              {item.label}
            </button>
          </React.Fragment>
        ))}
      </div>
    </>
  )
}

// PURPLE is part of the canonical accent set for this workspace; kept available
// for callers theming menu/header chrome without re-importing the theme module.
export const ASSET_VIEW_ACCENT = PURPLE
