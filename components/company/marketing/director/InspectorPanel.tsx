'use client'

// Persistent, docked right-column Inspector for the Campaign Workspace
// (spec § Inspector Panel). Unlike AssetInspector (a modal overlay), this is a
// fixed-width, full-height docked panel with its own scroll and a tab row. It
// mirrors AssetInspector's data-loading + action logic exactly, but the sections
// are split across tabs (Inspector / Details / Versions / Comments / Publishing).

import React from 'react'
import { ACCENT, PURPLE, RED, GRADIENT } from '@/components/company/marketing/director/theme'
import { AssetPreview } from '@/components/company/marketing/director/AssetPreview'

interface VersionRow { id: string; version: number; asset_url: string | null; source: string | null; created_at: string; quality_score: number | null }
interface CommentRow { id: string; actor: string; text: string; created_at: string }
interface ArtifactRow {
  id: string; campaign_id: string | null; type: string; channel: string | null
  status: string; title: string; created_by_agent: string | null; created_at: string | null
}
interface PublicationRow { id: string; channel: string; status: string }

type TabKey = 'inspector' | 'details' | 'versions' | 'comments' | 'publishing'
const TABS: { key: TabKey; label: string }[] = [
  { key: 'inspector', label: 'Inspector' },
  { key: 'details', label: 'Details' },
  { key: 'versions', label: 'Versions' },
  { key: 'comments', label: 'Comments' },
  { key: 'publishing', label: 'Publishing' },
]

function asString(v: unknown): string | null { return typeof v === 'string' ? v : null }
function asNumber(v: unknown): number | null { return typeof v === 'number' ? v : null }
function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === 'object' && v !== null }

function parseArtifact(v: unknown): ArtifactRow | null {
  if (!isRecord(v)) return null
  const id = asString(v.id)
  if (!id) return null
  return {
    id,
    campaign_id: asString(v.campaign_id),
    type: asString(v.type) ?? 'unknown',
    channel: asString(v.channel),
    status: asString(v.status) ?? 'draft',
    title: asString(v.title) ?? 'Asset',
    created_by_agent: asString(v.created_by_agent),
    created_at: asString(v.created_at),
  }
}
function parseVersions(v: unknown): VersionRow[] {
  if (!Array.isArray(v)) return []
  const out: VersionRow[] = []
  for (const row of v) {
    if (!isRecord(row)) continue
    const id = asString(row.id)
    if (!id) continue
    out.push({
      id,
      version: asNumber(row.version) ?? 0,
      asset_url: asString(row.asset_url),
      source: asString(row.source),
      created_at: asString(row.created_at) ?? '',
      quality_score: asNumber(row.quality_score),
    })
  }
  return out
}
function parseComments(v: unknown): CommentRow[] {
  if (!Array.isArray(v)) return []
  const out: CommentRow[] = []
  for (const row of v) {
    if (!isRecord(row)) continue
    const id = asString(row.id)
    if (!id) continue
    out.push({
      id,
      actor: asString(row.actor) ?? 'system',
      text: asString(row.text) ?? '',
      created_at: asString(row.created_at) ?? '',
    })
  }
  return out
}
function parsePublications(v: unknown): PublicationRow[] {
  if (!Array.isArray(v)) return []
  const out: PublicationRow[] = []
  for (const row of v) {
    if (!isRecord(row)) continue
    const id = asString(row.id)
    if (!id) continue
    out.push({
      id,
      channel: asString(row.channel) ?? '—',
      status: asString(row.status) ?? '—',
    })
  }
  return out
}

const TEXT_TYPES = ['social', 'copy', 'blog']

