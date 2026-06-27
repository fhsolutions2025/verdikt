'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

// ── Types ───────────────────────────────────────────────────────────────────
interface Brand { id: string; name: string; voice: Record<string, unknown>; regions: string[]; status: string }
interface Campaign { id: string; brand_id: string; name: string; goal: string | null; status: string; region: string | null; plan: Plan | null; created_at: string }
interface Plan { objective: string; content_items: { type: string; brief: string; platform?: string }[]; messaging_pillars?: string[]; risk_level?: string }
interface Asset { id: string; public_url: string; title: string; alt_text: string; dimensions: string; created_at: string }
interface Region { region: string; framing: string }
interface Version { id: string; content: Record<string, unknown> | null; asset_url: string | null; eval_scores: { overall?: number } | null; compliance_result: { verdict?: string; violations?: unknown[]; missing_disclaimers?: string[] } | null }
interface Artifact { id: string; type: string; channel: string | null; status: string; title: string; latest_version?: Version | null }
interface Activity { id: string; type: string; actor: string; text: string; severity: string; created_at: string }

type View = 'home' | 'campaigns' | 'campaign' | 'assets' | 'brand' | 'approvals'

const G = '#00C853'

// ── Root ────────────────────────────────────────────────────────────────────
export function MarketingWorkspace({
  initialBrands, initialCampaigns, initialAssets, regions,
}: {
  initialBrands: Brand[]; initialCampaigns: Campaign[]; initialAssets: Asset[]; regions: Region[]
}) {
  const [view, setView] = useState<View>('home')
  const [brands, setBrands] = useState<Brand[]>(initialBrands)
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns)
  const [assets] = useState<Asset[]>(initialAssets)
  const [selected, setSelected] = useState<string | null>(null)

  const refreshCampaigns = useCallback(async () => {
    const r = await fetch('/api/company/marketing/v2/campaigns').then(x => x.json())
    setCampaigns(r.data ?? [])
  }, [])
  const refreshBrands = useCallback(async () => {
    const r = await fetch('/api/company/marketing/v2/brands').then(x => x.json())
    setBrands(r.data ?? [])
  }, [])

  const openCampaign = (id: string) => { setSelected(id); setView('campaign') }

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: 'var(--bg-base)', color: 'var(--text-strong)', overflow: 'hidden' }}>
      {/* LEFT NAV */}
      <aside style={{ width: 224, flexShrink: 0, borderRight: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', padding: 14 }}>
        <Link href="/company" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <span style={{ fontWeight: 800, color: G, fontSize: 18 }}>VERDIKT</span>
        </Link>
        <p style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px' }}>Marketing</p>
        {([
          ['home', 'Home'], ['campaigns', 'Campaigns'], ['assets', 'Asset Library'],
          ['brand', 'Brand Voice'], ['approvals', 'Approvals'],
        ] as [View, string][]).map(([v, label]) => (
          <NavBtn key={v} label={label} active={view === v} onClick={() => setView(v)} />
        ))}
        <div style={{ marginTop: 'auto', fontSize: 11, color: 'var(--text-faint)', borderTop: '1px solid var(--border-soft)', paddingTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: G }} /> Marketing Agent · Active
          </div>
          <Link href="/company" style={{ color: 'var(--text-dim)', fontSize: 11, display: 'block', marginTop: 8 }}>← Back to console</Link>
        </div>
      </aside>

      {/* MAIN */}
      <main style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {view === 'home' && <Home brands={brands} campaigns={campaigns} assets={assets} onOpen={openCampaign} go={setView} />}
        {view === 'campaigns' && <Campaigns brands={brands} campaigns={campaigns} regions={regions} onOpen={openCampaign} onCreated={refreshCampaigns} />}
        {view === 'campaign' && selected && <CampaignDetail campaignId={selected} onBack={() => setView('campaigns')} onChanged={refreshCampaigns} />}
        {view === 'assets' && <AssetLibrary assets={assets} />}
        {view === 'brand' && <BrandPanel brands={brands} regions={regions} onCreated={refreshBrands} />}
        {view === 'approvals' && <Approvals campaigns={campaigns} onOpen={openCampaign} />}
      </main>
    </div>
  )
}

function NavBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      textAlign: 'left', padding: '8px 10px', borderRadius: 9, border: 'none', cursor: 'pointer', marginBottom: 3,
      backgroundColor: active ? 'rgba(0,200,83,0.12)' : 'transparent', color: active ? G : 'var(--text-dim)',
      fontSize: 13, fontWeight: 600,
    }}>{label}</button>
  )
}

