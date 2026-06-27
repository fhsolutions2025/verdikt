'use client'

import { useEffect } from 'react'

interface Props {
  open:      boolean
  onClose:   () => void
  title?:    string
  /** Drawer width in px (default 340). */
  width?:    number
  children:  React.ReactNode
}

// Right-anchored slide-over with a dimmed backdrop. Locks body scroll while open
// and closes on Escape. Used by the player hamburger menu and the Results panel.
export function SideDrawer({ open, onClose, title, width = 340, children }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden={!open}
        style={{
          position: 'fixed', inset: 0, zIndex: 60,
          backgroundColor: 'rgba(0,0,0,0.45)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.2s ease',
        }}
      />
      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title ?? 'Menu'}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 61,
          width, maxWidth: '88vw',
          backgroundColor: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-12px 0 40px rgba(0,0,0,0.18)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.24s cubic-bezier(0.4,0,0.2,1)',
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, backgroundColor: 'var(--bg-surface)', zIndex: 1 }}
        >
          <span className="text-sm font-bold" style={{ color: 'var(--text-strong)' }}>{title}</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center rounded-lg"
            style={{ width: 30, height: 30, border: 'none', background: 'var(--bg-inset)', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        {children}
      </aside>
    </>
  )
}
