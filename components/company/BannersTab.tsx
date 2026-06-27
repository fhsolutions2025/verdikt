'use client'

import { useState } from 'react'

export interface PromoBanner {
  id:         string
  image_url:  string
  headline:   string
  subtext:    string
  cta_label:  string
  cta_href:   string
  sort_order: number
  is_active:  boolean
}

const DEFAULT_PROMPT =
  'Wide premium banner for a prediction-market app, abstract and brandable — flowing ' +
  'emerald-green energy ribbons and soft geometric shapes over a deep charcoal background, ' +
  'a faint upward-trending line motif, generous negative space on the left for a headline. ' +
  'No text, no logos, no real people. Cinematic, modern fintech, high contrast.'

function BannerCard({
  banner, busy, onPatch, onSave, onDelete, onMove, onGenerate,
}: {
  banner:     PromoBanner
  busy:       boolean
  onPatch:    (f: Partial<PromoBanner>) => void
  onSave:     () => void
  onDelete:   () => void
  onMove:     (dir: -1 | 1) => void
  onGenerate: (prompt: string) => void
}) {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)

  const field = (label: string, key: keyof PromoBanner, placeholder = '') => (
    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)' }}>
      {label}
      <input
        value={String(banner[key] ?? '')}
        placeholder={placeholder}
        onChange={e => onPatch({ [key]: e.target.value } as Partial<PromoBanner>)}
        style={{
          display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8,
          border: '1px solid var(--border)', backgroundColor: 'var(--bg-inset)', color: 'var(--text-strong)',
          fontSize: 13, fontFamily: 'inherit',
        }}
      />
    </label>
  )

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 14, padding: 14,
      backgroundColor: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: 10,
      opacity: banner.is_active ? 1 : 0.6,
    }}>
      {/* Preview */}
      <div style={{
        position: 'relative', width: '100%', aspectRatio: '3 / 1', borderRadius: 10, overflow: 'hidden',
        background: banner.image_url ? 'var(--bg-inset)' : 'linear-gradient(120deg, #06281A, #00C853)',
        border: '1px solid var(--border)',
      }}>
        {banner.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={banner.image_url} alt={banner.headline} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(0,0,0,0.55), rgba(0,0,0,0) 75%)' }} />
        <div style={{ position: 'absolute', inset: 0, padding: 12, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
          <p style={{ margin: 0, color: '#fff', fontSize: 15, fontWeight: 800 }}>{banner.headline || 'Headline'}</p>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.85)', fontSize: 10, maxWidth: 200 }}>{banner.subtext}</p>
          {banner.cta_label && (
            <span style={{ marginTop: 2, alignSelf: 'flex-start', padding: '4px 10px', borderRadius: 999, backgroundColor: '#00C853', color: '#04130B', fontSize: 10, fontWeight: 800 }}>
              {banner.cta_label}
            </span>
          )}
        </div>
      </div>

      {/* Image generation */}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Image prompt (abstract, IP-safe)"
          style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'var(--bg-inset)', color: 'var(--text-strong)', fontSize: 12, fontFamily: 'inherit' }}
        />
        <button
          onClick={() => onGenerate(prompt)}
          disabled={busy}
          style={{ fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-inset)', color: 'var(--text-strong)', cursor: busy ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}
        >
          {busy ? '…' : 'Generate'}
        </button>
      </div>

      {/* Text fields */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {field('Headline', 'headline')}
        {field('Subtext', 'subtext')}
        {field('CTA label', 'cta_label', 'Explore markets →')}
        {field('CTA link', 'cta_href', '/player')}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-dim)', cursor: 'pointer' }}>
          <input type="checkbox" checked={banner.is_active} onChange={e => onPatch({ is_active: e.target.checked })} />
          Active
        </label>
        <button onClick={() => onMove(-1)} disabled={busy} title="Move up" style={iconBtn}>↑</button>
        <button onClick={() => onMove(1)} disabled={busy} title="Move down" style={iconBtn}>↓</button>
        <button
          onClick={onSave}
          disabled={busy}
          style={{ fontSize: 12, fontWeight: 700, padding: '7px 16px', borderRadius: 8, border: 'none', backgroundColor: busy ? 'var(--border)' : '#00C853', color: busy ? 'var(--text-faint)' : '#FFFFFF', cursor: busy ? 'wait' : 'pointer' }}
        >
          Save
        </button>
        <button
          onClick={onDelete}
          disabled={busy}
          style={{ fontSize: 12, fontWeight: 700, padding: '7px 12px', borderRadius: 8, border: '1px solid #DC2626', background: 'transparent', color: '#DC2626', cursor: busy ? 'wait' : 'pointer', marginLeft: 'auto' }}
        >
          Delete
        </button>
      </div>
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg-inset)', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14,
}

