'use client'

// Pure presentational message-card renderers for the Campaign Director chat
// (spec §Message Types). No data fetching — every card takes plain props and
// fires callbacks. Styling comes entirely from the shared director theme so the
// cards stay themable and consistent with the rest of the workspace.
//
// All cards are sized to sit inside a chat bubble (~85% of the column width).

import React from 'react'
import { ACCENT, PURPLE, AMBER, RED, S, Btn, Badge, Dot, ProgressBar } from '@/components/company/marketing/director/theme'

// ── Shared layout helpers ────────────────────────────────────────────────────────
const CARD_MAX = '85%'

function cardStyle(extra?: React.CSSProperties): React.CSSProperties {
  return { ...S.card, maxWidth: CARD_MAX, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, ...extra }
}
const titleStyle: React.CSSProperties = { fontSize: 14, fontWeight: 800, color: 'var(--text-strong)', lineHeight: 1.35 }
const bodyStyle: React.CSSProperties = { fontSize: 13, lineHeight: 1.5, color: 'var(--text)' }
const metaStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-faint)' }

// ─────────────────────────────────────────────────────────────────────────────────
// 1. RecommendationCard
// ─────────────────────────────────────────────────────────────────────────────────
interface RecommendationAction {
  id: string
  label: string
}
interface RecommendationCardProps {
  title: string
  reasoning: string
  eta?: string
  actions: RecommendationAction[]
  onAction: (id: string) => void
}
export function RecommendationCard({ title, reasoning, eta, actions, onAction }: RecommendationCardProps) {
  return (
    <div style={cardStyle()}>
      <div style={titleStyle}>{title}</div>
      <div style={bodyStyle}>{reasoning}</div>
      {eta ? <div style={metaStyle}>Est. time · {eta}</div> : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {actions.map((a, i) => (
          <Btn key={a.id} variant={i === 0 ? 'primary' : 'soft'} size="sm" onClick={() => onAction(a.id)}>
            {a.label}
          </Btn>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────────
// 2. ApprovalCard
// ─────────────────────────────────────────────────────────────────────────────────
interface ApprovalCardProps {
  title: string
  previewUrl?: string
  onApprove: () => void
  onReject: () => void
  onRequestChanges: () => void
}
export function ApprovalCard({ title, previewUrl, onApprove, onReject, onRequestChanges }: ApprovalCardProps) {
  return (
    <div style={cardStyle()}>
      <div style={titleStyle}>{title}</div>
      {previewUrl ? (
        <img
          src={previewUrl}
          alt={title}
          style={{ ...S.inset, width: '100%', maxHeight: 160, objectFit: 'cover', display: 'block' }}
        />
      ) : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Btn variant="primary" size="sm" onClick={onApprove} style={{ background: ACCENT }}>Approve</Btn>
        <Btn variant="ghost" size="sm" onClick={onReject} style={{ color: RED, borderColor: RED }}>Reject</Btn>
        <Btn variant="soft" size="sm" onClick={onRequestChanges}>Request changes</Btn>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────────
// 3. ComparisonCard
// ─────────────────────────────────────────────────────────────────────────────────
interface ComparisonOption {
  id: string
  label: string
  preview?: string
}
interface ComparisonCardProps {
  options: ComparisonOption[]
  onSelect: (id: string) => void
  onRegenerate: () => void
}
export function ComparisonCard({ options, onSelect, onRegenerate }: ComparisonCardProps) {
  return (
    <div style={cardStyle()}>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto' }}>
        {options.map((o) => (
          <div key={o.id} style={{ ...S.inset, flex: '1 1 0', minWidth: 120, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {o.preview ? (
              <img src={o.preview} alt={o.label} style={{ width: '100%', height: 96, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
            ) : null}
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1.35 }}>{o.label}</div>
            <Btn variant="primary" size="sm" onClick={() => onSelect(o.id)} style={{ width: '100%', justifyContent: 'center' }}>Select</Btn>
          </div>
        ))}
      </div>
      <div>
        <Btn variant="ghost" size="sm" onClick={onRegenerate}>Regenerate</Btn>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────────
// 4. ProgressCard
// ─────────────────────────────────────────────────────────────────────────────────
interface ProgressCardProps {
  agent: string
  label: string
  percent: number
  done: number
  total: number
  eta?: string
}
export function ProgressCard({ agent, label, percent, done, total, eta }: ProgressCardProps) {
  return (
    <div style={cardStyle()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={titleStyle}>{agent}</span>
        <Badge color={PURPLE}>{Math.round(Math.max(0, Math.min(100, percent)))}%</Badge>
      </div>
      <div style={bodyStyle}>{label}</div>
      <ProgressBar value={percent} />
      <div style={{ ...metaStyle, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span>{done}/{total} done</span>
        {eta ? <span>ETA · {eta}</span> : null}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────────
// 5. ChecklistCard
// ─────────────────────────────────────────────────────────────────────────────────
interface ChecklistItem {
  label: string
  done: boolean
}
interface ChecklistCardProps {
  title: string
  items: ChecklistItem[]
}
export function ChecklistCard({ title, items }: ChecklistCardProps) {
  return (
    <div style={cardStyle()}>
      <div style={titleStyle}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{
              width: 18, height: 18, borderRadius: 5, flexShrink: 0, fontSize: 12, fontWeight: 800,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: it.done ? ACCENT : 'transparent', color: it.done ? '#fff' : 'var(--text-faint)',
              border: it.done ? '1px solid transparent' : '1px solid var(--border-strong)',
            }}>{it.done ? '✓' : ''}</span>
            <span style={{ fontSize: 13, lineHeight: 1.4, color: it.done ? 'var(--text-faint)' : 'var(--text)', textDecoration: it.done ? 'line-through' : 'none' }}>
              {it.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────────
// 6. TableCard
// ─────────────────────────────────────────────────────────────────────────────────
interface TableCardProps {
  columns: string[]
  rows: string[][]
}
export function TableCard({ columns, rows }: TableCardProps) {
  const cellStyle: React.CSSProperties = { padding: '7px 10px', fontSize: 12.5, textAlign: 'left', borderBottom: '1px solid var(--border-soft)' }
  return (
    <div style={cardStyle({ padding: 0, overflow: 'hidden' })}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={i} style={{ ...cellStyle, fontWeight: 800, color: 'var(--text-strong)', background: 'var(--bg-inset)', whiteSpace: 'nowrap' }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{ ...cellStyle, color: 'var(--text)' }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────────
// 7. ErrorCard
// ─────────────────────────────────────────────────────────────────────────────────
interface ErrorCardProps {
  message: string
  onRetry: () => void
  onAlternative: () => void
}
export function ErrorCard({ message, onRetry, onAlternative }: ErrorCardProps) {
  return (
    <div style={cardStyle({ borderColor: `${RED}55`, background: `${AMBER}0F` })}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Dot color={RED} />
        <span style={{ ...titleStyle, color: RED }}>Something needs your attention</span>
      </div>
      <div style={{ ...bodyStyle, color: 'var(--text)' }}>{message}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Btn variant="primary" size="sm" onClick={onRetry} style={{ background: AMBER }}>Retry</Btn>
        <Btn variant="soft" size="sm" onClick={onAlternative}>Generate alternative</Btn>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────────
// 8. AgentStatusCard
// ─────────────────────────────────────────────────────────────────────────────────
type AgentState = 'idle' | 'active' | 'queued' | 'failed' | 'completed'
interface AgentStatusEntry {
  name: string
  state: AgentState
}
interface AgentStatusCardProps {
  agents: AgentStatusEntry[]
}
const AGENT_STATE_COLOR: Record<AgentState, string> = {
  idle: 'var(--text-faint)',
  active: PURPLE,
  queued: AMBER,
  failed: RED,
  completed: ACCENT,
}
const AGENT_STATE_LABEL: Record<AgentState, string> = {
  idle: 'Idle',
  active: 'Active',
  queued: 'Queued',
  failed: 'Failed',
  completed: 'Completed',
}
export function AgentStatusCard({ agents }: AgentStatusCardProps) {
  return (
    <div style={cardStyle()}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {agents.map((a, i) => {
          const color = AGENT_STATE_COLOR[a.state]
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <Dot color={color} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>{a.name}</span>
              </span>
              <Badge color={color}>{AGENT_STATE_LABEL[a.state]}</Badge>
            </div>
          )
        })}
      </div>
    </div>
  )
}
