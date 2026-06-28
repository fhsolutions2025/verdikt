'use client'

import { useState } from 'react'
import { SPLASH_SLOTS, type SplashSlot } from '@/lib/splashAssets'
import type { ActivePageAsset } from '@/components/company/PageDesignTab'

const IDEOGRAM_COST = 0.08

// Design Splash — generate/approve the public splash page's images. Same engine +
// storage as Page Design (page_assets, page-design generate/save routes), scoped to
// the splash slots. Flow per slot: edit pre-prompt → Generate → preview →
// Save (pushes it live to the splash) / Regenerate.
export function SplashDesignTab({ pageAssets }: { pageAssets: ActivePageAsset[] }) {
  const initial: Record<string, ActivePageAsset> = {}
  for (const a of pageAssets) if (SPLASH_SLOTS.some(s => s.key === a.slot_key)) initial[a.slot_key] = a
  const [assets, setAssets] = useState(initial)

  const filled = Object.keys(assets).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ color: 'var(--text-strong)', fontSize: 18, fontWeight: 800, margin: 0 }}>Design Splash</h2>
          <p style={{ color: 'var(--text-faint)', fontSize: 12, margin: '4px 0 0', maxWidth: 620 }}>
            Generate the public splash / login imagery. Each slot has a pre-written, IP-safe prompt. Edit it,
            Generate, preview, then Save to push it live to the splash. Regenerate until you’re happy.
          </p>
        </div>
        <div style={{ marginLeft: 'auto', padding: '8px 14px', borderRadius: 10, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <p style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Slots live</p>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)', margin: '2px 0 0', fontFamily: 'monospace' }}>{filled} / {SPLASH_SLOTS.length}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
        {SPLASH_SLOTS.map(slot => (
          <SplashSlotCard key={slot.key} slot={slot} active={assets[slot.key] ?? null}
            onSaved={a => setAssets(prev => ({ ...prev, [slot.key]: a }))} />
        ))}
      </div>
    </div>
  )
}

function aspectFromRatio(ratio: string): string {
  const m = ratio.replace('ASPECT_', '').split('_')
  return m.length === 2 ? `${m[0]} / ${m[1]}` : '1 / 1'
}

function SplashSlotCard({ slot, active, onSaved }: {
  slot: SplashSlot
  active: ActivePageAsset | null
  onSaved: (a: ActivePageAsset) => void
}) {
  const [prompt, setPrompt] = useState(active?.prompt ?? slot.prompt)
  const [alt, setAlt]       = useState(active?.alt_text ?? slot.altTemplate)
  const [tags, setTags]     = useState((active?.seo_tags ?? slot.seoTags).join(', '))
  const [genUrl, setGenUrl] = useState<string | null>(null)
  const [genSeed, setGenSeed] = useState<number | undefined>(undefined)
  const [busy, setBusy]     = useState<false | 'gen' | 'save'>(false)
  const [error, setError]   = useState<string | null>(null)
  const [saved, setSaved]   = useState(false)

  const currentUrl = genUrl ?? active?.public_url ?? null

  const generate = async () => {
    setError(null); setSaved(false); setBusy('gen')
    try {
      const res = await fetch('/api/company/page-design/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, style: 'DESIGN', aspect_ratio: slot.ratio }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Generation failed'); return }
      setGenUrl(data.url); setGenSeed(data.seed)
    } catch {
      setError('Network error — check edge function deployment')
    } finally { setBusy(false) }
  }

  const save = async () => {
    if (!genUrl) return
    setError(null); setBusy('save')
    try {
      const res = await fetch('/api/company/page-design/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot_key: slot.key, url: genUrl, prompt, alt_text: alt, seo_tags: tags,
          width: slot.width, height: slot.height, aspect_ratio: slot.ratio,
          seed: genSeed, cost_usd: IDEOGRAM_COST,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Save failed'); return }
      onSaved(data.asset); setGenUrl(null); setSaved(true)
    } catch {
      setError('Network error while saving')
    } finally { setBusy(false) }
  }

  return (
    <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>{slot.label}</span>
        <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'monospace', marginLeft: 'auto' }}>{slot.width}×{slot.height}</span>
      </div>

      {/* Preview */}
      <div style={{ width: '100%', aspectRatio: aspectFromRatio(slot.ratio), borderRadius: 10, overflow: 'hidden', background: 'var(--bg-inset)', border: '1px solid var(--border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {currentUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={currentUrl} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>No image yet</span>}
      </div>
      {active && !genUrl && <span style={{ fontSize: 10, color: '#00C853' }}>● Live on splash</span>}
      {genUrl && <span style={{ fontSize: 10, color: '#E0A020' }}>Preview — Save to push live</span>}

      <label style={lbl}>Prompt</label>
      <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div><label style={lbl}>Alt text (SEO)</label><input value={alt} onChange={e => setAlt(e.target.value)} style={inputStyle} /></div>
        <div><label style={lbl}>SEO tags</label><input value={tags} onChange={e => setTags(e.target.value)} style={inputStyle} /></div>
      </div>

      {error && <p style={{ color: '#DC2626', fontSize: 12, margin: 0 }}>{error}</p>}
      {saved && <p style={{ color: '#00C853', fontSize: 12, margin: 0 }}>Saved — live on the splash.</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={generate} disabled={!!busy} style={{ ...btn, flex: 1, opacity: busy ? 0.6 : 1 }}>
          {busy === 'gen' ? 'Generating…' : genUrl ? 'Regenerate' : 'Generate'}
        </button>
        <button onClick={save} disabled={!genUrl || !!busy} style={{ ...btnPrimary, flex: 1, opacity: (!genUrl || busy) ? 0.5 : 1 }}>
          {busy === 'save' ? 'Saving…' : 'Save → push live'}
        </button>
      </div>
    </div>
  )
}

const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-strong)', fontSize: 12.5, outline: 'none', boxSizing: 'border-box' }
const btn: React.CSSProperties = { padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-strong)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const btnPrimary: React.CSSProperties = { padding: '9px 12px', borderRadius: 9, border: 'none', background: '#00C853', color: '#04130B', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
