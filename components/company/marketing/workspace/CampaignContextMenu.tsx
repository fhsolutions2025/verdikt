'use client'

import React from 'react'
import { ACCENT, RED } from '@/components/company/marketing/director/theme'

type CampaignAction = 'rename' | 'duplicate' | 'archive' | 'delete' | 'export'

interface CampaignContextMenuProps {
  x: number
  y: number
  onAction: (action: CampaignAction) => void
  onClose: () => void
}

interface MenuItem {
  id: CampaignAction
  label: string
  icon: string
  danger?: boolean
}

const ITEMS: MenuItem[] = [
  { id: 'rename', label: 'Rename', icon: '✏️' },
  { id: 'duplicate', label: 'Duplicate', icon: '⧉' },
  { id: 'archive', label: 'Archive', icon: '🗄️' },
  { id: 'export', label: 'Export', icon: '⬇️' },
]

const MENU_HEIGHT = 220

export function CampaignContextMenu({ x, y, onAction, onClose }: CampaignContextMenuProps): React.JSX.Element {
  const [hovered, setHovered] = React.useState<CampaignAction | null>(null)

  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0
  const openAbove = viewportHeight > 0 && y + MENU_HEIGHT > viewportHeight
  const top = openAbove ? Math.max(8, y - MENU_HEIGHT) : y

  const handleClick = (id: CampaignAction): void => {
    onAction(id)
    onClose()
  }

  const rowStyle = (item: MenuItem): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    color: item.danger ? RED : 'var(--text-strong)',
    background: hovered === item.id ? 'var(--bg-inset)' : 'transparent',
  })

  const renderItem = (item: MenuItem): React.JSX.Element => (
    <div
      key={item.id}
      role="menuitem"
      tabIndex={0}
      style={rowStyle(item)}
      onMouseEnter={() => setHovered(item.id)}
      onMouseLeave={() => setHovered((prev) => (prev === item.id ? null : prev))}
      onClick={() => handleClick(item.id)}
    >
      <span aria-hidden style={{ width: 18, textAlign: 'center', color: item.danger ? RED : ACCENT }}>
        {item.icon}
      </span>
      <span>{item.label}</span>
    </div>
  )

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'transparent' }}
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        role="menu"
        style={{
          position: 'fixed',
          left: x,
          top,
          zIndex: 81,
          minWidth: 180,
          padding: 6,
          borderRadius: 10,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
        }}
      >
        {ITEMS.map(renderItem)}
        <div style={{ height: 1, margin: '6px 4px', background: 'var(--border-soft)' }} />
        {renderItem({ id: 'delete', label: 'Delete', icon: '🗑️', danger: true })}
      </div>
    </>
  )
}
