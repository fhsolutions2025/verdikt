'use client'

import { useState } from 'react'
import { slotsByGroup, type AssetSlot } from '@/lib/pageAssets'

const IDEOGRAM_COST = 0.08

export interface ActivePageAsset {
  slot_key:     string
  public_url:   string
  alt_text:     string
  seo_tags:     string[]
  width:        number | null
  height:       number | null
  prompt:       string | null
  created_at:   string
}

interface Props {
  pageAssets: ActivePageAsset[]
}

export function PageDesignTab({ pageAssets }: Props) {
  const initial: Record<string, ActivePageAsset> = {}
  for (const a of pageAssets) initial[a.slot_key] = a
  const [assets, setAssets] = useState(initial)

  const groups   = slotsByGroup()
  const filled   = Object.keys(assets).length
  const total    = groups.reduce((s, g) => s + g.slots.length, 0)
  const spendDay = pageAssets.filter(a => {
    const d = new Date(a.created_at); const t = new Date(); t.setHours(0, 0, 0, 0)
    return d >= t
  }).length * IDEOGRAM_COST

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header / status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ color: 'var(--text-strong)', fontSize: 18, fontWeight: 800, margin: 0 }}>Page Design</h2>
          <p style={{ color: 'var(--text-faint)', fontSize: 12, margin: '4px 0 0' }}>
            Generate the Visual theme&apos;s imagery with Ideogram. Each slot has fixed dimensions and a pre-written,
            IP-safe prompt. Generated images are re-hosted in Storage and served to players.
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Stat label="Slots filled" value={`${filled} / ${total}`} />
          <Stat label="Spent today" value={`$${spendDay.toFixed(2)}`} />
        </div>
      </div>

      {groups.map(({ group, slots }) => (
        <div key={group}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px' }}>{group}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
            {slots.map(slot => (
              <SlotCard
                key={slot.key}
                slot={slot}
                active={assets[slot.key] ?? null}
                onSaved={a => setAssets(prev => ({ ...prev, [slot.key]: a }))}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '8px 14px', borderRadius: 10, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      <p style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{label}</p>
      <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)', margin: '2px 0 0', fontFamily: 'monospace' }}>{value}</p>
    </div>
  )
}

function aspectFromRatio(ratio: string): string {
  // 'ASPECT_16_9' → '16 / 9'
  const m = ratio.replace('ASPECT_', '').split('_')
  return m.length === 2 ? `${m[0]} / ${m[1]}` : '1 / 1'
}

function SlotCard({
  slot, active, onSaved,
}: {
  slot: AssetSlot
  active: ActivePageAsset | null
  onSaved: (a: ActivePageAsset) => void
}) {
  const [prompt, setPrompt]   = useState(active?.prompt ?? slot.prompt)
  const [alt, setAlt]         = useState(active?.alt_text ?? slot.altTemplate)
  const [tags, setTags]       = useState((active?.seo_tags ?? slot.seoTags).join(', '))
  const [genUrl, setGenUrl]   = useState<string | null>(null)
  const [genSeed, setGenSeed] = useState<number | undefined>(undefined)
  const [busy, setBusy]       = useState<false | 'gen' | 'save'>(false)
  const [error, setError]     = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const currentUrl = genUrl ?? active?.public_url ?? null

  const generate = async () => {
    setError(null)
    if (!confirming) { setConfirming(true); setTimeout(() => setConfirming(false), 4000); return }
    setConfirming(false)
    setBusy('gen')
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
    } finally {
      setBusy(false)
    }
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
      onSaved(data.asset)
      setGenUrl(null)
    } catch {
      setError('Network error while saving')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Slot header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>{slot.label}</span>
        <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'monospace', marginLeft: 'auto' }}>
          {slot.width}×{slot.height}
        </span>
        {active && !genUrl && (
          <span style={{ fontSize: 10, fontWeight: 700, color: '#00C853', backgroundColor: 'rgba(0,200,83,0.12)', padding: '2px 7px', borderRadius: 999 }}>LIVE</span>
        )}
        {genUrl && (
          <span style={{ fontSize: 10, fontWeight: 700, color: '#9B72E8', backgroundColor: 'rgba(108,63,197,0.15)', padding: '2px 7px', borderRadius: 999 }}>PREVIEW</span>
        )}
      </div>

      {/* Preview / placeholder */}
      <div style={{ aspectRatio: aspectFromRatio(slot.ratio), borderRadius: 10, overflow: 'hidden', backgroundColor: 'var(--bg-inset)', border: '1px dashed var(--border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={currentUrl} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>no image yet</span>
        )}
      </div>

      {/* Editable prompt */}
      <Field label="Prompt (editable — keep generic/abstract)">
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3}
          style={inputStyle} />
      </Field>

      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Alt text" style={{ flex: 1 }}>
          <input value={alt} onChange={e => setAlt(e.target.value)} style={inputStyle} />
        </Field>
      </div>
      <Field label="SEO tags (comma-separated)">
        <input value={tags} onChange={e => setTags(e.target.value)} style={inputStyle} />
      </Field>

      {error && <p style={{ fontSize: 11, color: '#DC2626', margin: 0 }}>{error}</p>}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={generate} disabled={!!busy}
          style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', cursor: busy ? 'default' : 'pointer',
            background: busy === 'gen' ? 'rgba(108,63,197,0.3)' : 'linear-gradient(135deg, #6C3FC5, #9B72E8)', color: '#fff', fontSize: 12, fontWeight: 700 }}>
          {busy === 'gen' ? 'Generating…' : confirming ? `Confirm · $${IDEOGRAM_COST.toFixed(2)}` : genUrl ? 'Regenerate' : `Generate · $${IDEOGRAM_COST.toFixed(2)}`}
        </button>
        <button onClick={save} disabled={!genUrl || !!busy}
          style={{ flex: 1, padding: '9px 0', borderRadius: 9, cursor: (!genUrl || busy) ? 'default' : 'pointer',
            border: `1px solid ${genUrl ? 'rgba(0,200,83,0.5)' : 'var(--border)'}`,
            backgroundColor: genUrl ? 'rgba(0,200,83,0.1)' : 'transparent',
            color: genUrl ? '#00C853' : 'var(--text-faint)', fontSize: 12, fontWeight: 700 }}>
          {busy === 'save' ? 'Saving…' : 'Set as live'}
        </button>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 9px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text-strong)', fontSize: 12, outline: 'none', boxSizing: 'border-box',
  resize: 'vertical', fontFamily: 'inherit',
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}
