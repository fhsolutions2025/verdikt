'use client'

// Knowledge Base panel (spec § Knowledge Base) — a slide-over inside the Director
// workspace. Pick a brand, upload/paste a document, and it's chunked + embedded into
// mkt_knowledge_chunks so the copywriter can ground its output in real brand facts.

import React from 'react'
import { ACCENT, PURPLE, GRADIENT } from '@/components/company/marketing/director/theme'

interface KnowledgeDoc {
  id: string
  title: string
  source: string
  status: string
  chunk_count: number
  error: string | null
  created_at: string
}

export function KnowledgePanel({
  brands, onClose,
}: {
  brands: { id: string; name: string }[]
  onClose: () => void
}): React.JSX.Element {
  const [brandId, setBrandId] = React.useState(brands[0]?.id ?? '')
  const [docs, setDocs] = React.useState<KnowledgeDoc[]>([])
  const [loading, setLoading] = React.useState(false)
  const [title, setTitle] = React.useState('')
  const [text, setText] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [msg, setMsg] = React.useState<string | null>(null)
  const fileRef = React.useRef<HTMLInputElement | null>(null)

  const load = React.useCallback(async (bid: string) => {
    if (!bid) return
    setLoading(true)
    try {
      const r = await fetch(`/api/company/marketing/v2/knowledge?brand_id=${encodeURIComponent(bid)}`)
      const d = await r.json()
      setDocs(Array.isArray(d.documents) ? d.documents : [])
    } catch { setDocs([]) } finally { setLoading(false) }
  }, [])

  React.useEffect(() => { void load(brandId) }, [brandId, load])

  const onPickFile = async (file: File) => {
    const t = await file.text()
    setText(t)
    if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ''))
  }

  const submit = async () => {
    if (!brandId || !text.trim() || busy) return
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/company/marketing/v2/knowledge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_id: brandId, title, text, source: 'upload' }),
      })
      const d = await r.json()
      if (!r.ok) { setMsg(`Error: ${d.error ?? 'failed'}`) }
      else { setMsg(`Ingested ${d.chunks} chunks.`); setTitle(''); setText(''); await load(brandId) }
    } catch (e) { setMsg(`Error: ${(e as Error).message}`) }
    finally { setBusy(false) }
  }

  const remove = async (id: string) => {
    await fetch(`/api/company/marketing/v2/knowledge?id=${id}`, { method: 'DELETE' }).catch(() => {})
    await load(brandId)
  }

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
          <span style={{ fontSize: 18 }}>📚</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)' }}>Knowledge Base</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Documents ground the copywriter in real brand facts.</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text-faint)' }}>×</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Brand */}
          <div>
            <label style={labelStyle}>Brand</label>
            <select value={brandId} onChange={e => setBrandId(e.target.value)} style={inputStyle}>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          {/* Upload */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>Add a document</div>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" style={inputStyle} />
            <textarea
              value={text} onChange={e => setText(e.target.value)}
              placeholder="Paste text, or upload a .txt / .md / .csv file below…"
              rows={6} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
            <input
              ref={fileRef} type="file" accept=".txt,.md,.csv,text/plain,text/markdown"
              onChange={e => { const f = e.target.files?.[0]; if (f) void onPickFile(f) }}
              style={{ fontSize: 12, color: 'var(--text-dim)' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={submit} disabled={busy || !text.trim() || !brandId}
                style={{
                  background: GRADIENT, color: '#fff', border: 'none', borderRadius: 999,
                  padding: '9px 20px', fontSize: 13, fontWeight: 700,
                  cursor: busy || !text.trim() ? 'default' : 'pointer', opacity: busy || !text.trim() ? 0.6 : 1,
                }}
              >
                {busy ? 'Ingesting…' : 'Ingest document'}
              </button>
              {msg && <span style={{ fontSize: 12, color: msg.startsWith('Error') ? '#DC2626' : ACCENT, fontWeight: 600 }}>{msg}</span>}
            </div>
          </div>

          {/* Document list */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', marginBottom: 8 }}>
              Documents {docs.length ? `(${docs.length})` : ''}
            </div>
            {loading ? (
              <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Loading…</div>
            ) : docs.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>No documents yet for this brand.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {docs.map(d => (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--border-soft)', borderRadius: 10, background: 'var(--bg-inset)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.title}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>
                        {d.status === 'ready' ? `${d.chunk_count} chunks` : d.status === 'failed' ? (d.error ?? 'failed') : d.status}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                      color: d.status === 'ready' ? ACCENT : d.status === 'failed' ? '#DC2626' : PURPLE,
                      background: d.status === 'ready' ? 'rgba(0,200,83,0.12)' : d.status === 'failed' ? 'rgba(220,38,38,0.12)' : 'rgba(108,63,197,0.12)',
                    }}>{d.status}</span>
                    <button onClick={() => remove(d.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--text-faint)' }}>🗑</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.06em', color: 'var(--text-faint)', marginBottom: 6,
}
const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: 'var(--bg-inset)',
  border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px',
  color: 'var(--text-strong)', fontSize: 13.5, outline: 'none',
}
