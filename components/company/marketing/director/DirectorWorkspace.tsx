'use client'

// Campaign Director — flagship two-pane workspace.
// Left: NavRail + conversational ChatPanel (owns the interview).
// Right: CreationCanvas (campaign header, brief cards, progress + stat tiles) with
// the live AssetGrid. Owns the full state machine:
//   interview → POST /v2/director (campaign + run + 3 sub-agents + asset tasks)
//   → POST /v2/director/generate (auto image/copy/carousel) → poll GET (stream states)
//   → video-on-click → POST /v2/director/generate-asset.

import React from 'react'
import { NavRail } from './NavRail'
import { ChatPanel } from './ChatPanel'
import { CreationCanvas } from './CreationCanvas'
import { AssetGrid } from './AssetGrid'
import { DirectorKeyframes, ACCENT } from './theme'
import type { AssetItem, AssetStats, Brief, CampaignHeader, NavItem } from './types'
import { buildBrief, type InterviewAnswers } from '@/lib/marketing/directorInterview'

const NAV_ITEMS: NavItem[] = [
  { id: 'director', label: 'Director', icon: '🎬' },
  { id: 'home', label: 'Home', icon: '🏠' },
  { id: 'campaigns', label: 'Campaigns', icon: '📋' },
  { id: 'assets', label: 'Asset Library', icon: '🖼️' },
  { id: 'brand', label: 'Brand Voice', icon: '🎨' },
  { id: 'approvals', label: 'Approvals', icon: '✅' },
  { id: 'chat', label: 'Chat', icon: '💬', soon: true },
  { id: 'analytics', label: 'Analytics', icon: '📊', soon: true },
  { id: 'calendar', label: 'Calendar', icon: '📅', soon: true },
  { id: 'settings', label: 'Settings', icon: '⚙️', soon: true },
]

const EMPTY_STATS: AssetStats = { total: 0, generated: 0, in_progress: 0, queued: 0 }

