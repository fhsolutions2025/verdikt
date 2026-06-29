'use client'

// Content Calendar panel — a slide-over inside the Campaign Director workspace.
// Pick a brand, and every asset is grouped by its last-updated calendar day so the
// team can see a chronological publishing schedule at a glance. Read-only.

import React from 'react'
import { ACCENT } from '@/components/company/marketing/director/theme'

interface CalendarAsset {
  id: string
  type: string
  title: string
  status: string
  updated_at: string
  campaign_name: string | null
  asset_url: string | null
}

interface DayGroup {
  key: string            // YYYY-MM-DD
  label: string          // "Mon, Jun 29"
  assets: CalendarAsset[]
}

function asCalendarAsset(v: unknown): CalendarAsset | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (typeof o.id !== 'string') return null
  return {
    id: o.id,
    type: typeof o.type === 'string' ? o.type : '',
    title: typeof o.title === 'string' ? o.title : 'Asset',
    status: typeof o.status === 'string' ? o.status : 'draft',
    updated_at: typeof o.updated_at === 'string' ? o.updated_at : new Date().toISOString(),
    campaign_name: typeof o.campaign_name === 'string' ? o.campaign_name : null,
    asset_url: typeof o.asset_url === 'string' ? o.asset_url : null,
  }
}

function typeEmoji(type: string): string {
  const t = type.toLowerCase()
  if (t.includes('video') || t.includes('reel') || t.includes('clip')) return '🎬'
  if (t.includes('image') || t.includes('img') || t.includes('banner') || t.includes('visual') || t.includes('photo')) return '🖼️'
  return '✍️'
}

function statusColor(status: string): string {
  if (status === 'approved') return ACCENT
  if (status === 'needs_review') return '#E0A020'
  return 'var(--text-faint)'
}

function dayKey(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '0000-00-00'
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function groupByDay(assets: CalendarAsset[]): DayGroup[] {
  const map = new Map<string, DayGroup>()
  for (const a of assets) {
    const key = dayKey(a.updated_at)
    const existing = map.get(key)
    if (existing) existing.assets.push(a)
    else map.set(key, { key, label: dayLabel(a.updated_at), assets: [a] })
  }
  return Array.from(map.values()).sort((x, y) => (x.key < y.key ? 1 : x.key > y.key ? -1 : 0))
}

export function ContentCalendarPanel({
  brands, onClose,
}: {
  brands: { id: string; name: string }[]
  onClose: () => void
}): React.JSX.Element {
  const [brandId, setBrandId] = React.useState(brands[0]?.id ?? '')
  const [assets, setAssets] = React.useState<CalendarAsset[]>([])
  const [loading, setLoading] = React.useState(false)

  const load = React.useCallback(async (bid: string) => {
    if (!bid) { setAssets([]); return }
    setLoading(true)
    try {
      const r = await fetch(`/api/company/marketing/v2/assets?brand_id=${encodeURIComponent(bid)}`)
      const d: unknown = await r.json()
      const raw = d && typeof d === 'object' ? (d as Record<string, unknown>).assets : undefined
      const list = Array.isArray(raw)
        ? raw.map(asCalendarAsset).filter((a): a is CalendarAsset => a !== null)
        : []
      setAssets(list)
    } catch {
      setAssets([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void load(brandId) }, [brandId, load])

  const groups = React.useMemo(() => groupByDay(assets), [assets])

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)', height: '100%', background: 'var(--bg-base)',
          borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
          boxShadow: '-12px 0 32px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 18 }}>🗓️</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)' }}>Content Calendar</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Assets grouped by the day they were last updated.</div>
          </div>
          <select
            value={brandId}
            onChange={e => setBrandId(e.target.value)}
            style={{
              background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 10,
              padding: '7px 10px', color: 'var(--text-strong)', fontSize: 12.5, outline: 'none', maxWidth: 160,
            }}
          >
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text-faint)' }}>×</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {loading ? (
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Loading…</div>
          ) : groups.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>No assets scheduled yet for this brand.</div>
          ) : (
            groups.map(g => (
              <div key={g.key}>
                <div style={{
                  fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                  color: 'var(--text-faint)', marginBottom: 8,
                }}>
                  {g.label}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {g.assets.map(a => (
                    <div key={a.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      border: '1px solid var(--border-soft)', borderRadius: 10, background: 'var(--bg-inset)',
                    }}>
                      <span style={{ fontSize: 16 }}>{typeEmoji(a.type)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>
                        {a.campaign_name && (
                          <div style={{ fontSize: 11.5, color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.campaign_name}</div>
                        )}
                      </div>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                        color: statusColor(a.status), background: `${statusColor(a.status)}1F`,
                      }}>{a.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
