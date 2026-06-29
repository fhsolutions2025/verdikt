'use client'

// WS-7 — publishing preview (interaction map §12). Opens from the Publish action; shows
// the campaign's APPROVED assets, the channels they can go to (live vs export gated by
// channel connection state from /v2/channels), validation warnings, and a Confirm that
// creates publication records via POST /v2/publish (one per selected asset × channel).
// Home Carousel is always available (writes a live promo_banners row); external channels
// publish live only when connected, otherwise record an export.

import React from 'react'
import { ACCENT, PURPLE, RED } from '@/components/company/marketing/director/theme'

interface ApprovedAsset { id: string; title: string; type: string; hasImage: boolean }
interface Channel { channel: string; label: string; connected: boolean }

function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === 'object' && v !== null }

// Home Carousel is built-in (no external credentials). It's offered alongside the
// credentialed channels returned by /v2/channels.
const HOME_CAROUSEL: Channel = { channel: 'home_carousel', label: 'Home Carousel', connected: true }

export function PublishingPreviewModal({
  open, campaignId, canPublish, onClose, onPublished,
}: {
  open: boolean
  campaignId: string | null
  canPublish: boolean
  onClose: () => void
  onPublished?: () => void
}): React.JSX.Element | null {
  const [loading, setLoading] = React.useState(false)
  const [assets, setAssets] = React.useState<ApprovedAsset[]>([])
  const [channels, setChannels] = React.useState<Channel[]>([])
  const [selAssets, setSelAssets] = React.useState<Set<string>>(new Set())
  const [selChannels, setSelChannels] = React.useState<Set<string>>(new Set())
  const [busy, setBusy] = React.useState(false)
  const [result, setResult] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    if (!campaignId) { setAssets([]); return }
    setLoading(true); setResult(null)
    try {
      const [aRes, cRes] = await Promise.all([
        fetch(`/api/company/marketing/v2/artifacts?campaign_id=${encodeURIComponent(campaignId)}&with_versions=1`).then((x) => x.json() as Promise<unknown>).catch(() => null),
        fetch('/api/company/marketing/v2/channels').then((x) => x.json() as Promise<unknown>).catch(() => null),
      ])
      const rows = isRecord(aRes) && Array.isArray(aRes.data) ? aRes.data : []
      const approved: ApprovedAsset[] = rows.filter(isRecord)
        .filter((r) => r.status === 'approved')
        .map((r) => {
          const ver = isRecord(r.latest_version) ? r.latest_version : null
          const url = ver && typeof ver.asset_url === 'string' ? ver.asset_url : null
          return { id: String(r.id), title: typeof r.title === 'string' ? r.title : 'Asset', type: typeof r.type === 'string' ? r.type : 'asset', hasImage: !!url }
        })
      setAssets(approved)
      setSelAssets(new Set(approved.map((a) => a.id)))
      const chRows = isRecord(cRes) && Array.isArray(cRes.channels) ? cRes.channels : []
      const chs: Channel[] = chRows.filter(isRecord).map((c) => ({
        channel: String(c.channel), label: typeof c.label === 'string' ? c.label : String(c.channel), connected: !!c.connected,
      }))
      setChannels([HOME_CAROUSEL, ...chs])
      setSelChannels(new Set(['home_carousel']))
    } finally { setLoading(false) }
  }, [campaignId])

  React.useEffect(() => { if (open) void load() }, [open, load])

  if (!open) return null

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const next = new Set(set); if (next.has(id)) next.delete(id); else next.add(id); setter(next)
  }

  // Validation warnings.
  const warnings: string[] = []
  if (assets.length === 0) warnings.push('No approved assets in this campaign — approve assets before publishing.')
  if (selChannels.has('home_carousel') && Array.from(selAssets).every((id) => !assets.find((a) => a.id === id)?.hasImage)) {
    if (selAssets.size > 0) warnings.push('Home Carousel needs an image asset; selected copy-only assets will be skipped there.')
  }
  for (const ch of channels) {
    if (selChannels.has(ch.channel) && ch.channel !== 'home_carousel' && !ch.connected) {
      warnings.push(`${ch.label} isn't connected — assets will be recorded as exports, not posted live.`)
    }
  }

  const canConfirm = canPublish && !busy && selAssets.size > 0 && selChannels.size > 0

  const confirm = async () => {
    if (!canConfirm) return
    setBusy(true); setResult(null)
    let ok = 0, fail = 0
    for (const assetId of Array.from(selAssets)) {
      const asset = assets.find((a) => a.id === assetId)
      for (const channel of Array.from(selChannels)) {
        // Skip carousel for assets without an image (would 422).
        if (channel === 'home_carousel' && asset && !asset.hasImage) continue
        try {
          const r = await fetch('/api/company/marketing/v2/publish', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ artifact_id: assetId, channel }),
          })
          if (r.ok) ok++; else fail++
        } catch { fail++ }
      }
    }
    setBusy(false)
    setResult(`${ok} published/exported${fail ? ` · ${fail} failed` : ''}.`)
    onPublished?.()
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 94vw)', maxHeight: '82vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 24px 70px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)' }}>🚀 Publishing preview</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {!campaignId ? (
            <Empty>Open a campaign to publish its assets.</Empty>
          ) : loading ? (
            <Empty>Loading approved assets…</Empty>
          ) : (
            <>
              <Section title={`Approved assets (${assets.length})`}>
                {assets.length === 0 ? <Empty>None yet.</Empty> : assets.map((a) => (
                  <label key={a.id} style={rowStyle}>
                    <input type="checkbox" checked={selAssets.has(a.id)} onChange={() => toggle(selAssets, setSelAssets, a.id)} />
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'capitalize' }}>{a.type}</span>
                  </label>
                ))}
              </Section>

              <Section title="Channels">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {channels.map((c) => {
                    const on = selChannels.has(c.channel)
                    return (
                      <button key={c.channel} onClick={() => toggle(selChannels, setSelChannels, c.channel)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: `1px solid ${on ? PURPLE : 'var(--border)'}`, background: on ? PURPLE + '18' : 'var(--bg-inset)', color: on ? PURPLE : 'var(--text)' }}>
                        {c.label}
                        <span style={{ width: 7, height: 7, borderRadius: 999, background: c.connected ? ACCENT : 'var(--text-faintest)' }} title={c.connected ? 'Connected (live)' : 'Not connected (export)'} />
                      </button>
                    )
                  })}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 6 }}>Schedule: <span title="Scheduling coming soon" style={{ opacity: 0.6 }}>Publish now</span> (scheduled jobs coming soon)</div>
              </Section>

              {warnings.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12, borderRadius: 10, background: RED + '12', border: `1px solid ${RED}33` }}>
                  {warnings.map((w, i) => <div key={i} style={{ fontSize: 12, color: RED, lineHeight: 1.4 }}>⚠ {w}</div>)}
                </div>
              )}
              {result && <div style={{ fontSize: 13, fontWeight: 600, color: ACCENT }}>{result}</div>}
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '14px 18px', borderTop: '1px solid var(--border)' }}>
          {!canPublish && <span style={{ fontSize: 12, color: 'var(--text-faint)', marginRight: 'auto' }}>Your role can&apos;t publish.</span>}
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 16px', fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => void confirm()} disabled={!canConfirm}
            style={{ background: canConfirm ? ACCENT : 'var(--bg-inset)', color: canConfirm ? '#fff' : 'var(--text-faint)', border: 'none', borderRadius: 9, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: canConfirm ? 'pointer' : 'default' }}>
            {busy ? 'Publishing…' : 'Confirm & Publish'}
          </button>
        </div>
      </div>
    </div>
  )
}

const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px', cursor: 'pointer' }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-faint)', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{children}</div>
}
