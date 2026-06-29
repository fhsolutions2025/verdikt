'use client'

// Popover menus for the Campaign Director chat composer:
//  • SlashMenu  — slash commands (/ads, /blog, …) rendered above the composer.
//  • MentionMenu — agent mentions (@Copywriter, @Designer, …).
// Both are mouse-driven popovers built on the shared CSS-variable tokens so they
// theme for free. Keyboard navigation is intentionally out of scope.

import React from 'react'
import { ACCENT, PURPLE } from '@/components/company/marketing/director/theme'

// ── Data ─────────────────────────────────────────────────────────────────────
export const SLASH_COMMANDS: { id: string; label: string; hint: string }[] = [
  { id: 'ads', label: '/ads', hint: 'Generate ad assets' },
  { id: 'blog', label: '/blog', hint: 'Generate a blog' },
  { id: 'email', label: '/email', hint: 'Generate an email sequence' },
  { id: 'image', label: '/image', hint: 'Generate an image' },
  { id: 'video', label: '/video', hint: 'Generate a video' },
  { id: 'carousel', label: '/carousel', hint: 'Generate a carousel' },
  { id: 'review', label: '/review', hint: 'Review selected asset' },
  { id: 'translate', label: '/translate', hint: 'Translate selected asset' },
  { id: 'publish', label: '/publish', hint: 'Open publishing' },
  { id: 'seo', label: '/seo', hint: 'Run SEO optimization' },
]

export const AGENT_MENTIONS: { id: string; label: string }[] = [
  { id: 'Copywriter', label: '@Copywriter' },
  { id: 'Designer', label: '@Designer' },
  { id: 'VideoProducer', label: '@VideoProducer' },
  { id: 'SEO', label: '@SEO' },
  { id: 'BrandGuardian', label: '@BrandGuardian' },
  { id: 'Compliance', label: '@Compliance' },
]

// ── Shared styles ─────────────────────────────────────────────────────────────
const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'transparent',
  zIndex: 49,
}

const popoverStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: '100%',
  left: 0,
  marginBottom: 8,
  zIndex: 50,
  width: 300,
  maxHeight: 280,
  overflowY: 'auto',
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: 6,
  boxShadow: '0 -8px 28px rgba(0,0,0,0.3)',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
}

function onRowEnter(e: React.MouseEvent<HTMLButtonElement>): void {
  e.currentTarget.style.background = 'var(--bg-inset)'
}
function onRowLeave(e: React.MouseEvent<HTMLButtonElement>): void {
  e.currentTarget.style.background = 'transparent'
}

// ── SlashMenu ─────────────────────────────────────────────────────────────────
interface SlashMenuProps {
  query: string
  onSelect: (id: string) => void
  onClose: () => void
}

export function SlashMenu({ query, onSelect, onClose }: SlashMenuProps) {
  const q = query.trim().toLowerCase()
  const matches = q
    ? SLASH_COMMANDS.filter(
        (c) => c.id.toLowerCase().includes(q) || c.label.toLowerCase().includes(q),
      )
    : SLASH_COMMANDS

  if (matches.length === 0) return null

  return (
    <>
      <div style={backdropStyle} onClick={onClose} />
      <div style={popoverStyle} role="listbox">
        {matches.map((c) => (
          <button
            key={c.id}
            type="button"
            style={rowStyle}
            onMouseEnter={onRowEnter}
            onMouseLeave={onRowLeave}
            onClick={() => onSelect(c.id)}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                fontSize: 13,
                fontWeight: 700,
                color: ACCENT,
                flexShrink: 0,
              }}
            >
              {c.label}
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>{c.hint}</span>
          </button>
        ))}
      </div>
    </>
  )
}

// ── MentionMenu ───────────────────────────────────────────────────────────────
interface MentionMenuProps {
  query: string
  onSelect: (id: string) => void
  onClose: () => void
}

export function MentionMenu({ query, onSelect, onClose }: MentionMenuProps) {
  const q = query.trim().toLowerCase()
  const matches = q
    ? AGENT_MENTIONS.filter(
        (m) => m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q),
      )
    : AGENT_MENTIONS

  if (matches.length === 0) return null

  return (
    <>
      <div style={backdropStyle} onClick={onClose} />
      <div style={popoverStyle} role="listbox">
        {matches.map((m) => (
          <button
            key={m.id}
            type="button"
            style={rowStyle}
            onMouseEnter={onRowEnter}
            onMouseLeave={onRowLeave}
            onClick={() => onSelect(m.id)}
          >
            <span style={{ fontSize: 13.5, fontWeight: 700, color: PURPLE, flexShrink: 0 }}>
              {m.label}
            </span>
          </button>
        ))}
      </div>
    </>
  )
}
