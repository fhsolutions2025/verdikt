'use client'

// Analytics + Campaign Health panel (spec § Campaign Health Score). A slide-over that
// shows a continuously-computed health score per campaign with a dimension breakdown
// and proactive gap analysis.

import React from 'react'
import { ACCENT, PURPLE, RED } from '@/components/company/marketing/director/theme'

interface Breakdown { creative: number; coverage: number; approval: number; compliance: number; reach: number }
interface Health { score: number; breakdown: Breakdown; gaps: string[] }
interface Row { campaign_id: string; name: string; total: number; approved: number; published: number; avg_quality: number | null; health: Health }
interface Totals { campaigns: number; assets: number; approved: number; published: number; avg_health: number }

function scoreColor(n: number): string {
  return n >= 80 ? ACCENT : n >= 60 ? '#E0A020' : RED
}

export function AnalyticsPanel({
  brands, onClose,
}: {
  brands: { id: string; name: string }[]
  onClose: () => void
}): React.JSX.Element {
  const [brandId, setBrandId] = React.useState(brands[0]?.id ?? '')
  const [rows, setRows] = React.useState<Row[]>([])
  const [totals, setTotals] = React.useState<Totals | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!brandId) return
    setLoading(true)
    fetch(`/api/company/marketing/v2/analytics?brand_id=${encodeURIComponent(brandId)}`)
      .then(r => r.json())
      .then(d => { setRows(Array.isArray(d.campaigns) ? d.campaigns : []); setTotals(d.totals ?? null) })
      .catch(() => { setRows([]); setTotals(null) })
      .finally(() => setLoading(false))
  }, [brandId])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(640px, 100%)', height: '100%', background: 'var(--bg-base)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', boxShadow: '-12px 0 32px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 18 }}>📊</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)' }}>Analytics</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Campaign health, quality, approvals and reach.</div>
          </div>
          <select value={brandId} onChange={e => setBrandId(e.target.value)} style={{ background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', color: 'var(--text-strong)', fontSize: 13 }}>
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text-faint)' }}>×</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Totals strip */}
          {totals && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1, background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              {[
                { l: 'Avg Health', v: `${totals.avg_health}%`, c: scoreColor(totals.avg_health) },
                { l: 'Campaigns', v: String(totals.campaigns) },
                { l: 'Assets', v: String(totals.assets) },
                { l: 'Approved', v: String(totals.approved) },
                { l: 'Published', v: String(totals.published) },
              ].map(t => (
                <div key={t.l} style={{ background: 'var(--bg-surface)', padding: '12px 10px' }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-dim)' }}>{t.l}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'monospace', marginTop: 3, color: t.c ?? 'var(--text-strong)' }}>{t.v}</div>
                </div>
              ))}
            </div>
          )}

          {loading ? (
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Loading…</div>
          ) : rows.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>No campaigns yet for this brand.</div>
          ) : rows.map(r => (
            <div key={r.campaign_id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: 'var(--bg-surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{r.total} assets · {r.approved} approved · {r.published} published</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'monospace', color: scoreColor(r.health.score), lineHeight: 1 }}>{r.health.score}%</div>
                  <div style={{ fontSize: 9.5, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Health</div>
                </div>
              </div>
              {/* Breakdown bars */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {([['Creative', r.health.breakdown.creative], ['Coverage', r.health.breakdown.coverage], ['Approval', r.health.breakdown.approval], ['Compliance', r.health.breakdown.compliance], ['Reach', r.health.breakdown.reach]] as [string, number][]).map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 78, fontSize: 11, color: 'var(--text-dim)' }}>{label}</span>
                    <div style={{ flex: 1, height: 5, background: 'var(--border-soft)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${val}%`, height: '100%', background: scoreColor(val), borderRadius: 3 }} />
                    </div>
                    <span style={{ width: 30, textAlign: 'right', fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: 'var(--text)' }}>{val}</span>
                  </div>
                ))}
              </div>
              {r.health.gaps.length > 0 && (
                <div style={{ marginTop: 12, padding: '8px 10px', borderRadius: 8, background: 'rgba(108,63,197,0.08)', border: '1px solid rgba(108,63,197,0.2)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: PURPLE, marginBottom: 3 }}>Gap analysis</div>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {r.health.gaps.map((g, i) => <li key={i} style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{g}</li>)}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
