'use client'

// Asset Library / Intelligence panel (spec § Asset Library). A slide-over that lists
// every campaign artifact as a reusable card with derived intelligence — type, status,
// version, owner agent, quality score, approval — grouped into campaign collections.

import React from 'react'
import { ACCENT, PURPLE, RED } from '@/components/company/marketing/director/theme'
import { AssetInspector } from '@/components/company/marketing/director/AssetInspector'

interface AssetRow {
  id: string
  type: string
  channel: string | null
  title: string
  status: string
  version: number
  agent: string | null
  quality_score: number | null
  asset_url: string | null
  campaign_id: string | null
  campaign_name: string | null
  updated_at: string
}
interface Collection { id: string; name: string; count: number }

function approvalLabel(status: string): { label: string; color: string } {
  switch (status) {
    case 'approved': return { label: 'Approved', color: ACCENT }
    case 'needs_review': return { label: 'In Review', color: '#E0A020' }
    case 'rejected': case 'voided': return { label: 'Rejected', color: RED }
    default: return { label: 'Draft', color: 'var(--text-faint)' }
  }
}

export function AssetLibraryPanel({
  brands, onClose,
}: {
  brands: { id: string; name: string }[]
  onClose: () => void
}): React.JSX.Element {
  const [brandId, setBrandId] = React.useState(brands[0]?.id ?? '')
  const [assets, setAssets] = React.useState<AssetRow[]>([])
  const [collections, setCollections] = React.useState<Collection[]>([])
  const [loading, setLoading] = React.useState(false)
  const [inspectId, setInspectId] = React.useState<string | null>(null)

  const load = React.useCallback(() => {
    if (!brandId) return
    setLoading(true)
    fetch(`/api/company/marketing/v2/assets?brand_id=${encodeURIComponent(brandId)}`)
      .then(r => r.json())
      .then(d => { setAssets(Array.isArray(d.assets) ? d.assets : []); setCollections(Array.isArray(d.collections) ? d.collections : []) })
      .catch(() => { setAssets([]); setCollections([]) })
      .finally(() => setLoading(false))
  }, [brandId])

  React.useEffect(() => { load() }, [load])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 'min(720px, 100%)', height: '100%', background: 'var(--bg-base)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', boxShadow: '-12px 0 32px rgba(0,0,0,0.3)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 18 }}>🖼️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)' }}>Asset Library</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Every campaign asset with its quality + approval intelligence.</div>
          </div>
          <select value={brandId} onChange={e => setBrandId(e.target.value)} style={{ background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', color: 'var(--text-strong)', fontSize: 13 }}>
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text-faint)' }}>×</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 22 }}>
          {loading ? (
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Loading…</div>
          ) : assets.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>No assets yet for this brand. Run a campaign in the Director.</div>
          ) : (
            collections.map(col => (
              <div key={col.id}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', marginBottom: 10 }}>
                  {col.name} <span style={{ color: PURPLE }}>· {col.count}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
                  {assets.filter(a => a.campaign_id === col.id).map(a => {
                    const ap = approvalLabel(a.status)
                    return (
                      <div key={a.id} onClick={() => setInspectId(a.id)} style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-surface)', cursor: 'pointer' }}>
                        <div style={{ height: 110, background: 'var(--bg-inset)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                          {a.asset_url && (a.type === 'image' || a.type === 'carousel') ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={a.asset_url} alt={a.title} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : a.asset_url && a.type === 'video' ? (
                            <video src={a.asset_url} preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <span style={{ fontSize: 26 }}>{a.type === 'video' ? '🎬' : a.type === 'social' || a.type === 'copy' ? '✍️' : '🖼️'}</span>
                          )}
                        </div>
                        <div style={{ padding: '9px 11px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={a.title}>{a.title}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 10.5, color: 'var(--text-dim)' }}>
                            <span style={{ textTransform: 'capitalize' }}>{a.type}</span>
                            <span>· v{a.version}</span>
                            {a.agent ? <span>· {a.agent}</span> : null}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: ap.color, background: ap.color === 'var(--text-faint)' ? 'var(--fill-soft)' : ap.color + '22', padding: '2px 7px', borderRadius: 999 }}>{ap.label}</span>
                            {typeof a.quality_score === 'number' ? (
                              <span style={{ fontSize: 10.5, fontWeight: 800, fontFamily: 'monospace', color: a.quality_score >= 80 ? ACCENT : a.quality_score >= 60 ? '#E0A020' : RED }}>{a.quality_score}/100</span>
                            ) : null}
                          </div>
                          {a.asset_url ? (
                            <a href={a.asset_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 11, fontWeight: 600, color: PURPLE, textDecoration: 'none' }}>Open →</a>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      {inspectId && (
        <AssetInspector artifactId={inspectId} onClose={() => setInspectId(null)} onChanged={load} />
      )}
    </div>
  )
}
