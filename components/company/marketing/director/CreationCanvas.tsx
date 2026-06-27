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
import type { AssetStats, CampaignHeader, Brief } from './types'

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
export function CreationCanvas({ header, stats, brief, onShare, onExport, children }: {
  header: CampaignHeader
  stats: AssetStats
  brief: Brief
  onShare?: () => void
  onExport?: () => void
  children?: React.ReactNode
}): React.JSX.Element {
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

      {/* Tab row (visual only — Plan active) */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4, marginTop: 14,
        borderBottom: '1px solid var(--border-soft)',
      }}>
        {TABS.map((t) => {
          const active = t === 'Plan'
          return (
            <div key={t} style={{
              padding: '9px 14px', fontSize: 13.5, fontWeight: 700, cursor: 'default',
              color: active ? 'var(--text-strong)' : 'var(--text-dim)',
              borderBottom: active ? `2px solid ${PURPLE}` : '2px solid transparent',
              marginBottom: -1,
            }}>{t}</div>
          )
        })}
      </div>

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
          <Dot color={ACCENT} size={8} />
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-strong)' }}>Agent Activity</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>All systems active</div>
          </div>
        </div>
      </div>

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
    </div>
  )
}
