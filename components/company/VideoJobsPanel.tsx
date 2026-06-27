'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// A durable video render job (mkt_video_jobs).
interface VideoJob {
  id: string
  model: string
  model_label: string
  request_id: string | null
  status_url: string | null
  response_url: string | null
  prompt: string
  is_draft: boolean
  status: 'pending' | 'processing' | 'completed' | 'failed'
  video_url: string | null
  cost_est: number
  error: string | null
  created_at: string
}

// "Recent renders" — lists durable fal video jobs so a billed clip is never lost.
// Processing jobs are auto-reconciled (the GET video route advances + re-hosts them),
// so even after a reload or navigation the finished video shows up here.
export default function VideoJobsPanel({ refreshKey, onPick }: { refreshKey: number; onPick?: (url: string) => void }) {
  const [jobs, setJobs] = useState<VideoJob[]>([])
  const [open, setOpen] = useState(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/company/marketing/video/jobs')
      if (r.ok) { const d = await r.json(); setJobs(d.jobs ?? []) }
    } catch { /* ignore */ }
  }, [])

  // Advance any still-running jobs, then reload the list.
  const reconcile = useCallback(async (list: VideoJob[]) => {
    const pending = list.filter(j => (j.status === 'processing' || j.status === 'pending') && j.request_id)
    if (!pending.length) return
    await Promise.all(pending.map(j => {
      const q = new URLSearchParams({ request_id: j.request_id!, ...(j.model ? { model: j.model } : {}), ...(j.status_url ? { status_url: j.status_url } : {}), ...(j.response_url ? { response_url: j.response_url } : {}) })
      return fetch(`/api/company/marketing/video?${q}`).catch(() => {})
    }))
    await load()
  }, [load])

  useEffect(() => { load() }, [load, refreshKey])

  // Poll while anything is in flight.
  useEffect(() => {
    const anyRunning = jobs.some(j => j.status === 'processing' || j.status === 'pending')
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (!anyRunning) return
    pollRef.current = setInterval(() => { reconcile(jobs) }, 8000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [jobs, reconcile])

  if (!jobs.length) return null
  const running = jobs.filter(j => j.status === 'processing' || j.status === 'pending').length

  return (
    <div style={{ marginTop: 8, border: '1px solid var(--border-soft)', borderRadius: 14, backgroundColor: 'var(--bg-surface)', overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-strong)' }}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>Recent renders</span>
        {running > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#00C853', backgroundColor: 'rgba(0,200,83,0.12)', padding: '2px 8px', borderRadius: 999 }}>{running} in progress</span>}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, padding: '0 16px 16px' }}>
          {jobs.map(j => (
            <div key={j.id} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', backgroundColor: 'var(--bg-base)' }}>
              {j.status === 'completed' && j.video_url ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video src={j.video_url} controls style={{ width: '100%', display: 'block', background: '#000', aspectRatio: '16/9', objectFit: 'cover' }} />
              ) : (
                <div style={{ aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0f' }}>
                  {j.status === 'failed'
                    ? <span style={{ fontSize: 11, color: '#DC2626', textAlign: 'center', padding: 10 }}>⚠ {j.error?.slice(0, 80) ?? 'failed'}</span>
                    : <span style={{ fontSize: 11, color: 'var(--text-faint)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 22, height: 22, border: '2px solid rgba(0,200,83,0.3)', borderTopColor: '#00C853', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                        generating…
                      </span>}
                </div>
              )}
              <div style={{ padding: '8px 10px' }}>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.prompt || j.model_label}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{j.model_label}{j.is_draft ? ' · draft' : ''} · ~${Number(j.cost_est).toFixed(2)}</span>
                  <span style={{ flex: 1 }} />
                  {j.status === 'completed' && j.video_url && (
                    <a href={j.video_url} download target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: '#9B72E8', textDecoration: 'none' }}>↓</a>
                  )}
                  {j.status === 'completed' && j.video_url && onPick && (
                    <button onClick={() => onPick(j.video_url!)} style={{ fontSize: 10, border: 'none', background: 'transparent', color: '#9B72E8', cursor: 'pointer', fontWeight: 700 }}>Use</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
