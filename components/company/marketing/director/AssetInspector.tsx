'use client'

// Asset Inspector (spec § Human Feedback Loop + Inspector Panel). Opened from the
// Asset Library; shows version history, approval actions, a comment thread, and the
// downstream assets that may need regeneration if this one changes.

import React from 'react'
import { ACCENT, PURPLE, RED, GRADIENT } from '@/components/company/marketing/director/theme'

interface VersionRow { id: string; version: number; asset_url: string | null; source: string | null; created_at: string; quality_score: number | null }
interface CommentRow { id: string; actor: string; text: string; created_at: string }
interface ArtifactRow { id: string; type: string; channel: string | null; status: string; title: string; created_by_agent: string | null }

export function AssetInspector({
  artifactId, onClose, onChanged,
}: {
  artifactId: string
  onClose: () => void
  onChanged?: () => void
}): React.JSX.Element {
  const [artifact, setArtifact] = React.useState<ArtifactRow | null>(null)
  const [versions, setVersions] = React.useState<VersionRow[]>([])
  const [comments, setComments] = React.useState<CommentRow[]>([])
  const [downstream, setDownstream] = React.useState<string[]>([])
  const [comment, setComment] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [pubs, setPubs] = React.useState<{ id: string; channel: string; status: string }[]>([])
  const [pubMsg, setPubMsg] = React.useState<string | null>(null)
  const [rewrite, setRewrite] = React.useState('')
  const [rewriteMsg, setRewriteMsg] = React.useState<string | null>(null)
  const isText = artifact ? ['social', 'copy', 'blog'].includes(artifact.type) : false

  const load = React.useCallback(async () => {
    const r = await fetch(`/api/company/marketing/v2/artifact?id=${artifactId}`).then(x => x.json()).catch(() => null)
    if (!r || r.error) return
    setArtifact(r.artifact); setVersions(r.versions ?? []); setComments(r.comments ?? []); setDownstream(r.downstream ?? [])
  }, [artifactId])

  const loadPubs = React.useCallback(async () => {
    const r = await fetch(`/api/company/marketing/v2/publish?artifact_id=${artifactId}`).then(x => x.json()).catch(() => null)
    if (r && Array.isArray(r.publications)) setPubs(r.publications)
  }, [artifactId])

  React.useEffect(() => { void load(); void loadPubs() }, [load, loadPubs])

  const publish = async (channel: string) => {
    if (busy) return
    setBusy(true); setPubMsg(null)
    try {
      const r = await fetch('/api/company/marketing/v2/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artifact_id: artifactId, channel }),
      })
      const d = await r.json()
      setPubMsg(r.ok ? (d.status === 'published' ? 'Published live ✓' : 'Exported ✓') : `Error: ${d.error ?? 'failed'}`)
      if (r.ok) { await loadPubs(); onChanged?.() }
    } finally { setBusy(false) }
  }

  const act = async (action: 'approve' | 'reject' | 'comment') => {
    if (busy) return
    if (action === 'comment' && !comment.trim()) return
    setBusy(true)
    try {
      await fetch('/api/company/marketing/v2/artifact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: artifactId, action, text: action === 'comment' ? comment : undefined }),
      })
      if (action === 'comment') setComment('')
      await load(); onChanged?.()
    } finally { setBusy(false) }
  }

  const doRewrite = async () => {
    const instruction = rewrite.trim()
    if (!instruction || busy) return
    setBusy(true); setRewriteMsg(null)
    try {
      const r = await fetch('/api/company/marketing/v2/artifact/rewrite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artifact_id: artifactId, instruction }),
      })
      const d = await r.json()
      setRewriteMsg(r.ok ? `Rewritten → v${d.version}` : `Error: ${d.error ?? 'failed'}`)
      if (r.ok) { setRewrite(''); await load(); onChanged?.() }
    } finally { setBusy(false) }
  }

  const statusColor = artifact?.status === 'approved' ? ACCENT : artifact?.status === 'rejected' ? RED : '#E0A020'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '5vh 16px', background: 'rgba(0,0,0,0.55)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(560px, 100%)', maxHeight: '90vh', overflow: 'auto', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{artifact?.title ?? 'Asset'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'capitalize' }}>{artifact?.type}{artifact?.channel ? ` · ${artifact.channel}` : ''}{artifact?.created_by_agent ? ` · ${artifact.created_by_agent}` : ''}</div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: statusColor, background: statusColor + '22', padding: '3px 9px', borderRadius: 999, textTransform: 'capitalize' }}>{artifact?.status ?? '—'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text-faint)' }}>×</button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Approval actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => act('approve')} disabled={busy} style={{ flex: 1, background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '10px', fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>✓ Approve</button>
            <button onClick={() => act('reject')} disabled={busy} style={{ flex: 1, background: 'transparent', color: RED, border: `1px solid ${RED}55`, borderRadius: 10, padding: '10px', fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>✕ Reject</button>
          </div>

          {/* Version history */}
          <div>
            <SectionTitle>Version history</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {versions.length === 0 ? <Empty>No versions.</Empty> : versions.map(v => (
                <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--border-soft)', borderRadius: 9, background: 'var(--bg-inset)' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'monospace' }}>v{v.version}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', flex: 1 }}>{new Date(v.created_at).toLocaleString()}{v.source ? ` · ${v.source}` : ''}</span>
                  {typeof v.quality_score === 'number' ? <span style={{ fontSize: 11, fontWeight: 800, fontFamily: 'monospace', color: v.quality_score >= 80 ? ACCENT : '#E0A020' }}>{v.quality_score}</span> : null}
                  {v.asset_url ? <a href={v.asset_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: PURPLE, fontWeight: 600, textDecoration: 'none' }}>Open</a> : null}
                </div>
              ))}
            </div>
          </div>

          {/* Downstream dependencies */}
          {downstream.length > 0 && (
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(108,63,197,0.08)', border: '1px solid rgba(108,63,197,0.25)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: PURPLE, marginBottom: 4 }}>⚡ Dependent assets</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>If this changes, consider regenerating: <strong style={{ color: 'var(--text)' }}>{downstream.join(', ')}</strong>.</div>
            </div>
          )}

          {/* Rewrite engine (text assets only) */}
          {isText && (
            <div>
              <SectionTitle>Rewrite</SectionTitle>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={rewrite} onChange={e => setRewrite(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); doRewrite() } }}
                  placeholder="e.g. make it punchier and add urgency…"
                  style={{ flex: 1, background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 999, padding: '8px 14px', color: 'var(--text-strong)', fontSize: 13, outline: 'none' }}
                />
                <button onClick={doRewrite} disabled={busy || !rewrite.trim()} style={{ background: GRADIENT, color: '#fff', border: 'none', borderRadius: 999, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: busy || !rewrite.trim() ? 'default' : 'pointer', opacity: rewrite.trim() ? 1 : 0.6 }}>Rewrite</button>
              </div>
              {rewriteMsg && <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6, color: rewriteMsg.startsWith('Error') ? RED : ACCENT }}>{rewriteMsg}</div>}
            </div>
          )}

          {/* Publishing */}
          <div>
            <SectionTitle>Publish</SectionTitle>
            {artifact?.status !== 'approved' ? (
              <Empty>Approve this asset to enable publishing.</Empty>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {(artifact?.type === 'image' || artifact?.type === 'carousel') && (
                  <button onClick={() => publish('home_carousel')} disabled={busy} style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
                    Publish to Home Carousel
                  </button>
                )}
                <button onClick={() => publish('export')} disabled={busy} style={{ background: 'transparent', color: PURPLE, border: `1px solid ${PURPLE}55`, borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
                  Mark exported
                </button>
                {pubMsg && <span style={{ fontSize: 12, fontWeight: 600, color: pubMsg.startsWith('Error') ? RED : ACCENT }}>{pubMsg}</span>}
              </div>
            )}
            {pubs.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--text-dim)' }}>
                {pubs.map(p => <span key={p.id} style={{ marginRight: 10 }}>• {p.channel} ({p.status})</span>)}
              </div>
            )}
          </div>

          {/* Comments */}
          <div>
            <SectionTitle>Comments</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
              {comments.length === 0 ? <Empty>No comments yet.</Empty> : comments.map(c => (
                <div key={c.id} style={{ padding: '8px 10px', border: '1px solid var(--border-soft)', borderRadius: 9, background: 'var(--bg-inset)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 2 }}>{c.actor} · {new Date(c.created_at).toLocaleString()}</div>
                  <div style={{ fontSize: 13, color: 'var(--text)' }}>{c.text}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={comment} onChange={e => setComment(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); act('comment') } }}
                placeholder="Add a comment…"
                style={{ flex: 1, background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 999, padding: '8px 14px', color: 'var(--text-strong)', fontSize: 13, outline: 'none' }}
              />
              <button onClick={() => act('comment')} disabled={busy || !comment.trim()} style={{ background: GRADIENT, color: '#fff', border: 'none', borderRadius: 999, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: busy || !comment.trim() ? 'default' : 'pointer', opacity: comment.trim() ? 1 : 0.6 }}>Send</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', marginBottom: 8 }}>{children}</div>
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{children}</div>
}