// ── Home ────────────────────────────────────────────────────────────────────
function Home({ brands, campaigns, assets, onOpen, go }: { brands: Brand[]; campaigns: Campaign[]; assets: Asset[]; onOpen: (id: string) => void; go: (v: View) => void }) {
  const running = campaigns.filter(c => ['PLANNING', 'GENERATING', 'IN_REVIEW'].includes(c.status)).length
  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px' }}>Marketing Workspace</h1>
      <p style={{ color: 'var(--text-faint)', margin: '0 0 20px', fontSize: 13 }}>Your AI marketing department — plan, generate, review, approve, export.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 12, marginBottom: 22 }}>
        <Tile label="Brands" value={String(brands.length)} />
        <Tile label="Campaigns" value={String(campaigns.length)} />
        <Tile label="In progress" value={String(running)} />
        <Tile label="Assets" value={String(assets.length)} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
        <PrimaryBtn onClick={() => go('campaigns')}>+ New Campaign</PrimaryBtn>
        <GhostBtn onClick={() => go('brand')}>Brand Voice</GhostBtn>
        <GhostBtn onClick={() => go('assets')}>Asset Library</GhostBtn>
      </div>
      <Section title="Current campaigns">
        {campaigns.length === 0 ? <Empty text="No campaigns yet — create one." /> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {campaigns.slice(0, 8).map(c => (
              <button key={c.id} onClick={() => onOpen(c.id)} style={rowStyle}>
                <span style={{ fontWeight: 600 }}>{c.name}</span>
                <StatusChip status={c.status} />
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)' }}>{c.region}</span>
              </button>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

// ── Campaigns list + create ───────────────────────────────────────────────────
function Campaigns({ brands, campaigns, regions, onOpen, onCreated }: { brands: Brand[]; campaigns: Campaign[]; regions: Region[]; onOpen: (id: string) => void; onCreated: () => void }) {
  const [creating, setCreating] = useState(false)
  const [brandId, setBrandId] = useState(brands[0]?.id ?? '')
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [audience, setAudience] = useState('')
  const [region, setRegion] = useState(regions[0]?.region ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const create = async () => {
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/company/marketing/v2/campaigns', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_id: brandId, name, brief: { goal, audience, region, channels: [] } }),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error ?? 'Failed'); return }
      setCreating(false); setName(''); setGoal(''); setAudience('')
      onCreated(); onOpen(d.campaign.id)
    } finally { setBusy(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Campaigns</h1>
        <div style={{ marginLeft: 'auto' }}>
          {brands.length === 0
            ? <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Create a brand first →</span>
            : <PrimaryBtn onClick={() => setCreating(v => !v)}>{creating ? 'Cancel' : '+ New Campaign'}</PrimaryBtn>}
        </div>
      </div>

      {creating && (
        <Card>
          <Field label="Brand"><select value={brandId} onChange={e => setBrandId(e.target.value)} style={inputStyle}>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Campaign name"><input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="e.g. Responsible Gaming Week" /></Field>
          <Field label="Goal"><input value={goal} onChange={e => setGoal(e.target.value)} style={inputStyle} placeholder="What should this campaign achieve?" /></Field>
          <Field label="Audience"><input value={audience} onChange={e => setAudience(e.target.value)} style={inputStyle} placeholder="Who is it for?" /></Field>
          <Field label="Region"><select value={region} onChange={e => setRegion(e.target.value)} style={inputStyle}>{regions.map(r => <option key={r.region} value={r.region}>{r.region} ({r.framing})</option>)}</select></Field>
          {err && <p style={{ color: '#DC2626', fontSize: 12 }}>{err}</p>}
          <PrimaryBtn onClick={create} disabled={busy || !name || !brandId}>{busy ? 'Creating…' : 'Create campaign'}</PrimaryBtn>
        </Card>
      )}

      {campaigns.length === 0 ? <Empty text="No campaigns yet." /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14 }}>
          {campaigns.map(c => (
            <button key={c.id} onClick={() => onOpen(c.id)} style={rowStyle}>
              <span style={{ fontWeight: 600 }}>{c.name}</span>
              <StatusChip status={c.status} />
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)' }}>{c.region}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Campaign detail (conversation + canvas + activity) ────────────────────────
function CampaignDetail({ campaignId, onBack, onChanged }: { campaignId: string; onBack: () => void; onChanged: () => void }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    const [c, a, act] = await Promise.all([
      fetch(`/api/company/marketing/v2/campaigns/${campaignId}`).then(x => x.json()),
      fetch(`/api/company/marketing/v2/artifacts?campaign_id=${campaignId}&with_versions=1`).then(x => x.json()),
      fetch(`/api/company/marketing/v2/activity?campaign_id=${campaignId}`).then(x => x.json()),
    ])
    setCampaign(c.campaign ?? null); setArtifacts(a.data ?? []); setActivity(act.data ?? [])
  }, [campaignId])

  useEffect(() => { load() }, [load])
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const planApproved = campaign?.status && ['GENERATING', 'IN_REVIEW', 'READY', 'COMPLETED'].includes(campaign.status)

  const plan = async () => { setBusy('plan'); try { await fetch(`/api/company/marketing/v2/campaigns/${campaignId}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'plan' }) }); await load(); onChanged() } finally { setBusy(null) } }
  const approvePlan = async () => { setBusy('approveplan'); try { await fetch('/api/company/marketing/v2/approvals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaign_id: campaignId, gate: 'plan', decision: 'approved' }) }); await load() } finally { setBusy(null) } }
  const generate = async () => {
    setBusy('gen')
    try {
      await fetch(`/api/company/marketing/v2/campaigns/${campaignId}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'execute' }) })
      await load(); onChanged()
    } finally { setBusy(null) }
  }
  const send = async () => {
    if (!msg.trim()) return
    setBusy('chat'); const text = msg; setMsg('')
    try { await fetch('/api/company/marketing/v2/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campaign_id: campaignId, message: text }) }); await load(); onChanged() } finally { setBusy(null) }
  }

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%' }}>
      {/* center */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
        <button onClick={onBack} style={{ ...ghost, marginBottom: 10 }}>← Campaigns</button>
        {campaign && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{campaign.name}</h1>
            <StatusChip status={campaign.status} />
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{campaign.region}</span>
          </div>
        )}

        {/* command bar */}
        <Card>
          <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Direct the agent</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} style={{ ...inputStyle, flex: 1 }} placeholder="e.g. plan a 5-item pack for this goal" />
            <GhostBtn onClick={send} disabled={busy === 'chat'}>{busy === 'chat' ? '…' : 'Send'}</GhostBtn>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <PrimaryBtn onClick={plan} disabled={!!busy}>{busy === 'plan' ? 'Planning…' : 'Plan'}</PrimaryBtn>
            {campaign?.plan && !planApproved && <GhostBtn onClick={approvePlan} disabled={!!busy}>{busy === 'approveplan' ? '…' : 'Approve plan'}</GhostBtn>}
            {planApproved !== undefined && (campaign?.plan && (campaign.status === 'PLANNING' || campaign.status === 'GENERATING' || planApproved)) && (
              <PrimaryBtn onClick={generate} disabled={!!busy || !planApproved}>{busy === 'gen' ? 'Generating…' : 'Generate content'}</PrimaryBtn>
            )}
          </div>
        </Card>

        {/* plan */}
        {campaign?.plan && (
          <Section title="Plan">
            <p style={{ fontSize: 13, margin: '0 0 8px' }}>{campaign.plan.objective}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {campaign.plan.content_items.map((it, i) => (
                <span key={i} style={pill}>{it.type}{it.platform ? `· ${it.platform}` : ''}</span>
              ))}
            </div>
          </Section>
        )}

        {/* artifacts */}
        <Section title={`Artifacts (${artifacts.length})`}>
          {artifacts.filter(a => a.type !== 'plan').length === 0
            ? <Empty text="No artifacts yet — plan and generate." />
            : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 12 }}>
                {artifacts.filter(a => a.type !== 'plan').map(a => <ArtifactCard key={a.id} artifact={a} onChanged={load} />)}
              </div>
            )}
        </Section>
      </div>

      {/* activity feed */}
      <aside style={{ width: 300, flexShrink: 0, borderLeft: '1px solid var(--border)', paddingLeft: 14, overflow: 'auto' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '4px 0 10px' }}>Activity</p>
        {activity.length === 0 ? <Empty text="No activity yet." /> : activity.map(e => (
          <div key={e.id} style={{ padding: '7px 0', borderBottom: '1px solid var(--border-soft)' }}>
            <div style={{ fontSize: 12, color: e.severity === 'error' ? '#DC2626' : e.severity === 'warn' ? '#E0A020' : 'var(--text)' }}>{e.text}</div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>{e.actor} · {new Date(e.created_at).toLocaleTimeString()}</div>
          </div>
        ))}
      </aside>
    </div>
  )
}

