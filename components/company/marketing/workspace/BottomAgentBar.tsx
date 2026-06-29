'use client'

// WS-1 — bottom agent status bar (spec §bottom_agent_status_bar). Shows the specialist
// roster with live state; click an agent to see its activity detail.

import React from 'react'
import { ACCENT } from '@/components/company/marketing/director/theme'

export type AgentState = 'idle' | 'active' | 'queued' | 'failed' | 'completed'

export interface BarAgent { id: string; label: string; state: AgentState }

const STATE_COLOR: Record<AgentState, string> = {
  idle: 'var(--text-faint)', active: '#E0A020', queued: '#6C3FC5', failed: '#DC2626', completed: ACCENT,
}
const STATE_LABEL: Record<AgentState, string> = {
  idle: 'Idle', active: 'Active', queued: 'Queued', failed: 'Needs attention', completed: 'Done',
}

export const DEFAULT_AGENTS: BarAgent[] = [
  { id: 'campaign_director_agent', label: 'Campaign Director', state: 'idle' },
  { id: 'mkt_copywriter', label: 'Copywriter', state: 'idle' },
  { id: 'mkt_creative_designer', label: 'Creative Designer', state: 'idle' },
  { id: 'mkt_prompt_optimizer', label: 'Image Producer', state: 'idle' },
  { id: 'mkt_video_producer', label: 'Video Producer', state: 'idle' },
  { id: 'mkt_seo', label: 'SEO Specialist', state: 'idle' },
  { id: 'mkt_brand_guardian', label: 'Brand Guardian', state: 'idle' },
  { id: 'mkt_compliance', label: 'Compliance', state: 'idle' },
  { id: 'qa_agent', label: 'QA Agent', state: 'idle' },
]

export function BottomAgentBar({
  agents = DEFAULT_AGENTS, onAgentClick, health = 'All systems operational',
}: {
  agents?: BarAgent[]
  onAgentClick?: (id: string) => void
  health?: string
}): React.JSX.Element {
  const [open, setOpen] = React.useState<string | null>(null)
  const visible = agents.slice(0, 8)
  const extra = agents.length - visible.length

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, height: 44, flexShrink: 0,
      padding: '0 14px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)', overflowX: 'auto',
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>Agents</span>
      {visible.map(a => (
        <button key={a.id} onClick={() => { setOpen(a.id); onAgentClick?.(a.id) }} title={`${a.label} — ${STATE_LABEL[a.state]}`}
          style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, background: open === a.id ? 'var(--bg-inset)' : 'transparent', border: '1px solid var(--border)', borderRadius: 999, padding: '4px 10px', cursor: 'pointer' }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: STATE_COLOR[a.state], boxShadow: a.state === 'active' ? `0 0 6px ${STATE_COLOR[a.state]}` : 'none' }} />
          <span style={{ fontSize: 11.5, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{a.label}</span>
        </button>
      ))}
      {extra > 0 && <span style={{ fontSize: 11.5, color: 'var(--text-faint)', flexShrink: 0 }}>+{extra} more</span>}
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: ACCENT }} />
        <span style={{ fontSize: 11.5, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{health}</span>
      </div>
    </div>
  )
}