export function InspectorPanel({
  artifactId, onChanged, onGenerate,
}: {
  artifactId: string | null
  onChanged?: () => void
  onGenerate?: () => void
}): React.JSX.Element {
  const [tab, setTab] = React.useState<TabKey>('inspector')
  const [loading, setLoading] = React.useState(false)
  const [artifact, setArtifact] = React.useState<ArtifactRow | null>(null)
  const [versions, setVersions] = React.useState<VersionRow[]>([])
  const [comments, setComments] = React.useState<CommentRow[]>([])
  const [pubs, setPubs] = React.useState<PublicationRow[]>([])
  const [comment, setComment] = React.useState('')
  const [rewrite, setRewrite] = React.useState('')
  const [rewriteMsg, setRewriteMsg] = React.useState<string | null>(null)
  const [pubMsg, setPubMsg] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const isText = artifact ? TEXT_TYPES.includes(artifact.type) : false
  const primaryVersion = versions.length > 0 ? versions[0] : null
  // The GET payload doesn't return version content text, only asset_url. For
  // text-like assets we surface a note instead of body copy (see below).
  const bodyText: string | undefined = undefined

  const load = React.useCallback(async () => {
    if (!artifactId) return
    setLoading(true)
    try {
      const [aRes, pRes] = await Promise.all([
        fetch(`/api/company/marketing/v2/artifact?id=${encodeURIComponent(artifactId)}`)
          .then(x => x.json() as Promise<unknown>).catch(() => null),
        fetch(`/api/company/marketing/v2/publish?artifact_id=${encodeURIComponent(artifactId)}`)
          .then(x => x.json() as Promise<unknown>).catch(() => null),
      ])
      if (isRecord(aRes) && !aRes.error) {
        setArtifact(parseArtifact(aRes.artifact))
        setVersions(parseVersions(aRes.versions))
        setComments(parseComments(aRes.comments))
      } else {
        setArtifact(null); setVersions([]); setComments([])
      }
      setPubs(isRecord(pRes) ? parsePublications(pRes.publications) : [])
    } finally {
      setLoading(false)
    }
  }, [artifactId])

  React.useEffect(() => {
    setArtifact(null); setVersions([]); setComments([]); setPubs([])
    setComment(''); setRewrite(''); setRewriteMsg(null); setPubMsg(null)
    void load()
  }, [load])

  const act = async (action: 'approve' | 'reject' | 'comment') => {
    if (!artifactId || busy) return
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
    if (!artifactId || !instruction || busy) return
    setBusy(true); setRewriteMsg(null)
    try {
      const r = await fetch('/api/company/marketing/v2/artifact/rewrite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artifact_id: artifactId, instruction }),
      })
      const d: unknown = await r.json().catch(() => null)
      const version = isRecord(d) ? asNumber(d.version) : null
      const errMsg = isRecord(d) ? asString(d.error) : null
      setRewriteMsg(r.ok ? `Rewritten → v${version ?? '?'}` : `Error: ${errMsg ?? 'failed'}`)
      if (r.ok) { setRewrite(''); await load(); onChanged?.() }
    } finally { setBusy(false) }
  }

  const publish = async (channel: string) => {
    if (!artifactId || busy) return
    setBusy(true); setPubMsg(null)
    try {
      const r = await fetch('/api/company/marketing/v2/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artifact_id: artifactId, channel }),
      })
      const d: unknown = await r.json().catch(() => null)
      const status = isRecord(d) ? asString(d.status) : null
      const errMsg = isRecord(d) ? asString(d.error) : null
      setPubMsg(r.ok ? (status === 'published' ? 'Published live ✓' : 'Exported ✓') : `Error: ${errMsg ?? 'failed'}`)
      if (r.ok) { await load(); onChanged?.() }
    } finally { setBusy(false) }
  }

  const statusColor = artifact?.status === 'approved' ? ACCENT : artifact?.status === 'rejected' ? RED : '#E0A020'

  const shell: React.CSSProperties = {
    width: 340, flexShrink: 0, height: '100%', borderLeft: '1px solid var(--border)',
    background: 'var(--bg-base)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
  }

  // ── Empty state ───────────────────────────────────────────────────────────────
  if (artifactId == null) {
    return (
      <div style={shell}>
        <Header />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--text-faint)', lineHeight: 1.5 }}>Select an asset to inspect details.</div>
          <button
            onClick={() => onGenerate?.()}
            style={{ background: GRADIENT, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            Generate Asset
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={shell}>
      <Header subtitle={artifact ? `${artifact.title}` : undefined} />

      {/* Tab row */}
      <div style={{ display: 'flex', gap: 2, padding: '0 8px', borderBottom: '1px solid var(--border)', overflowX: 'auto', flexShrink: 0 }}>
        {TABS.map(t => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                padding: '10px 10px', fontSize: 12.5, fontWeight: active ? 800 : 600,
                color: active ? 'var(--text-strong)' : 'var(--text-dim)',
                borderBottom: active ? `2px solid ${PURPLE}` : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loading && !artifact ? (
          <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>Loading…</div>
        ) : !artifact ? (
          <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>Could not load this asset.</div>
        ) : (
          <>
            {tab === 'inspector' && (
              <>
                <AssetPreview type={artifact.type} url={primaryVersion?.asset_url ?? undefined} text={bodyText} />
                {isText && !primaryVersion?.asset_url && (
                  <Note>Open the asset to view copy.</Note>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: statusColor, background: statusColor + '22', padding: '3px 9px', borderRadius: 999, textTransform: 'capitalize' }}>{artifact.status}</span>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => act('approve')} disabled={busy} style={{ flex: 1, background: ACCENT, color: '#fff', border: 'none', borderRadius: 10, padding: '10px', fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>✓ Approve</button>
                  <button onClick={() => act('reject')} disabled={busy} style={{ flex: 1, background: 'transparent', color: RED, border: `1px solid ${RED}55`, borderRadius: 10, padding: '10px', fontSize: 13, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>✕ Reject</button>
                </div>

                {isText && (
                  <div>
                    <SectionTitle>Rewrite</SectionTitle>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={rewrite} onChange={e => setRewrite(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void doRewrite() } }}
                        placeholder="e.g. make it punchier and add urgency…"
                        style={{ flex: 1, minWidth: 0, background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 999, padding: '8px 14px', color: 'var(--text-strong)', fontSize: 13, outline: 'none' }}
                      />
                      <button onClick={() => void doRewrite()} disabled={busy || !rewrite.trim()} style={{ background: GRADIENT, color: '#fff', border: 'none', borderRadius: 999, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: busy || !rewrite.trim() ? 'default' : 'pointer', opacity: rewrite.trim() ? 1 : 0.6 }}>Rewrite</button>
                    </div>
                    {rewriteMsg && <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6, color: rewriteMsg.startsWith('Error') ? RED : ACCENT }}>{rewriteMsg}</div>}
                  </div>
                )}
              </>
            )}

            {tab === 'details' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <DetailRow label="Type" value={artifact.type} capitalize />
                <DetailRow label="Channel" value={artifact.channel ?? '—'} />
                <DetailRow label="Status" value={artifact.status} capitalize />
                <DetailRow label="Owner agent" value={artifact.created_by_agent ?? '—'} />
                <DetailRow label="Created" value={artifact.created_at ? new Date(artifact.created_at).toLocaleString() : '—'} />
                <DetailRow label="Latest quality" value={typeof primaryVersion?.quality_score === 'number' ? String(primaryVersion.quality_score) : '—'} />
              </div>
            )}

            {tab === 'versions' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {versions.length === 0 ? <Empty>No versions yet.</Empty> : versions.map(v => (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--border-soft)', borderRadius: 9, background: 'var(--bg-inset)' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-strong)', fontFamily: 'monospace' }}>v{v.version}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', flex: 1, minWidth: 0 }}>{v.created_at ? new Date(v.created_at).toLocaleString() : '—'}{v.source ? ` · ${v.source}` : ''}</span>
                    {typeof v.quality_score === 'number' ? <span style={{ fontSize: 11, fontWeight: 800, fontFamily: 'monospace', color: v.quality_score >= 80 ? ACCENT : '#E0A020' }}>{v.quality_score}</span> : null}
                    {v.asset_url ? <a href={v.asset_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: PURPLE, fontWeight: 600, textDecoration: 'none' }}>Open</a> : null}
                  </div>
                ))}
              </div>
            )}

            {tab === 'comments' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {comments.length === 0 ? <Empty>No comments yet.</Empty> : comments.map(c => (
                    <div key={c.id} style={{ padding: '8px 10px', border: '1px solid var(--border-soft)', borderRadius: 9, background: 'var(--bg-inset)' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 2 }}>{c.actor} · {c.created_at ? new Date(c.created_at).toLocaleString() : '—'}</div>
                      <div style={{ fontSize: 13, color: 'var(--text)' }}>{c.text}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={comment} onChange={e => setComment(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void act('comment') } }}
                    placeholder="Add a comment…"
                    style={{ flex: 1, minWidth: 0, background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 999, padding: '8px 14px', color: 'var(--text-strong)', fontSize: 13, outline: 'none' }}
                  />
                  <button onClick={() => void act('comment')} disabled={busy || !comment.trim()} style={{ background: GRADIENT, color: '#fff', border: 'none', borderRadius: 999, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: busy || !comment.trim() ? 'default' : 'pointer', opacity: comment.trim() ? 1 : 0.6 }}>Send</button>
                </div>
              </div>
            )}

            {tab === 'publishing' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {artifact.status !== 'approved' ? (
                  <Empty>Approve to enable publishing.</Empty>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => void publish('home_carousel')} disabled={busy} style={{ background: ACCENT, color: '#fff', border: 'none', borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
                      Publish to Home Carousel
                    </button>
                    <button onClick={() => void publish('export')} disabled={busy} style={{ background: 'transparent', color: PURPLE, border: `1px solid ${PURPLE}55`, borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}>
                      Mark exported
                    </button>
                    {pubMsg && <span style={{ fontSize: 12, fontWeight: 600, color: pubMsg.startsWith('Error') ? RED : ACCENT }}>{pubMsg}</span>}
                  </div>
                )}
                <div>
                  <SectionTitle>Publications</SectionTitle>
                  {pubs.length === 0 ? <Empty>Not published yet.</Empty> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {pubs.map(p => (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid var(--border-soft)', borderRadius: 9, background: 'var(--bg-inset)' }}>
                          <span style={{ fontSize: 12.5, color: 'var(--text)', flex: 1 }}>{p.channel}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'capitalize' }}>{p.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Header({ subtitle }: { subtitle?: string }) {
  return (
    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-strong)' }}>Inspector</div>
      {subtitle ? <div style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{subtitle}</div> : null}
    </div>
  )
}

function DetailRow({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border-soft)' }}>
      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-faint)', width: 110, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--text)', textTransform: capitalize ? 'capitalize' : 'none', wordBreak: 'break-word' }}>{value}</span>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', marginBottom: 8 }}>{children}</div>
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{children}</div>
}
function Note({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>{children}</div>
}