function ArtifactCard({ artifact, onChanged }: { artifact: Artifact; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const v = artifact.latest_version
  const verdict = v?.compliance_result?.verdict ?? 'pass'
  const blocked = verdict === 'block'
  const content = v?.content ?? {}

  const approve = async () => {
    setBusy(true)
    try {
      const justification = blocked ? (prompt('This artifact is compliance-blocked. Enter an override justification to approve anyway:') ?? '') : undefined
      if (blocked && !justification) { setBusy(false); return }
      await fetch('/api/company/marketing/v2/approvals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ artifact_id: artifact.id, gate: 'artifact', decision: 'approved', justification }) })
      await onChanged()
    } finally { setBusy(false) }
  }
  const exportIt = async () => {
    setBusy(true)
    try {
      const r = await fetch(`/api/company/marketing/v2/artifacts/${artifact.id}/export`, { method: 'POST' })
      const ct = r.headers.get('content-type') ?? ''
      if (ct.includes('application/json')) {
        const d = await r.json()
        if (d.url) window.open(d.url, '_blank'); else if (d.error) alert(d.error)
      } else {
        const blob = await r.blob(); const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = `${artifact.type}-${artifact.id.slice(0, 8)}`; a.click(); URL.revokeObjectURL(url)
      }
      await onChanged()
    } finally { setBusy(false) }
  }

  return (
    <div style={{ ...cardStyle, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ ...pill, background: 'var(--bg-inset)' }}>{artifact.type}{artifact.channel ? ` · ${artifact.channel}` : ''}</span>
        <span style={{ marginLeft: 'auto' }}><VerdictChip verdict={verdict} /></span>
      </div>
      {artifact.type === 'image' && v?.asset_url
        ? <img src={v.asset_url} alt={String(content.alt_text ?? '')} style={{ width: '100%', borderRadius: 8, marginBottom: 8 }} />
        : <p style={{ fontSize: 12, color: 'var(--text-dim)', maxHeight: 90, overflow: 'hidden', margin: '0 0 8px' }}>{previewOf(artifact.type, content)}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <StatusChip status={artifact.status} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {artifact.status !== 'approved' && artifact.status !== 'exported' && <GhostBtn small onClick={approve} disabled={busy}>Approve</GhostBtn>}
          {artifact.status === 'approved' && <PrimaryBtn small onClick={exportIt} disabled={busy}>Export</PrimaryBtn>}
        </div>
      </div>
      {!!v?.compliance_result?.missing_disclaimers?.length && (
        <p style={{ fontSize: 10, color: '#E0A020', margin: '6px 0 0' }}>Missing: {v.compliance_result.missing_disclaimers.join(', ')}</p>
      )}
    </div>
  )
}

function previewOf(type: string, c: Record<string, unknown>): string {
  if (type === 'blog') return String(c.title ?? '') + ' — ' + String(c.summary ?? c.body_markdown ?? '').slice(0, 120)
  if (type === 'social') return String(c.caption ?? '')
  return JSON.stringify(c).slice(0, 120)
}

// ── Brand panel ───────────────────────────────────────────────────────────────
function BrandPanel({ brands, regions, onCreated }: { brands: Brand[]; regions: Region[]; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [tone, setTone] = useState('')
  const [region, setRegion] = useState(regions[0]?.region ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const create = async () => {
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/company/marketing/v2/brands', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, voice: { tone }, regions: region ? [region] : [] }),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error ?? 'Failed'); return }
      setName(''); setTone(''); onCreated()
    } finally { setBusy(false) }
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 16px' }}>Brand Voice</h1>
      <Card>
        <Field label="Brand name"><input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="Verdikt" /></Field>
        <Field label="Voice / tone"><input value={tone} onChange={e => setTone(e.target.value)} style={inputStyle} placeholder="energetic, trustworthy, responsible" /></Field>
        <Field label="Primary region"><select value={region} onChange={e => setRegion(e.target.value)} style={inputStyle}>{regions.map(r => <option key={r.region} value={r.region}>{r.region} ({r.framing})</option>)}</select></Field>
        {err && <p style={{ color: '#DC2626', fontSize: 12 }}>{err}</p>}
        <PrimaryBtn onClick={create} disabled={busy || !name}>{busy ? 'Saving…' : 'Create brand'}</PrimaryBtn>
      </Card>
      <Section title={`Brands (${brands.length})`}>
        {brands.length === 0 ? <Empty text="No brands yet." /> : brands.map(b => (
          <div key={b.id} style={rowStyle}>
            <span style={{ fontWeight: 600 }}>{b.name}</span>
            <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 'auto' }}>{(b.regions ?? []).join(', ')}</span>
          </div>
        ))}
      </Section>
    </div>
  )
}

// ── Asset library ─────────────────────────────────────────────────────────────
function AssetLibrary({ assets }: { assets: Asset[] }) {
  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 16px' }}>Asset Library</h1>
      {assets.length === 0 ? <Empty text="No assets yet — generate campaign images." /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 12 }}>
          {assets.map(a => (
            <div key={a.id} style={{ ...cardStyle, padding: 8 }}>
              <img src={a.public_url} alt={a.alt_text} style={{ width: '100%', borderRadius: 6, display: 'block' }} />
              <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '6px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title || a.alt_text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Approvals ─────────────────────────────────────────────────────────────────
function Approvals({ campaigns, onOpen }: { campaigns: Campaign[]; onOpen: (id: string) => void }) {
  const pending = campaigns.filter(c => c.status === 'IN_REVIEW')
  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 16px' }}>Approvals</h1>
      {pending.length === 0 ? <Empty text="Nothing awaiting review." /> : pending.map(c => (
        <button key={c.id} onClick={() => onOpen(c.id)} style={rowStyle}>
          <span style={{ fontWeight: 600 }}>{c.name}</span>
          <StatusChip status={c.status} />
          <span style={{ marginLeft: 'auto', fontSize: 11, color: G }}>Review →</span>
        </button>
      ))}
    </div>
  )
}

// ── Shared UI ─────────────────────────────────────────────────────────────────
function Tile({ label, value }: { label: string; value: string }) {
  return <div style={{ ...cardStyle, padding: 14 }}><p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0 }}>{label}</p><p style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 0' }}>{value}</p></div>
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div style={{ marginTop: 20 }}><p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>{title}</p>{children}</div>
}
function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ ...cardStyle, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 560 }}>{children}</div>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</label>{children}</div>
}
function Empty({ text }: { text: string }) { return <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>{text}</p> }
function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = { DRAFT: '#6B7280', PLANNING: '#3B82F6', GENERATING: '#E0A020', IN_REVIEW: '#9B72E8', READY: G, LIVE: G, COMPLETED: G, BLOCKED: '#DC2626', ARCHIVED: '#6B7280', draft: '#6B7280', needs_review: '#9B72E8', approved: G, exported: G, rejected: '#DC2626', changes_requested: '#E0A020' }
  const c = map[status] ?? '#6B7280'
  return <span style={{ fontSize: 10, fontWeight: 700, color: c, background: `${c}22`, padding: '2px 8px', borderRadius: 999 }}>{status.replace(/_/g, ' ')}</span>
}
function VerdictChip({ verdict }: { verdict: string }) {
  const c = verdict === 'block' ? '#DC2626' : verdict === 'warn' ? '#E0A020' : G
  return <span style={{ fontSize: 10, fontWeight: 700, color: c, background: `${c}22`, padding: '2px 8px', borderRadius: 999 }}>{verdict}</span>
}
function PrimaryBtn({ children, onClick, disabled, small }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; small?: boolean }) {
  return <button onClick={onClick} disabled={disabled} style={{ padding: small ? '5px 10px' : '8px 14px', borderRadius: 9, border: 'none', cursor: disabled ? 'default' : 'pointer', background: disabled ? 'rgba(0,200,83,0.3)' : G, color: '#04130B', fontSize: small ? 11 : 13, fontWeight: 700 }}>{children}</button>
}
function GhostBtn({ children, onClick, disabled, small }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; small?: boolean }) {
  return <button onClick={onClick} disabled={disabled} style={{ ...ghost, padding: small ? '5px 10px' : '8px 14px', fontSize: small ? 11 : 13, opacity: disabled ? 0.5 : 1 }}>{children}</button>
}

const cardStyle: React.CSSProperties = { backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12 }
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left', width: '100%', color: 'var(--text-strong)' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-strong)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }
const ghost: React.CSSProperties = { padding: '8px 14px', borderRadius: 9, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-strong)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }
const pill: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', background: 'var(--bg-inset)', padding: '2px 8px', borderRadius: 999 }
