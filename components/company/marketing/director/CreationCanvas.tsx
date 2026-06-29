'use client'

// Right-pane "chrome" of the Campaign Director two-pane workspace.
// Renders the campaign header bar, tab row, brief summary cards, the campaign
// progress block + stat tiles, and finally the asset grid passed as children.
// Styling + primitives come exclusively from ./theme so light/dark themes work.

import React from 'react'
import {
  ACCENT, PURPLE, PURPLE_LIGHT, ORANGE, AMBER, GRADIENT,
  S, Btn, Badge, Dot, ProgressBar,
} from './theme'
import type { AssetStats, CampaignHeader, Brief, AgentActivity } from './types'

// Friendly names for the live agent rows (spec §4 Active AI Agents).
const AGENT_NAMES: Record<string, string> = {
  copywriter: 'Copywriter', 'prompt-optimizer': 'Creative Designer', router: 'Router',
}
function agentName(a: string): string { return AGENT_NAMES[a] ?? a.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }
function agentStatus(s: string): { label: string; color: string } {
  if (s === 'running') return { label: 'Working', color: AMBER }
  if (s === 'succeeded') return { label: 'Done', color: ACCENT }
  if (s === 'failed') return { label: 'Failed', color: '#DC2626' }
  return { label: 'Queued', color: 'var(--text-faint)' }
}

// ── Local helpers ───────────────────────────────────────────────────────────────
function BriefCard({ icon, tint, label, value, sub }: {
  icon: string; tint: string; label: string; value: string; sub: string
}) {
  return (
    <div style={{ ...S.card, padding: 16, display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 0 }}>
      <span style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, background: `${tint}1F`, border: `1px solid ${tint}33`,
      }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: 'var(--text-faint)' }}>{label}</div>
        <div style={{
          fontSize: 15, fontWeight: 800, color: 'var(--text-strong)', marginTop: 3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{value || '—'}</div>
        <div style={{
          fontSize: 12, color: 'var(--text-dim)', marginTop: 2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{sub}</div>
      </div>
    </div>
  )
}

function StatTile({ icon, tint, label, value }: {
  icon: string; tint: string; label: string; value: number
}) {
  return (
    <div style={{ ...S.inset, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
      <span style={{
        width: 32, height: 32, borderRadius: 9, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, background: `${tint}1F`, border: `1px solid ${tint}33`,
      }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1, color: tint }}>{value}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{label}</div>
      </div>
    </div>
  )
}

const TABS = ['Plan', 'Create', 'Review', 'Publish', 'Analyze'] as const

// ── Main component ───────────────────────────────────────────────────────────────
export function CreationCanvas({ header, stats, brief, agents = [], onShare, onExport, children }: {
  header: CampaignHeader
  stats: AssetStats
  brief: Brief
  agents?: AgentActivity[]
  onShare?: () => void
  onExport?: () => void
  children?: React.ReactNode
}): React.JSX.Element {
  const [activeTab, setActiveTab] = React.useState<(typeof TABS)[number]>('Plan')
  const pct = stats.total ? Math.round((stats.generated / stats.total) * 100) : 0
  const vertical = header.vertical || brief.vertical

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 24, boxSizing: 'border-box', background: 'var(--bg-base)' }}>
      {/* Campaign header bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <h1 style={{
            margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--text-strong)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '52vw',
          }}>{header.title}</h1>
          <button
            title="Rename campaign"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer', padding: 4,
              color: 'var(--text-faint)', fontSize: 15, lineHeight: 1,
            }}
          >✏</button>
          {header.live && <Badge color={ACCENT}><Dot color={ACCENT} size={7} /> Live</Badge>}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <Btn variant="ghost" size="sm" onClick={onShare}>Share</Btn>
          <Btn variant="primary" size="sm" onClick={onExport}>Export Plan ▾</Btn>
        </div>
      </div>

      {/* Tab row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4, marginTop: 14,
        borderBottom: '1px solid var(--border-soft)',
      }}>
        {TABS.map((t) => {
          const active = t === activeTab
          return (
            <button key={t} type="button" onClick={() => setActiveTab(t)} style={{
              padding: '9px 14px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
              background: 'none', border: 'none',
              color: active ? 'var(--text-strong)' : 'var(--text-dim)',
              borderBottom: active ? `2px solid ${PURPLE}` : '2px solid transparent',
              marginBottom: -1,
            }}>{t}</button>
          )
        })}
      </div>

      {activeTab !== 'Plan' && <TabPlaceholder name={activeTab} />}

      {activeTab === 'Plan' && (
      <>
      {/* Planning heading + agent activity chip */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginTop: 22, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-strong)' }}>Planning &amp; Asset Creation</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--text-dim)' }}>
            Your campaign is being planned and assets are being generated in real-time.
          </p>
        </div>
        <div style={{
          ...S.inset, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0,
        }}>
          <Dot color={agents.some(a => a.status === 'running') ? AMBER : ACCENT} size={8} />
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-strong)' }}>Agent Activity</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>
              {agents.length
                ? `${agents.filter(a => a.status === 'running').length} working · ${agents.filter(a => a.status === 'succeeded').length} done`
                : 'Standing by'}
            </div>
          </div>
        </div>
      </div>

      {/* Active AI Agents — live specialist roster (spec §4) */}
      <AgentRoster agents={agents} reviewing={stats.in_progress > 0} />

      {/* Four brief summary cards */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 14, marginTop: 16,
      }}>
        <BriefCard icon="🏷️" tint={PURPLE} label="Brand" value={header.brandName} sub="Campaign brand" />
        <BriefCard icon="📊" tint={ACCENT} label="Vertical" value={vertical} sub="Market segment" />
        <BriefCard icon="🎯" tint={ORANGE} label="Goal" value={header.goal} sub="Primary objective" />
        <BriefCard icon="👥" tint={AMBER} label="Audience" value={header.audience} sub="Target audience" />
      </div>

      {/* Progress block */}
      <div style={{ ...S.card, padding: 20, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-strong)' }}>Campaign Progress</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginTop: 2 }}>
              {stats.generated} of {stats.total} assets generated
            </div>
          </div>
          <div style={{
            fontSize: 28, fontWeight: 800, lineHeight: 1,
            background: GRADIENT, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          }}>{pct}%</div>
        </div>
        <div style={{ marginTop: 12 }}>
          <ProgressBar value={pct} height={10} />
        </div>

        {/* Stat tiles */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12, marginTop: 16,
        }}>
          <StatTile icon="📦" tint={PURPLE_LIGHT} label="Total Assets" value={stats.total} />
          <StatTile icon="✅" tint={ACCENT} label="Generated" value={stats.generated} />
          <StatTile icon="⚙️" tint={AMBER} label="In Progress" value={stats.in_progress} />
          <StatTile icon="🕒" tint={ORANGE} label="Queued" value={stats.queued} />
        </div>
      </div>

      {/* Asset grid */}
      <div style={{ marginTop: 16 }}>
        {children}
      </div>
      </>
      )}
    </div>
  )
}

