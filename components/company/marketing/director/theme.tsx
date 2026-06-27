'use client'

// Shared design system for the Campaign Director flagship workspace.
// Everything here is built on the existing CSS-variable tokens (app/globals.css)
// so both light and dark themes come for free (theme is set via data-theme on
// <html> by components/shared/ThemeProvider.tsx). The four UI sub-components
// (NavRail / ChatPanel / AssetGrid / CreationCanvas) import ONLY from this module
// for styling + primitives, so the look stays consistent and themable.

import React from 'react'
import type { AssetState } from './types'

// ── Brand accents (read identically on both themes) ─────────────────────────────
export const ACCENT = '#00C853'        // --green
export const ACCENT_DEEP = '#00A844'   // --green-dark
export const PURPLE = '#6C3FC5'
export const PURPLE_LIGHT = '#9B6FF5'
export const ORANGE = '#E05C20'
export const RED = '#DC2626'
export const AMBER = '#E0A020'

// Signature gradient used for progress + hero accents (purple→green like the mockup).
export const GRADIENT = `linear-gradient(90deg, ${PURPLE_LIGHT}, ${ACCENT})`

// ── Reusable style objects (token-driven) ───────────────────────────────────────
export const S = {
  card: {
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg, 16px)', boxShadow: 'var(--shadow-card)',
  } as React.CSSProperties,
  inset: {
    background: 'var(--bg-inset)', border: '1px solid var(--border-soft)',
    borderRadius: 'var(--radius-md, 12px)',
  } as React.CSSProperties,
  input: {
    width: '100%', padding: '10px 12px', background: 'var(--bg-base)',
    border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text-strong)',
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
  } as React.CSSProperties,
  bubble: {
    fontSize: 14, lineHeight: 1.55, background: 'var(--bg-surface)',
    border: '1px solid var(--border)', borderRadius: 16, padding: '14px 16px',
    color: 'var(--text)', boxShadow: 'var(--shadow-card)',
  } as React.CSSProperties,
}

// ── Status / state colors ───────────────────────────────────────────────────────
export function assetStateColor(state: AssetState): string {
  return state === 'completed' ? ACCENT
    : state === 'in_progress' ? PURPLE_LIGHT
    : state === 'failed' ? RED
    : 'var(--text-faint)'           // queued
}
export function assetStateLabel(state: AssetState): string {
  return state === 'completed' ? 'Completed'
    : state === 'in_progress' ? 'In Progress'
    : state === 'failed' ? 'Failed'
    : 'Queued'
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#6B7280', PLANNING: '#3B82F6', GENERATING: AMBER, IN_REVIEW: PURPLE_LIGHT,
  READY: ACCENT, LIVE: ACCENT, COMPLETED: ACCENT, BLOCKED: RED, ARCHIVED: '#6B7280',
  pending: '#6B7280', running: AMBER, succeeded: ACCENT, failed: RED,
  draft: '#6B7280', needs_review: PURPLE_LIGHT, approved: ACCENT, exported: ACCENT,
}
export function statusColor(status: string): string { return STATUS_COLORS[status] ?? '#6B7280' }

// ── Primitive components ────────────────────────────────────────────────────────
type BtnVariant = 'primary' | 'ghost' | 'soft'
export function Btn({ children, onClick, disabled, variant = 'primary', size = 'md', style, title }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean
  variant?: BtnVariant; size?: 'sm' | 'md'; style?: React.CSSProperties; title?: string
}) {
  const pad = size === 'sm' ? '6px 12px' : '9px 16px'
  const fs = size === 'sm' ? 12 : 13.5
  const base: React.CSSProperties = {
    padding: pad, borderRadius: 12, fontSize: fs, fontWeight: 700, cursor: disabled ? 'default' : 'pointer',
    border: '1px solid transparent', transition: 'opacity .15s, background .15s', opacity: disabled ? 0.5 : 1,
    display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
  }
  const variants: Record<BtnVariant, React.CSSProperties> = {
    primary: { background: PURPLE, color: '#fff' },
    ghost:   { background: 'transparent', border: '1px solid var(--border-strong)', color: 'var(--text-strong)' },
    soft:    { background: 'var(--fill-soft)', color: 'var(--text-strong)' },
  }
  return <button title={title} onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant], ...style }}>{children}</button>
}

export function Badge({ children, color = ACCENT, soft = true }: { children: React.ReactNode; color?: string; soft?: boolean }) {
  return <span style={{
    fontSize: 11, fontWeight: 700, color: soft ? color : '#fff',
    background: soft ? `${color}1F` : color, padding: '3px 9px', borderRadius: 999,
    display: 'inline-flex', alignItems: 'center', gap: 5, lineHeight: 1.4,
  }}>{children}</span>
}

export function Dot({ color = ACCENT, size = 8 }: { color?: string; size?: number }) {
  return <span style={{ width: size, height: size, borderRadius: 999, background: color, flexShrink: 0, display: 'inline-block' }} />
}

export function Avatar({ label, src, size = 34, ring }: { label?: string; src?: string; size?: number; ring?: boolean }) {
  const initials = (label ?? '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <span style={{
      width: size, height: size, borderRadius: 999, flexShrink: 0, overflow: 'hidden',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: src ? 'transparent' : GRADIENT, color: '#fff', fontSize: size * 0.36, fontWeight: 800,
      border: ring ? '2px solid var(--bg-surface)' : 'none',
    }}>
      {src ? <img src={src} alt={label ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
    </span>
  )
}

export function ProgressBar({ value, height = 8, gradient = true, color = ACCENT }: { value: number; height?: number; gradient?: boolean; color?: string }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div style={{ width: '100%', height, borderRadius: 999, background: 'var(--fill-soft)', overflow: 'hidden' }}>
      <div style={{ width: `${v}%`, height: '100%', borderRadius: 999, background: gradient ? GRADIENT : color, transition: 'width .4s ease' }} />
    </div>
  )
}

// Lightweight inline spinner (no deps).
export function Spinner({ size = 18, color = PURPLE_LIGHT }: { size?: number; color?: string }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: 999, display: 'inline-block',
      border: `2px solid ${color}40`, borderTopColor: color, animation: 'vd-spin .8s linear infinite',
    }} />
  )
}

// Inject the keyframes once (spinner + subtle pulse). Render <DirectorKeyframes/> high
// in the tree so animations work without touching globals.css.
export function DirectorKeyframes() {
  return <style>{`
@keyframes vd-spin { to { transform: rotate(360deg) } }
@keyframes vd-pulse { 0%,100% { opacity: .5 } 50% { opacity: 1 } }
@keyframes vd-dots { 0%,80%,100% { transform: scale(.6); opacity:.4 } 40% { transform: scale(1); opacity:1 } }
`}</style>
}

// Three-dot "typing" indicator for the chat.
export function TypingDots() {
  const dot: React.CSSProperties = { width: 7, height: 7, borderRadius: 999, background: 'var(--text-faint)', display: 'inline-block', animation: 'vd-dots 1.2s infinite ease-in-out' }
  return (
    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
      <i style={{ ...dot, animationDelay: '0s' }} />
      <i style={{ ...dot, animationDelay: '.15s' }} />
      <i style={{ ...dot, animationDelay: '.3s' }} />
    </span>
  )
}