export function DirectorWorkspace({
  brands, regions, onNavigate, onOpenCampaign,
}: {
  brands: { id: string; name: string }[]
  regions: { region: string; framing: string }[]
  onNavigate: (view: string) => void
  onOpenCampaign?: (id: string) => void
}): React.JSX.Element {
  const [submitting, setSubmitting] = React.useState(false)
  const [started, setStarted] = React.useState(false)
  const [runId, setRunId] = React.useState<string | null>(null)
  const [campaignId, setCampaignId] = React.useState<string | null>(null)
  const [brief, setBrief] = React.useState<Brief | null>(null)
  const [brandName, setBrandName] = React.useState('')
  const [assets, setAssets] = React.useState<AssetItem[]>([])
  const [stats, setStats] = React.useState<AssetStats>(EMPTY_STATS)
  const [runStatus, setRunStatus] = React.useState<string>('running')
  const [generatingId, setGeneratingId] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = React.useCallback(async (rid: string) => {
    const r = await fetch(`/api/company/marketing/v2/director?run_id=${rid}`).then(x => x.json()).catch(() => null)
    if (!r || r.error) return
    setAssets(r.assets ?? [])
    setStats(r.stats ?? EMPTY_STATS)
    setRunStatus(r.run?.status ?? 'running')
  }, [])

  // Poll while a run is active or any asset is mid-flight.
  React.useEffect(() => {
    if (!runId) return
    const tick = () => refresh(runId)
    tick()
    pollRef.current = setInterval(() => {
      tick()
    }, 2500)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [runId, refresh])

  // Stop polling once everything has settled (run done + nothing in flight).
  React.useEffect(() => {
    const settled = runStatus !== 'running' && !generatingId && !assets.some(a => a.state === 'in_progress' || a.state === 'queued')
    if (settled && pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [runStatus, generatingId, assets])

  const onSubmitBrief = async (brandId: string, answers: InterviewAnswers) => {
    setSubmitting(true); setError(null)
    const b = buildBrief({ ...answers, brand: brandId })
    setBrief(b)
    setBrandName(brands.find(x => x.id === brandId)?.name ?? '')
    try {
      const res = await fetch('/api/company/marketing/v2/director', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_id: brandId, answers }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Failed to start'); setSubmitting(false); return }
      setCampaignId(d.campaign_id); setRunId(d.run_id); setStarted(true); setSubmitting(false)
      // Kick auto-generation of image/copy/carousel assets; the poll streams progress.
      fetch('/api/company/marketing/v2/director/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: d.run_id }),
      }).then(() => refresh(d.run_id)).catch(() => {})
    } catch (e) {
      setError((e as Error).message); setSubmitting(false)
    }
  }

  const onGenerateVideo = async (taskId: string) => {
    setGeneratingId(taskId)
    // Restart polling if it had stopped.
    if (runId && !pollRef.current) pollRef.current = setInterval(() => refresh(runId), 2500)
    try {
      await fetch('/api/company/marketing/v2/director/generate-asset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId }),
      })
    } finally {
      if (runId) await refresh(runId)
      setGeneratingId(null)
    }
  }

  // Export the plan as a downloadable JSON (brief + generated assets). Safe + offline
  // — replaces the old navigation that crashed the legacy campaign-detail view.
  const onExport = () => {
    const title = brief?.goal?.trim() ? brief.goal : 'New Campaign'
    const payload = {
      campaign: title, brand: brandName, brief, stats,
      assets: assets.map(a => ({ type: a.type, label: a.label, channel: a.channel, state: a.state, url: a.url, text: a.text })),
      exported_at: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-plan.json`
    a.click(); URL.revokeObjectURL(url)
  }

  const header: CampaignHeader = {
    title: brief?.goal?.trim() ? brief.goal : 'New Campaign',
    live: started,
    brandName: brandName || (brief ? brands.find(b => b.id === brief.brand_id)?.name ?? '' : ''),
    vertical: brief?.vertical ?? '',
    goal: brief?.goal ?? '',
    audience: brief?.audience ?? '',
  }
  const emptyBrief: Brief = { brand_id: '', vertical: '', goal: '', audience: '', region: '', channels: [], tone: '', notes: '' }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-base)', color: 'var(--text-strong)' }}>
      <DirectorKeyframes />
      <NavRail
        items={NAV_ITEMS}
        activeId="director"
        onNavigate={(id) => { if (id !== 'director') onNavigate(id) }}
        user={{ name: 'Verdikt Studio', plan: 'Marketing' }}
      />

      {/* Left — chat (≈36%) */}
      <div style={{ width: '36%', minWidth: 360, maxWidth: 520, flexShrink: 0 }}>
        <ChatPanel
          brands={brands} regions={regions} onSubmitBrief={onSubmitBrief}
          submitting={submitting} started={started}
          onChat={async (message) => {
            const r = await fetch('/api/company/marketing/v2/director/chat', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message, campaign_id: campaignId }),
            })
            const d = await r.json()
            if (!r.ok) throw new Error(d.error ?? 'chat failed')
            return d.reply as string
          }}
        />
      </div>

      {/* Right — creation canvas (flex) */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {started ? (
          <CreationCanvas
            header={header}
            stats={stats}
            brief={brief ?? emptyBrief}
            onShare={() => campaignId && onOpenCampaign?.(campaignId)}
            onExport={onExport}
          >
            {error && <div style={{ color: '#DC2626', fontSize: 13, marginBottom: 12 }}>{error}</div>}
            <AssetGrid assets={assets} onGenerateVideo={onGenerateVideo} generatingId={generatingId} />
          </CreationCanvas>
        ) : (
          <Placeholder error={error} />
        )}
      </div>
    </div>
  )
}

function Placeholder({ error }: { error: string | null }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 40, gap: 12 }}>
      <div style={{ fontSize: 44 }}>🎬</div>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text-strong)' }}>Plan a new campaign</h2>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--text-dim)', maxWidth: 420 }}>
        Answer the Campaign Director&apos;s questions on the left. When you tap{' '}
        <strong style={{ color: ACCENT }}>+ New Campaign</strong>, your assets will generate here in real time.
      </p>
      {error && <p style={{ color: '#DC2626', fontSize: 13 }}>{error}</p>}
    </div>
  )
}
