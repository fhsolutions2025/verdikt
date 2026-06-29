'use client'

// WS-7 — approvals slide-over (interaction map §11). Lists the campaign's assets awaiting
// review and lets a reviewer Approve / Reject (with reason) / Request changes (with note).
// Decisions POST to /v2/approvals (gate:'artifact'), which flips the artifact status and
// records the decision on the Activity tab. Gated by the `approve` capability.

import React from 'react'
import { ACCENT, PURPLE, RED } from '@/components/company/marketing/director/theme'

interface ReviewAsset { id: string; title: string; type: string; status: string; assetUrl: string | null }

function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === 'object' && v !== null }

const ACTIONABLE = new Set(['needs_review', 'pending_review', 'draft', 'changes_requested'])

export function ApprovalsPanel({
  open, campaignId, canApprove, onClose, onChanged,
}: {
  open: boolean
  campaignId: string | null
  canApprove: boolean
  onClose: () => void
  onChanged?: () => void
}): React.JSX.Element | null {
  const [loading, setLoading] = React.useState(false)
  const [assets, setAssets] = React.useState<ReviewAsset[]>([])
  const [busyId, setBusyId] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    if (!campaignId) { setAssets([]); return }
    setLoading(true)
    try {
      const r: unknown = await fetch(`/api/company/marketing/v2/artifacts?campaign_id=${encodeURIComponent(campaignId)}&with_versions=1`).then((x) => x.json()).catch(() => null)
      const rows = isRecord(r) && Array.isArray(r.data) ? r.data : []
      const parsed: ReviewAsset[] = rows.filter(isRecord).map((a) => {
        const ver = isRecord(a.latest_version) ? a.latest_version : null
        return {
          id: String(a.id), title: typeof a.title === 'string' ? a.title : 'Asset',
          type: typeof a.type === 'string' ? a.type : 'asset', status: typeof a.status === 'string' ? a.status : 'draft',
          assetUrl: ver && typeof ver.asset_url === 'string' ? ver.asset_url : null,
        }
      })
      setAssets(parsed)
    } finally { setLoading(false) }
  }, [campaignId])

  React.useEffect(() => { if (open) void load() }, [open, load])

  if (!open) return null

  const decide = async (assetId: string, decision: 'approved' | 'rejected' | 'request_changes') => {
    if (!canApprove || busyId) return
    let comment: string | null = null
    if (decision === 'rejected') {
      comment = typeof window !== 'undefined' ? window.prompt('Reason for rejection (returned to the owning agent):') : null
      if (comment === null) return
    } else if (decision === 'request_changes') {
      comment = typeof window !== 'undefined' ? window.prompt('What changes are needed?') : null
      if (comment === null) return
    }
    setBusyId(assetId)
    try {
      await fetch('/api/company/marketing/v2/approvals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artifact_id: assetId, gate: 'artifact', decision, comment }),
      })
      await load(); onChanged?.()
    } finally { setBusyId(null) }
  }

  const pending = assets.filter((a) => ACTIONABLE.has(a.status))
  const decided = assets.filter((a) => !ACTIONABLE.has(a.status))

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.4)' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 71, width: 'min(440px, 94vw)', display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)', boxShadow: '-12px 0 40px rgba(0,0,0,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)' }}>✅ Approvals</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {!campaignId ? (
            <Empty>Open a campaign to review its assets.</Empty>
          ) : loading ? (
            <Empty>Loading…</Empty>
          ) : (
            <>
              <div>
                <Header>Awaiting review ({pending.length})</Header>
                {pending.length === 0 ? <Empty>Nothing pending.</Empty> : pending.map((a) => (
                  <div key={a.id} style={card}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      {a.assetUrl ? <img src={a.assetUrl} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', background: 'var(--bg-inset)' }} /> : <span style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--bg-inset)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📄</span>}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'capitalize' }}>{a.type} · {a.status.replace(/_/g, ' ')}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button onClick={() => void decide(a.id, 'approved')} disabled={!canApprove || busyId === a.id} style={btn(ACCENT, true, canApprove)}>Approve</button>
                      <button onClick={() => void decide(a.id, 'request_changes')} disabled={!canApprove || busyId === a.id} style={btn(PURPLE, false, canApprove)}>Changes</button>
                      <button onClick={() => void decide(a.id, 'rejected')} disabled={!canApprove || busyId === a.id} style={btn(RED, false, canApprove)}>Reject</button>
                    </div>
                  </div>
                ))}
              </div>

              {decided.length > 0 && (
                <div>
                  <Header>Decided ({decided.length})</Header>
                  {decided.map((a) => (
                    <div key={a.id} style={{ ...card, opacity: 0.75 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'capitalize', color: a.status === 'approved' ? ACCENT : RED }}>{a.status.replace(/_/g, ' ')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!canApprove && <Empty>Your role can&apos;t approve assets.</Empty>}
            </>
          )}
        </div>
      </div>
    </>
  )
}

const card: React.CSSProperties = { padding: 12, borderRadius: 11, border: '1px solid var(--border-soft)', background: 'var(--bg-inset)', marginBottom: 8 }
function btn(color: string, solid: boolean, enabled: boolean): React.CSSProperties {
  return {
    flex: 1, fontSize: 12.5, fontWeight: 700, padding: '7px 0', borderRadius: 8, cursor: enabled ? 'pointer' : 'not-allowed',
    border: solid ? 'none' : `1px solid ${color}55`, background: solid ? color : 'transparent', color: solid ? '#fff' : color,
    opacity: enabled ? 1 : 0.5,
  }
}
function Header({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-faint)', marginBottom: 10 }}>{children}</div>
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{children}</div>
}