export function BannersTab({ banners: initial }: { banners: PromoBanner[] }) {
  const [banners, setBanners] = useState<PromoBanner[]>(initial)
  const [busyId, setBusyId]   = useState<string | null>(null)
  const [msg, setMsg]         = useState<string | null>(null)

  const patch = (id: string, f: Partial<PromoBanner>) =>
    setBanners(prev => prev.map(b => b.id === id ? { ...b, ...f } : b))

  const put = async (banner: Partial<PromoBanner>) => {
    const res = await fetch('/api/company/banners', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(banner),
    })
    const d = await res.json()
    if (!res.ok) throw new Error(d.error ?? 'Save failed')
    return d.banner as PromoBanner
  }

  const save = async (banner: PromoBanner) => {
    setBusyId(banner.id); setMsg(null)
    try { await put(banner); setMsg('Saved ✓') }
    catch (e) { setMsg((e as Error).message) }
    finally { setBusyId(null) }
  }

  const addBanner = async () => {
    setBusyId('new'); setMsg(null)
    try {
      const created = await put({ headline: 'New banner', sort_order: banners.length, is_active: true, cta_href: '/player' })
      setBanners(prev => [...prev, created])
    } catch (e) { setMsg((e as Error).message) }
    finally { setBusyId(null) }
  }

  const remove = async (id: string) => {
    setBusyId(id); setMsg(null)
    try {
      const res = await fetch(`/api/company/banners?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setBanners(prev => prev.filter(b => b.id !== id))
    } catch (e) { setMsg((e as Error).message) }
    finally { setBusyId(null) }
  }

  const move = async (id: string, dir: -1 | 1) => {
    const idx = banners.findIndex(b => b.id === id)
    const swapIdx = idx + dir
    if (idx < 0 || swapIdx < 0 || swapIdx >= banners.length) return
    const a = banners[idx], b = banners[swapIdx]
    // Swap sort_order and persist both.
    const aNew = { ...a, sort_order: b.sort_order }
    const bNew = { ...b, sort_order: a.sort_order }
    setBusyId(id); setMsg(null)
    try {
      await Promise.all([put(aNew), put(bNew)])
      setBanners(prev => {
        const next = prev.map(x => x.id === a.id ? aNew : x.id === b.id ? bNew : x)
        return [...next].sort((x, y) => x.sort_order - y.sort_order)
      })
    } catch (e) { setMsg((e as Error).message) }
    finally { setBusyId(null) }
  }

  const generate = async (id: string, prompt: string) => {
    setBusyId(id); setMsg('Generating image…')
    try {
      const res = await fetch('/api/company/banners/image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Generation failed')
      patch(id, { image_url: d.url })
      // Persist the new image immediately.
      const current = banners.find(b => b.id === id)
      if (current) await put({ ...current, image_url: d.url })
      setMsg('Image generated ✓')
    } catch (e) { setMsg((e as Error).message) }
    finally { setBusyId(null) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ color: 'var(--text-strong)', fontSize: 18, fontWeight: 800, margin: 0 }}>Banners</h2>
          <p style={{ color: 'var(--text-faint)', fontSize: 12, margin: '4px 0 0' }}>
            Home carousel slides shown in the player&apos;s Visual theme. Order with ↑/↓, toggle Active, generate art with Ideogram.
          </p>
        </div>
        <button
          onClick={addBanner}
          disabled={busyId !== null}
          style={{ fontSize: 13, fontWeight: 700, padding: '9px 16px', borderRadius: 10, border: 'none', backgroundColor: '#00C853', color: '#FFFFFF', cursor: 'pointer' }}
        >
          + Add banner
        </button>
      </div>

      {msg && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{msg}</span>}

      {banners.length === 0 ? (
        <p style={{ color: 'var(--text-faint)', fontSize: 13, padding: '24px', textAlign: 'center' }}>
          No banners yet. Add one — until then the player home shows the default hero.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
          {banners.map(b => (
            <BannerCard
              key={b.id}
              banner={b}
              busy={busyId === b.id}
              onPatch={f => patch(b.id, f)}
              onSave={() => save(b)}
              onDelete={() => remove(b.id)}
              onMove={dir => move(b.id, dir)}
              onGenerate={prompt => generate(b.id, prompt)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
