'use client'

import { useEffect, useRef, useState } from 'react'

export interface EditableAsset {
  public_url: string
  title?: string
  alt_text?: string
  platform?: string
  campaign_tag?: string
}

type Mode = 'fill' | 'text' | 'object'
const TABS: { id: Mode; label: string; hint: string; mask: boolean; prompt: boolean }[] = [
  { id: 'fill',   label: 'Magic Fill',   hint: 'Brush an area, describe what to put there.', mask: true,  prompt: true  },
  { id: 'text',   label: 'Erase Text',   hint: 'Wipes all text from the image — no brushing needed.', mask: false, prompt: false },
  { id: 'object', label: 'Erase Object', hint: 'Brush over an object to remove it cleanly.', mask: true,  prompt: false },
]

// Interactive image editor: paint a B/W mask over a gallery asset and run a fal
// editing endpoint (FLUX Fill / text-removal / object-removal), then save the
// result back into the gallery (marketing_assets) next to the original.
export default function AssetEditorModal({ asset, onClose, onSaved }: { asset: EditableAsset; onClose: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState<Mode>('fill')
  const [brush, setBrush] = useState(48)
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [hasPaint, setHasPaint] = useState(false)

  const overlayRef = useRef<HTMLCanvasElement | null>(null)   // visible tinted strokes
  const maskRef    = useRef<HTMLCanvasElement | null>(null)    // offscreen black+white mask
  const drawing    = useRef(false)
  const last       = useRef<{ x: number; y: number } | null>(null)
  const dims       = useRef<{ w: number; h: number }>({ w: 0, h: 0 })

  const cfg = TABS.find(t => t.id === mode)!
  const useMask = cfg.mask

  // Initialise canvases to the image's natural dimensions once it loads.
  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    dims.current = { w: img.naturalWidth, h: img.naturalHeight }
    for (const c of [overlayRef.current, maskRef.current]) {
      if (!c) continue
      c.width = img.naturalWidth; c.height = img.naturalHeight
    }
    resetMask()
  }

  const resetMask = () => {
    const o = overlayRef.current, m = maskRef.current
    if (o) o.getContext('2d')!.clearRect(0, 0, o.width, o.height)
    if (m) { const mx = m.getContext('2d')!; mx.fillStyle = '#000'; mx.fillRect(0, 0, m.width, m.height) }
    setHasPaint(false)
  }

  const toNatural = (e: React.PointerEvent) => {
    const c = overlayRef.current!; const r = c.getBoundingClientRect()
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) }
  }
  const stroke = (from: { x: number; y: number } | null, to: { x: number; y: number }) => {
    const o = overlayRef.current?.getContext('2d'), m = maskRef.current?.getContext('2d')
    for (const [ctx, color] of [[o, 'rgba(0,200,83,0.55)'], [m, '#ffffff']] as const) {
      if (!ctx) continue
      ctx.strokeStyle = color; ctx.fillStyle = color
      ctx.lineWidth = brush; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      ctx.beginPath(); ctx.arc(to.x, to.y, brush / 2, 0, Math.PI * 2); ctx.fill()
      if (from) { ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke() }
    }
  }
  const onDown = (e: React.PointerEvent) => { if (!useMask) return; drawing.current = true; const p = toNatural(e); last.current = p; stroke(null, p); setHasPaint(true) }
  const onMove = (e: React.PointerEvent) => { if (!drawing.current || !useMask) return; const p = toNatural(e); stroke(last.current, p); last.current = p }
  const onUp   = () => { drawing.current = false; last.current = null }

  const maskBlob = (): Promise<Blob | null> => new Promise(res => maskRef.current?.toBlob(b => res(b), 'image/png') ?? res(null))

  const apply = async () => {
    setErr(null); setResult(null)
    if (cfg.prompt && !prompt.trim()) { setErr('Describe what to fill in.'); return }
    if (useMask && !hasPaint) { setErr('Brush the area to edit first.'); return }
    setBusy(true)
    try {
      let mask_url: string | undefined
      if (useMask) {
        const blob = await maskBlob()
        if (!blob) { setErr('Could not read the mask'); setBusy(false); return }
        const fd = new FormData(); fd.append('file', new File([blob], 'mask.png', { type: 'image/png' }))
        const up = await fetch('/api/company/marketing/video/upload', { method: 'POST', body: fd })
        const ud = await up.json()
        if (!up.ok || !ud.url) { setErr(ud.error ?? 'Mask upload failed'); setBusy(false); return }
        mask_url = ud.url
      }
      const r = await fetch('/api/company/marketing/edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, image_url: asset.public_url, mask_url, prompt }),
      })
      const d = await r.json()
      if (!r.ok || !d.url) { setErr(d.error ?? 'Edit failed'); return }
      setResult(d.url)
    } catch { setErr('Network error') } finally { setBusy(false) }
  }

  const save = async () => {
    if (!result) return
    setSaving(true); setErr(null)
    try {
      // Inherit the parent's tag + title so the edit sits next to the original.
      const r = await fetch('/api/company/marketing/gallery', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: result, media_type: 'image',
          title: `${asset.title || 'Asset'} (edited)`,
          alt_text: asset.alt_text || 'Edited asset',
          platform: asset.platform || 'Edited',
          campaign_tag: asset.campaign_tag || 'edited',
          dimensions: '', prompt: prompt || `${mode} edit`, cost_usd: 0.05, image_engine: 'fal-edit',
        }),
      })
      if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error ?? 'Save failed'); return }
      onSaved(); onClose()
    } catch { setErr('Network error') } finally { setSaving(false) }
  }

  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', zIndex: 70 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(900px, 94vw)', maxHeight: '90vh', overflowY: 'auto', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-strong)', borderRadius: 16, zIndex: 71, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-strong)' }}>Asset Editor</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'var(--bg-inset)', borderRadius: 6, width: 30, height: 30, cursor: 'pointer', color: 'var(--text-dim)', fontSize: 18 }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)', marginBottom: 12, width: 'fit-content' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => { setMode(t.id); setResult(null); setErr(null) }} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, backgroundColor: mode === t.id ? 'rgba(108,63,197,0.16)' : 'transparent', color: mode === t.id ? '#9B72E8' : 'var(--text-dim)' }}>{t.label}</button>
          ))}
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '0 0 12px' }}>{cfg.hint}</p>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {/* Canvas / image */}
          <div style={{ flex: '1 1 380px', minWidth: 300 }}>
            <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', lineHeight: 0, background: '#0a0a0f' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result ?? asset.public_url} alt="asset" onLoad={result ? undefined : onImgLoad}
                onError={result ? () => setErr('Edited image failed to load (the result URL did not return an image).') : undefined}
                style={{ width: '100%', display: 'block' }} />
              {!result && (
                <canvas ref={overlayRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: useMask ? 'crosshair' : 'default', touchAction: 'none' }} />
              )}
            </div>
            <canvas ref={maskRef} style={{ display: 'none' }} />
            {result && <p style={{ fontSize: 11, color: '#00C853', margin: '8px 0 0', fontWeight: 700 }}>✓ Edit ready — Save to keep it in the gallery.</p>}
          </div>

          {/* Controls */}
          <div style={{ flex: '0 0 240px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {useMask && !result && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Brush size — {brush}px</label>
                <input type="range" min={8} max={160} value={brush} onChange={e => setBrush(Number(e.target.value))} style={{ width: '100%' }} />
                <button onClick={resetMask} style={{ marginTop: 6, width: '100%', padding: '7px 0', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-dim)', fontSize: 12, cursor: 'pointer' }}>Clear mask</button>
              </div>
            )}
            {cfg.prompt && !result && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Fill with…</label>
                <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3} placeholder="e.g. a glowing emerald trophy" style={{ width: '100%', marginTop: 4, padding: 8, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-strong)', fontSize: 13, resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
              </div>
            )}
            {err && <p style={{ fontSize: 11, color: '#DC2626', margin: 0 }}>{err}</p>}

            {!result ? (
              <button onClick={apply} disabled={busy} style={{ width: '100%', padding: '10px 0', borderRadius: 9, border: 'none', background: busy ? 'rgba(108,63,197,0.3)' : 'linear-gradient(135deg, #6C3FC5, #9B72E8)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: busy ? 'default' : 'pointer' }}>
                {busy ? 'Editing…' : `✨ Apply edit — ~$0.05`}
              </button>
            ) : (
              <>
                <button onClick={save} disabled={saving} style={{ width: '100%', padding: '10px 0', borderRadius: 9, border: 'none', background: saving ? 'rgba(0,200,83,0.4)' : 'linear-gradient(135deg, #00A847, #00C853)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: saving ? 'default' : 'pointer' }}>
                  {saving ? 'Saving…' : '✓ Save to gallery'}
                </button>
                <button onClick={() => { setResult(null); setErr(null) }} style={{ width: '100%', padding: '8px 0', borderRadius: 9, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-dim)', fontSize: 12, cursor: 'pointer' }}>↩ Edit again</button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