// Live "Active AI Agents" roster — the real sub-agent task statuses plus the review
// gates that run during generation. Replaces the old static "All systems active" chip.
function AgentRoster({ agents, reviewing }: { agents: AgentActivity[]; reviewing: boolean }) {
  if (!agents.length && !reviewing) return null
  const reviewState = reviewing ? 'running' : 'succeeded'
  const gates = [
    { id: 'gate-brand', name: 'Brand Guardian', status: reviewState },
    { id: 'gate-compliance', name: 'Compliance', status: reviewState },
    { id: 'gate-qa', name: 'QA Inspector', status: reviewState },
  ]
  const rows = [
    ...agents.map(a => ({ id: a.id, name: agentName(a.agent), status: a.status })),
    ...gates,
  ]
  return (
    <div style={{ ...S.card, padding: 16, marginTop: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-strong)', marginBottom: 12 }}>Active AI Agents</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
        {rows.map(r => {
          const st = agentStatus(r.status)
          return (
            <div key={r.id} style={{ ...S.inset, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                width: 9, height: 9, borderRadius: 999, flexShrink: 0, background: st.color,
                boxShadow: r.status === 'running' ? `0 0 8px ${st.color}` : 'none',
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: st.color }}>{st.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Clean placeholder for not-yet-built tabs (Create / Review / Publish / Analyze).
function TabPlaceholder({ name }: { name: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '64px 24px', gap: 10 }}>
      <div style={{ fontSize: 36 }}>🛠️</div>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-strong)' }}>{name}</h2>
      <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-dim)', maxWidth: 380 }}>
        The <strong>{name}</strong> workspace is coming soon. For now, build and watch your assets generate under the <strong>Plan</strong> tab.
      </p>
    </div>
  )
}
