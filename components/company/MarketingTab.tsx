'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Segment {
  label:        string
  count:        number
  description:  string
  volume_range: string
  color:        string
}

interface Campaign {
  id:           string
  goal:         string
  segment:      string
  channel:      string
  headline:     string
  body:         string
  cta:          string
  generated_at: string
}

interface PlatformSize {
  id:          string
  label:       string
  aspect:      string
  dims:        string
  aspectRatio: string
}

interface ImageMeta {
  url:          string
  title:        string
  alt_text:     string
  keywords:     string[]
  platform:     PlatformSize
  style:        string
  prompt:       string
  generated_at: string
  seed?:        number
}

interface GalleryAsset {
  id:           string
  public_url:   string
  title:        string
  alt_text:     string
  keywords:     string[]
  platform:     string
  dimensions:   string
  style:        string
  prompt:       string
  campaign_tag: string
  seed:         number | null
  cost_usd:     number
  created_at:   string
}

interface BrandColor { name: string; hex: string }
interface BrandKit {
  colors:          BrandColor[]
  logoDescription: string
  tone:            string
  visualStyle:     string
  autoInject:      boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PLATFORM_SIZES: PlatformSize[] = [
  { id: 'web_banner', label: 'Web Banner',     aspect: 'ASPECT_16_9', dims: '1920×1080', aspectRatio: '16/9' },
  { id: 'youtube',    label: 'YouTube Cover',  aspect: 'ASPECT_16_9', dims: '2560×1440', aspectRatio: '16/9' },
  { id: 'twitter',    label: 'X / Twitter',    aspect: 'ASPECT_16_9', dims: '1500×500',  aspectRatio: '3/1'  },
  { id: 'linkedin',   label: 'LinkedIn',       aspect: 'ASPECT_16_9', dims: '1584×396',  aspectRatio: '4/1'  },
  { id: 'facebook',   label: 'Facebook Cover', aspect: 'ASPECT_16_9', dims: '820×312',   aspectRatio: '16/9' },
  { id: 'instagram',  label: 'Instagram',      aspect: 'ASPECT_1_1',  dims: '1080×1080', aspectRatio: '1/1'  },
  { id: 'story',      label: 'Story / TikTok', aspect: 'ASPECT_9_16', dims: '1080×1920', aspectRatio: '9/16' },
  { id: 'pinterest',  label: 'Pinterest',      aspect: 'ASPECT_2_3',  dims: '1000×1500', aspectRatio: '2/3'  },
]

const IDEOGRAM_COST = 0.08
const STYLES = ['DESIGN', 'REALISTIC', 'RENDER_3D', 'ANIME']
const STYLE_DESC: Record<string, string> = {
  DESIGN:    'Graphic design, illustration, UI',
  REALISTIC: 'Photorealistic photography',
  RENDER_3D: '3D rendered scenes & products',
  ANIME:     'Anime / manga illustration',
}

const VERDIKT_LOGO_PROMPT =
  'Professional logo design for "Verdikt", a sports prediction market platform. ' +
  'Bold modern geometric wordmark with a custom mark fusing a gavel and an upward-trending arrow, ' +
  'deep violet #6C3FC5 to emerald green #00C853 gradient, on a dark charcoal background var(--bg-base). ' +
  'Clean, premium, tech-forward, vector style, centered, high contrast, 8k, award-winning brand identity.'

const DEFAULT_BRAND_KIT: BrandKit = {
  colors: [
    { name: 'Violet',  hex: '#6C3FC5' },
    { name: 'Emerald', hex: '#00C853' },
    { name: 'Ink',     hex: 'var(--bg-base)' },
    { name: 'Ember',   hex: '#E05C20' },
  ],
  logoDescription:
    'The Verdikt wordmark in clean geometric sans-serif with a gavel-meets-upward-arrow mark, ' +
    'rendered in a violet-to-emerald gradient.',
  tone:
    'Energetic, trustworthy, and inclusive. Bold but never reckless. ' +
    'Celebrates pan-African and European sports culture.',
  visualStyle:
    'Dark mode, high contrast, neon violet and emerald accents, glassmorphism, cinematic lighting.',
  autoInject: true,
}

const PRESETS = [
  { label: 'Stadium Hero',  prompt: 'Cinematic wide-angle shot of a packed football stadium at golden hour, crowd erupting in mass celebration, atmospheric lens flare, rich emerald green pitch, vibrant energy and motion blur, ultra-detailed sports photography, 8k, Getty Images editorial style' },
  { label: 'Fintech Night', prompt: 'Aerial drone shot of Lagos skyline at night, glowing data-stream visualizations overlaid in emerald and violet arcs connecting city nodes, futuristic fintech aesthetic, cinematic depth of field, ultra-detailed, 8k, award-winning architectural photography' },
  { label: 'Dashboard 3D',  prompt: 'Ultra-sleek dark-mode prediction market dashboard UI floating in 3D space, live market odds on glassmorphism cards, deep purple-to-green gradient accents, neon data lines, Apple product photography style, studio lighting, crisp and professional' },
  { label: 'Player Win',    prompt: 'Diverse group of young African adults on smartphones celebrating a correct prediction, genuine joy and confetti explosion, vibrant urban backdrop at golden hour, candid documentary photography, warm saturated color grading, Magnum Photos editorial style' },
  { label: 'Sports Energy', prompt: 'Dynamic collage of sports equipment — football, cricket bat, basketball — with electric neon light trails on deep black studio backdrop, product advertising photography, ultra-sharp focus, high contrast, modern sports brand campaign aesthetic' },
  { label: 'Verdikt Logo',  prompt: VERDIKT_LOGO_PROMPT },
]

// ── Utilities ─────────────────────────────────────────────────────────────────

function extractKeywords(prompt: string): string[] {
  const stop = new Set(['a','an','the','and','or','of','on','in','at','with','for','by','to'])
  return prompt.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter(w => w.length > 3 && !stop.has(w)).slice(0, 12)
}

function buildAltText(prompt: string, platform: PlatformSize): string {
  const snippet = prompt.split(',')[0].replace(/\b(ultra|cinematic|8k|hd|professional)\b/gi, '').trim()
  return `${platform.label} marketing creative — ${snippet}`
}

function brandSuffix(bk: BrandKit): string {
  if (!bk.autoInject) return ''
  const colors = bk.colors.map(c => `${c.name} ${c.hex}`).join(', ')
  return `. Brand palette: ${colors}. ${bk.visualStyle}`
}

function loadBrandKit(): BrandKit {
  if (typeof window === 'undefined') return DEFAULT_BRAND_KIT
  try {
    const stored = localStorage.getItem('verdikt_brand_kit')
    if (stored) return { ...DEFAULT_BRAND_KIT, ...JSON.parse(stored) }
  } catch { /* ignore */ }
  return DEFAULT_BRAND_KIT
}

function saveBrandKit(bk: BrandKit) {
  try { localStorage.setItem('verdikt_brand_kit', JSON.stringify(bk)) } catch { /* ignore */ }
}

function buildMeta(data: { url: string; seed?: number }, prompt: string, style: string, platform: PlatformSize): ImageMeta {
  return {
    url:          data.url,
    title:        `${platform.label} — ${prompt.slice(0, 50)}`,
    alt_text:     buildAltText(prompt, platform),
    keywords:     extractKeywords(prompt),
    platform,
    style,
    prompt,
    generated_at: new Date().toISOString(),
    seed:         data.seed,
  }
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconBullhorn() { return (<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 7H6L12 3V15L6 11H2V7Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M6 11V15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M15 6.5C15.8 7.3 15.8 10.7 15 11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>) }
function IconImage()    { return (<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.4"/><circle cx="6.5" cy="6.5" r="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M2 13L6 9L9 12L12 9L16 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>) }
function IconUsers()    { return (<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="7" cy="6" r="3" stroke="currentColor" strokeWidth="1.4"/><path d="M1 16C1 13.2 3.7 11 7 11C10.3 11 13 13.2 13 16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M13 7C14.1 7 15 7.9 15 9C15 10.1 14.1 11 13 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M15 14C16.2 14.5 17 15.7 17 16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>) }
function IconPalette()  { return (<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 16C5 16 2 13 2 9C2 5 5 2 9 2C13 2 16 4.5 16 8C16 10 14.5 11 13 11H11.5C10.5 11 10 11.8 10.5 12.6C10.9 13.2 11 13.6 11 14C11 15.1 10.1 16 9 16Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><circle cx="5.5" cy="8" r="1" fill="currentColor"/><circle cx="9" cy="5.5" r="1" fill="currentColor"/><circle cx="12.5" cy="8" r="1" fill="currentColor"/></svg>) }
function IconFolder()   { return (<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 5C2 4.4 2.4 4 3 4H6.5L8 6H15C15.6 6 16 6.4 16 7V13C16 13.6 15.6 14 15 14H3C2.4 14 2 13.6 2 13V5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>) }

// ── Tab button ─────────────────────────────────────────────────────────────────

function TabBtn({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 10,
      border: `1px solid ${active ? 'rgba(108,63,197,0.5)' : 'var(--border)'}`,
      backgroundColor: active ? 'rgba(108,63,197,0.12)' : 'transparent',
      color: active ? '#9B72E8' : 'var(--text-dim)', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s',
    }}>
      {icon}{label}
    </button>
  )
}

// ── Campaign Generator ────────────────────────────────────────────────────────

const GOALS    = ['Reactivate churned players', 'Onboard new players', 'Boost volume', 'Promote new markets', 'VIP retention', 'Referral drive']
const SEGMENTS = ['All Players', 'Whale tier (≥1000¢)', 'Active tier (≥100¢)', 'Casual tier (<100¢)', 'Inactive 7d+']
const CHANNELS = ['In-App Notification', 'Email', 'SMS', 'Social Media', 'Push Notification']

function CampaignGenerator({ segments }: { segments: Segment[] }) {
  const [goal, setGoal]       = useState(GOALS[0])
  const [segment, setSegment] = useState(SEGMENTS[0])
  const [channel, setChannel] = useState(CHANNELS[0])
  const [extra, setExtra]     = useState('')
  const [loading, setLoading] = useState(false)
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [history, setHistory] = useState<Campaign[]>([])
  const [copied, setCopied]   = useState(false)

  const generate = async () => {
    setLoading(true); setCampaign(null)
    try {
      const res = await fetch('/api/company/marketing/campaign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, segment, channel, extra }),
      })
      if (res.ok) {
        const data = await res.json()
        const c = { ...data.campaign, id: crypto.randomUUID(), generated_at: new Date().toISOString() }
        setCampaign(c); setHistory(h => [c, ...h].slice(0, 10))
      }
    } finally { setLoading(false) }
  }

  const copyAll = () => {
    if (!campaign) return
    navigator.clipboard.writeText(`Headline: ${campaign.headline}\n\n${campaign.body}\n\nCTA: ${campaign.cta}`)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ flex: '0 0 280px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h3 style={{ color: 'var(--text-strong)', fontSize: 14, fontWeight: 700, margin: 0 }}>Campaign Brief</h3>
        {[
          { label: 'Goal', value: goal, onChange: setGoal, options: GOALS },
          { label: 'Audience Segment', value: segment, onChange: setSegment, options: SEGMENTS },
          { label: 'Channel', value: channel, onChange: setChannel, options: CHANNELS },
        ].map(f => (
          <div key={f.label}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{f.label}</label>
            <select value={f.value} onChange={e => f.onChange(e.target.value)} style={{ width: '100%', padding: '8px 10px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-strong)', fontSize: 13, cursor: 'pointer', outline: 'none' }}>
              {f.options.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
        ))}
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Extra context (optional)</label>
          <textarea value={extra} onChange={e => setExtra(e.target.value)} placeholder="e.g. World Cup markets now live, 50% bonus this weekend…" rows={3} style={{ width: '100%', padding: '8px 10px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-strong)', fontSize: 12, resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        </div>
        <button onClick={generate} disabled={loading} style={{ padding: '10px 0', borderRadius: 10, background: loading ? 'rgba(108,63,197,0.3)' : 'linear-gradient(135deg, #6C3FC5, #9B72E8)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: loading ? 'default' : 'pointer' }}>
          {loading ? 'Generating…' : '✦ Generate Campaign'}
        </button>
        {segments.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 12 }}>
            <p style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Audience sizes</p>
            {segments.map(s => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{s.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: s.color }}>{s.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 300, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {campaign ? (
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid rgba(108,63,197,0.3)', borderRadius: 16, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, backgroundColor: 'rgba(108,63,197,0.2)', color: '#9B72E8', marginRight: 8 }}>{channel}</span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, backgroundColor: 'var(--border-soft)', color: 'var(--text-dim)' }}>{segment}</span>
              </div>
              <button onClick={copyAll} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-strong)', backgroundColor: copied ? 'rgba(0,200,83,0.1)' : 'transparent', color: copied ? '#00C853' : 'var(--text-dim)', fontSize: 11, cursor: 'pointer' }}>{copied ? '✓ Copied' : 'Copy all'}</button>
            </div>
            <h2 style={{ color: 'var(--text-strong)', fontSize: 20, fontWeight: 800, margin: '0 0 12px', lineHeight: 1.3 }}>{campaign.headline}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6, margin: '0 0 16px', whiteSpace: 'pre-wrap' }}>{campaign.body}</p>
            <div style={{ display: 'inline-block', padding: '10px 20px', borderRadius: 10, background: 'linear-gradient(135deg, #6C3FC5, #9B72E8)', color: '#fff', fontSize: 13, fontWeight: 700 }}>{campaign.cta}</div>
          </div>
        ) : (
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px dashed var(--border)', borderRadius: 16, padding: '60px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <span style={{ color: 'var(--text-faintest)', fontSize: 32 }}>✦</span>
            <p style={{ color: 'var(--text-faint)', fontSize: 14, textAlign: 'center', margin: 0 }}>Fill in the brief and click Generate Campaign to create AI-powered copy.</p>
          </div>
        )}
        {history.length > 1 && (
          <div>
            <p style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Recent ({history.length - 1} more)</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {history.slice(1, 4).map(c => (
                <button key={c.id} onClick={() => setCampaign(c)} style={{ padding: '10px 14px', borderRadius: 10, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-soft)', textAlign: 'left', cursor: 'pointer' }}>
                  <p style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600, margin: 0 }}>{c.headline}</p>
                  <p style={{ color: 'var(--text-faint)', fontSize: 11, margin: '3px 0 0' }}>{c.goal} · {c.segment}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Image result card (shared by media studio grids) ───────────────────────────

function ImageCard({
  meta, campaignTag, onSaved,
}: {
  meta: ImageMeta; campaignTag: string; onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/company/marketing/gallery', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: meta.url, title: meta.title, alt_text: meta.alt_text, keywords: meta.keywords,
          platform: meta.platform.label, dimensions: meta.platform.dims, aspect_ratio: meta.platform.aspect,
          style: meta.style, prompt: meta.prompt, campaign_tag: campaignTag, seed: meta.seed, cost_usd: IDEOGRAM_COST,
        }),
      })
      if (res.ok) { setSaved(true); onSaved() }
    } finally { setSaving(false) }
  }

  const download = () => {
    const a = document.createElement('a')
    a.href = meta.url; a.download = `verdikt-${meta.platform.id}-${Date.now()}.jpg`; a.target = '_blank'; a.click()
  }

  return (
    <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(108,63,197,0.25)' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={meta.url} alt={meta.alt_text} title={meta.title} loading="lazy" style={{ width: '100%', display: 'block' }} />
      <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#9B72E8', backgroundColor: 'rgba(108,63,197,0.15)', padding: '2px 8px', borderRadius: 999, flex: 1 }}>
          {meta.platform.label} · {meta.platform.dims}
        </span>
        <button onClick={save} disabled={saving || saved} style={{ padding: '5px 10px', borderRadius: 7, border: `1px solid ${saved ? 'rgba(0,200,83,0.4)' : 'var(--border-strong)'}`, backgroundColor: saved ? 'rgba(0,200,83,0.1)' : 'transparent', color: saved ? '#00C853' : 'var(--text-muted)', fontSize: 11, fontWeight: 600, cursor: saved ? 'default' : 'pointer' }}>
          {saved ? '✓ Saved' : saving ? '…' : '+ Save'}
        </button>
        <button onClick={download} style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(108,63,197,0.3)', backgroundColor: 'rgba(108,63,197,0.1)', color: '#9B72E8', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>↓</button>
      </div>
    </div>
  )
}

// ── Media Studio ──────────────────────────────────────────────────────────────

type GenMode = 'single' | 'batch' | 'all'

function MediaStudio({ brandKit, onGallerySaved }: { brandKit: BrandKit; onGallerySaved: () => void }) {
  const [prompt, setPrompt]       = useState('')
  const [enhanced, setEnhanced]   = useState<string | null>(null)
  const [enhancing, setEnhancing] = useState(false)
  const [style, setStyle]         = useState('DESIGN')
  const [imageProvider, setImageProvider] = useState<'ideogram' | 'openai'>('ideogram')
  const [platform, setPlatform]   = useState<PlatformSize>(PLATFORM_SIZES[0])
  const [mode, setMode]           = useState<GenMode>('single')
  const [campaignTag, setCampaignTag] = useState('')
  const [loading, setLoading]     = useState(false)
  const [progress, setProgress]   = useState(0)
  const [batchDone, setBatchDone] = useState(0)
  const [batchTotal, setBatchTotal] = useState(0)
  const [results, setResults]     = useState<ImageMeta[]>([])
  const [error, setError]         = useState<string | null>(null)
  const progressRef               = useRef<ReturnType<typeof setInterval> | null>(null)

  // Staged progress bar (single mode only)
  useEffect(() => {
    if (!loading || mode !== 'single') { if (progressRef.current) clearInterval(progressRef.current); return }
    setProgress(4)
    const milestones = [10, 22, 38, 55, 70, 82, 89, 93]; let i = 0
    progressRef.current = setInterval(() => {
      if (i < milestones.length) setProgress(milestones[i++]); else clearInterval(progressRef.current!)
    }, 2200)
    return () => { if (progressRef.current) clearInterval(progressRef.current) }
  }, [loading, mode])

  const effectivePrompt = (enhanced ?? prompt) + brandSuffix(brandKit)
  const basePrompt      = enhanced ?? prompt

  const generateOne = async (p: PlatformSize): Promise<ImageMeta | null> => {
    try {
      const res  = await fetch('/api/company/marketing/media', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: effectivePrompt, style, aspect_ratio: p.aspect, provider: imageProvider }),
      })
      const data = await res.json()
      if (res.ok && data.url) return buildMeta(data, basePrompt, style, p)
      if (!res.ok) setError(data.error ?? 'Image generation failed')
      return null
    } catch { setError('Network error — check edge function deployment'); return null }
  }

  const run = async () => {
    if (!basePrompt.trim()) return
    setLoading(true); setError(null); setResults([]); setProgress(0)

    if (mode === 'single') {
      const meta = await generateOne(platform)
      if (meta) { setProgress(100); setResults([meta]) }
      setLoading(false)
      return
    }

    // Parallel modes
    const targets = mode === 'batch'
      ? Array.from({ length: 4 }, () => platform)
      : PLATFORM_SIZES
    setBatchTotal(targets.length); setBatchDone(0)

    await Promise.all(targets.map(t =>
      generateOne(t).then(meta => {
        setBatchDone(d => d + 1)
        if (meta) setResults(prev => [...prev, meta])
      })
    ))
    setLoading(false)
  }

  const generateInSize = async (p: PlatformSize) => {
    setLoading(true); setError(null); setResults([]); setMode('single'); setPlatform(p); setProgress(0)
    const meta = await generateOne(p)
    if (meta) { setProgress(100); setResults([meta]) }
    setLoading(false)
  }

  const enhancePrompt = async () => {
    if (!prompt.trim()) return
    setEnhancing(true)
    try {
      const res = await fetch('/api/company/marketing/enhance-prompt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, platform: platform.label, style }),
      })
      if (res.ok) { const data = await res.json(); setEnhanced(data.enhanced) }
    } finally { setEnhancing(false) }
  }

  const perImageCost = imageProvider === 'openai' ? 0.04 : IDEOGRAM_COST
  const costFor = (m: GenMode) => m === 'single' ? perImageCost : m === 'batch' ? perImageCost * 4 : perImageCost * 8
  const single  = results.length === 1 && mode === 'single'

  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>

      {/* ── Left panel ─────────────────────────────────────────────────────── */}
      <div style={{ flex: '0 0 300px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Brand kit status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, backgroundColor: brandKit.autoInject ? 'rgba(0,200,83,0.07)' : 'var(--fill-subtle)', border: `1px solid ${brandKit.autoInject ? 'rgba(0,200,83,0.2)' : 'var(--border-soft)'}` }}>
          <span style={{ color: brandKit.autoInject ? '#00C853' : 'var(--text-dim)' }}><IconPalette /></span>
          <span style={{ fontSize: 11, color: brandKit.autoInject ? '#00C853' : 'var(--text-dim)', flex: 1 }}>
            {brandKit.autoInject ? 'Brand kit auto-applied' : 'Brand kit off'}
          </span>
          <div style={{ display: 'flex', gap: 3 }}>
            {brandKit.colors.map(c => <span key={c.hex} style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: c.hex, border: '1px solid var(--border-strong)' }} />)}
          </div>
        </div>

        {/* Generation mode */}
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Mode</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {([
              { id: 'single', label: 'Single image',   sub: '1 image · $0.08' },
              { id: 'batch',  label: '4 variants',      sub: 'pick the best · $0.32' },
              { id: 'all',    label: 'All 8 platforms', sub: 'full asset pack · $0.64' },
            ] as { id: GenMode; label: string; sub: string }[]).map(m => (
              <button key={m.id} onClick={() => setMode(m.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${mode === m.id ? 'rgba(108,63,197,0.5)' : 'var(--border-soft)'}`, backgroundColor: mode === m.id ? 'rgba(108,63,197,0.12)' : 'transparent' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: mode === m.id ? '#9B72E8' : 'var(--text-muted)' }}>{m.label}</span>
                <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{m.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Platform (hidden in all-mode) */}
        {mode !== 'all' && (
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Platform & Size</label>
            <select value={platform.id} onChange={e => setPlatform(PLATFORM_SIZES.find(p => p.id === e.target.value)!)} style={{ width: '100%', padding: '8px 10px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-strong)', fontSize: 13, cursor: 'pointer', outline: 'none' }}>
              {PLATFORM_SIZES.map(p => <option key={p.id} value={p.id}>{p.label} — {p.dims}</option>)}
            </select>
          </div>
        )}

        {/* Image engine */}
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Image Engine</label>
          <div style={{ display: 'flex', gap: 5 }}>
            {([
              { id: 'ideogram', label: 'Ideogram V_2', sub: '$0.08' },
              { id: 'openai',   label: 'GPT Image',    sub: '$0.04' },
            ] as { id: 'ideogram' | 'openai'; label: string; sub: string }[]).map(p => (
              <button key={p.id} onClick={() => setImageProvider(p.id)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '7px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${imageProvider === p.id ? 'rgba(108,63,197,0.5)' : 'var(--border-soft)'}`, backgroundColor: imageProvider === p.id ? 'rgba(108,63,197,0.12)' : 'transparent' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: imageProvider === p.id ? '#9B72E8' : 'var(--text-muted)' }}>{p.label}</span>
                <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{p.sub}/image</span>
              </button>
            ))}
          </div>
          {imageProvider === 'openai' && (
            <p style={{ fontSize: 10, color: 'var(--text-faintest)', margin: '6px 0 0' }}>OpenAI gpt-image-1 via openai-image-proxy. Style presets apply to Ideogram only.</p>
          )}
        </div>

        {/* Style */}
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Visual Style</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {STYLES.map(s => (
              <button key={s} onClick={() => setStyle(s)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', borderRadius: 8, border: `1px solid ${style === s ? 'rgba(108,63,197,0.5)' : 'var(--border-soft)'}`, backgroundColor: style === s ? 'rgba(108,63,197,0.12)' : 'transparent', cursor: 'pointer' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: style === s ? '#9B72E8' : 'var(--text-dim)' }}>{s}</span>
                <span style={{ fontSize: 10, color: 'var(--text-faintest)' }}>{STYLE_DESC[s]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Prompt */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Prompt</label>
            {enhanced && <button onClick={() => setEnhanced(null)} style={{ fontSize: 10, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>✕ Clear enhanced</button>}
          </div>
          <textarea value={prompt} onChange={e => { setPrompt(e.target.value); setEnhanced(null) }} placeholder="Describe your creative in a few words…" rows={4} style={{ width: '100%', padding: '10px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-strong)', fontSize: 12, resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          <button onClick={enhancePrompt} disabled={!prompt.trim() || enhancing} style={{ marginTop: 6, width: '100%', padding: '7px 0', borderRadius: 8, border: '1px solid rgba(108,63,197,0.35)', backgroundColor: 'rgba(108,63,197,0.08)', color: enhancing ? 'var(--text-faint)' : '#9B72E8', fontSize: 12, fontWeight: 600, cursor: (!prompt.trim() || enhancing) ? 'default' : 'pointer' }}>
            {enhancing ? '✦ Enhancing…' : '✨ Enhance with AI'}
          </button>
          {enhanced && (
            <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, backgroundColor: 'rgba(0,200,83,0.06)', border: '1px solid rgba(0,200,83,0.2)' }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#00C853', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>✓ Enhanced prompt</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>{enhanced}</p>
            </div>
          )}
        </div>

        {/* Campaign tag */}
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Campaign tag (for gallery)</label>
          <input value={campaignTag} onChange={e => setCampaignTag(e.target.value)} placeholder="e.g. world-cup-2026" style={{ width: '100%', padding: '8px 10px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-strong)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
        </div>

        {/* Presets */}
        <div>
          <p style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Preset ideas</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => { setPrompt(p.prompt); setEnhanced(null) }} style={{ padding: '7px 10px', borderRadius: 8, backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-soft)', color: 'var(--text-dim)', fontSize: 11, textAlign: 'left', cursor: 'pointer' }}>
                <span style={{ color: '#9B72E8', fontWeight: 700, marginRight: 6 }}>{p.label}</span>{p.prompt.slice(0, 40)}…
              </button>
            ))}
          </div>
        </div>

        <button onClick={run} disabled={loading || !basePrompt.trim()} style={{ padding: '11px 0', borderRadius: 10, background: (loading || !basePrompt.trim()) ? 'rgba(108,63,197,0.3)' : 'linear-gradient(135deg, #6C3FC5, #9B72E8)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: (loading || !basePrompt.trim()) ? 'default' : 'pointer' }}>
          {loading ? 'Generating…' : `⚡ Generate — $${costFor(mode).toFixed(2)}`}
        </button>
      </div>

      {/* ── Right panel ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Loading */}
        {loading && mode === 'single' && (
          <div style={{ position: 'relative', backgroundColor: 'var(--bg-surface)', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(108,63,197,0.3)', aspectRatio: platform.aspectRatio }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, var(--bg-surface) 0%, var(--bg-inset) 50%, var(--bg-surface) 100%)', backgroundSize: '200% 100%', animation: 'shimmer 1.6s ease-in-out infinite' }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 20px 20px' }}>
              <div style={{ backgroundColor: 'var(--border-soft)', borderRadius: 999, height: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, #6C3FC5, #9B72E8)', width: `${progress}%`, transition: 'width 0.8s ease-out' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Ideogram V_2 generating…</span>
                <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: '#9B72E8' }}>{progress}%</span>
              </div>
            </div>
          </div>
        )}

        {loading && mode !== 'single' && (
          <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: 16, border: '1px solid rgba(108,63,197,0.3)', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Generating {mode === 'batch' ? '4 variants' : 'full asset pack'}…</span>
              <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: '#9B72E8' }}>{batchDone} / {batchTotal}</span>
            </div>
            <div style={{ backgroundColor: 'var(--border-soft)', borderRadius: 999, height: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, #6C3FC5, #9B72E8)', width: `${batchTotal ? (batchDone / batchTotal) * 100 : 0}%`, transition: 'width 0.5s ease-out' }} />
            </div>
            {/* live grid of completed */}
            {results.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: mode === 'batch' ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginTop: 16 }}>
                {results.map((m, i) => <ImageCard key={i} meta={m} campaignTag={campaignTag} onSaved={onGallerySaved} />)}
              </div>
            )}
          </div>
        )}

        {/* Single result */}
        {!loading && single && (
          <>
            <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(108,63,197,0.3)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={results[0].url} alt={results[0].alt_text} title={results[0].title} loading="lazy" style={{ width: '100%', display: 'block' }} />
              <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border-soft)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#9B72E8', backgroundColor: 'rgba(108,63,197,0.15)', padding: '3px 10px', borderRadius: 999, border: '1px solid rgba(108,63,197,0.3)' }}>{results[0].platform.label} · {results[0].platform.dims}</span>
                <span style={{ fontSize: 11, color: 'var(--text-faint)', flex: 1 }}>{results[0].style}</span>
                <SaveAndDownload meta={results[0]} campaignTag={campaignTag} onSaved={onGallerySaved} />
              </div>
            </div>

            {/* SEO metadata */}
            <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 12px' }}>SEO Metadata</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { key: 'Alt Text', val: results[0].alt_text },
                  { key: 'Title', val: results[0].title },
                  { key: 'Dimensions', val: results[0].platform.dims },
                  { key: 'Cost', val: `$${IDEOGRAM_COST.toFixed(2)} USD` },
                  { key: 'Model', val: 'Ideogram V_2' },
                ].map(r => (
                  <div key={r.key} style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                    <span style={{ color: 'var(--text-faint)', width: 90, flexShrink: 0 }}>{r.key}</span>
                    <span style={{ color: 'var(--text-muted)', flex: 1 }}>{r.val}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                  <span style={{ color: 'var(--text-faint)', width: 90, flexShrink: 0 }}>Keywords</span>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
                    {results[0].keywords.map(k => <span key={k} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, backgroundColor: 'var(--fill-soft)', color: 'var(--text-dim)', border: '1px solid var(--border-soft)' }}>{k}</span>)}
                  </div>
                </div>
              </div>
            </div>

            {/* Resize */}
            <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 12px' }}>Generate in another size — +${IDEOGRAM_COST.toFixed(2)} each</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {PLATFORM_SIZES.filter(p => p.id !== results[0].platform.id).map(p => (
                  <button key={p.id} onClick={() => generateInSize(p)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-strong)', backgroundColor: 'var(--fill-subtle)', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>
                    {p.label}<span style={{ color: 'var(--text-faintest)', marginLeft: 5, fontSize: 10 }}>{p.dims}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Multi result grid */}
        {!loading && results.length > 0 && !single && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                {mode === 'batch' ? `${results.length} variants — pick your favourites to save` : `Asset pack — ${results.length} platform sizes`}
              </p>
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Total ${(results.length * IDEOGRAM_COST).toFixed(2)}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: mode === 'batch' ? 'repeat(auto-fill, minmax(240px, 1fr))' : 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {results.map((m, i) => <ImageCard key={i} meta={m} campaignTag={campaignTag} onSaved={onGallerySaved} />)}
            </div>
          </div>
        )}

        {/* Error */}
        {!loading && error && results.length === 0 && (
          <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: 16, padding: '40px', border: '1px solid rgba(220,38,38,0.3)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 24 }}>⚠</span>
            <p style={{ color: '#DC2626', fontSize: 14, textAlign: 'center', margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Empty */}
        {!loading && results.length === 0 && !error && (
          <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: 16, border: '1px dashed var(--border)', aspectRatio: mode === 'all' ? '16/9' : platform.aspectRatio, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
            <div style={{ textAlign: 'center', padding: 20 }}>
              <div style={{ fontSize: 40, color: 'var(--bg-inset)', marginBottom: 10 }}>🎨</div>
              <p style={{ color: 'var(--text-faint)', fontSize: 13, margin: 0 }}>Generated creative will appear here.<br />Powered by Ideogram V_2 · ${IDEOGRAM_COST.toFixed(2)}/image</p>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }`}</style>
    </div>
  )
}

// Save + Download with metadata sidecar (single view)
function SaveAndDownload({ meta, campaignTag, onSaved }: { meta: ImageMeta; campaignTag: string; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/company/marketing/gallery', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: meta.url, title: meta.title, alt_text: meta.alt_text, keywords: meta.keywords,
          platform: meta.platform.label, dimensions: meta.platform.dims, aspect_ratio: meta.platform.aspect,
          style: meta.style, prompt: meta.prompt, campaign_tag: campaignTag, seed: meta.seed, cost_usd: IDEOGRAM_COST,
        }),
      })
      if (res.ok) { setSaved(true); onSaved() }
    } finally { setSaving(false) }
  }

  const downloadWithMeta = () => {
    const a = document.createElement('a'); a.href = meta.url; a.download = `verdikt-${meta.platform.id}-${Date.now()}.jpg`; a.target = '_blank'; a.click()
    const sidecar = {
      title: meta.title, alt_text: meta.alt_text, keywords: meta.keywords, platform: meta.platform.label,
      dimensions: meta.platform.dims, aspect_ratio: meta.platform.aspect, style: meta.style, prompt: meta.prompt,
      campaign_tag: campaignTag, generated_at: meta.generated_at, seed: meta.seed, cost_usd: IDEOGRAM_COST, generator: 'Ideogram V_2',
    }
    const blob = new Blob([JSON.stringify(sidecar, null, 2)], { type: 'application/json' })
    const b = document.createElement('a'); b.href = URL.createObjectURL(blob); b.download = `verdikt-${meta.platform.id}-${Date.now()}-meta.json`; b.click()
  }

  return (
    <>
      <button onClick={save} disabled={saving || saved} style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${saved ? 'rgba(0,200,83,0.4)' : 'var(--border-strong)'}`, backgroundColor: saved ? 'rgba(0,200,83,0.1)' : 'transparent', color: saved ? '#00C853' : 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: saved ? 'default' : 'pointer' }}>
        {saved ? '✓ In gallery' : saving ? 'Saving…' : '+ Save to gallery'}
      </button>
      <button onClick={downloadWithMeta} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(108,63,197,0.3)', backgroundColor: 'rgba(108,63,197,0.1)', color: '#9B72E8', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>↓ Download + Meta</button>
    </>
  )
}

// ── Brand Kit ─────────────────────────────────────────────────────────────────

function BrandKitSection({ brandKit, setBrandKit }: { brandKit: BrandKit; setBrandKit: (bk: BrandKit) => void }) {
  const [copied, setCopied] = useState(false)
  const update = (patch: Partial<BrandKit>) => setBrandKit({ ...brandKit, ...patch })
  const updateColor = (idx: number, patch: Partial<BrandColor>) => {
    const colors = brandKit.colors.map((c, i) => i === idx ? { ...c, ...patch } : c)
    update({ colors })
  }

  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Auto-inject toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderRadius: 14, backgroundColor: 'var(--bg-surface)', border: `1px solid ${brandKit.autoInject ? 'rgba(0,200,83,0.3)' : 'var(--border)'}` }}>
          <div>
            <p style={{ color: 'var(--text-strong)', fontSize: 14, fontWeight: 700, margin: 0 }}>Auto-inject into every image prompt</p>
            <p style={{ color: 'var(--text-dim)', fontSize: 12, margin: '3px 0 0' }}>Appends brand palette & visual style to all Media Studio generations.</p>
          </div>
          <button onClick={() => update({ autoInject: !brandKit.autoInject })} style={{ position: 'relative', width: 46, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', backgroundColor: brandKit.autoInject ? '#00C853' : 'var(--text-faintest)', transition: 'background 0.15s', flexShrink: 0 }}>
            <span style={{ position: 'absolute', top: 3, left: brandKit.autoInject ? 23 : 3, width: 20, height: 20, borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.15s' }} />
          </button>
        </div>

        {/* Colors */}
        <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 14px' }}>Brand Colors</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {brandKit.colors.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-soft)' }}>
                <input type="color" value={c.hex} onChange={e => updateColor(i, { hex: e.target.value })} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: 'transparent', padding: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <input value={c.name} onChange={e => updateColor(i, { name: e.target.value })} style={{ width: '100%', background: 'none', border: 'none', color: 'var(--text-strong)', fontSize: 13, fontWeight: 600, outline: 'none', padding: 0 }} />
                  <input value={c.hex} onChange={e => updateColor(i, { hex: e.target.value })} style={{ width: '100%', background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 11, fontFamily: 'monospace', outline: 'none', padding: 0 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tone & style */}
        {[
          { label: 'Brand Voice / Tone', key: 'tone' as const, value: brandKit.tone },
          { label: 'Visual Style (injected into image prompts)', key: 'visualStyle' as const, value: brandKit.visualStyle },
          { label: 'Logo Description', key: 'logoDescription' as const, value: brandKit.logoDescription },
        ].map(f => (
          <div key={f.key} style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 10px' }}>{f.label}</p>
            <textarea value={f.value} onChange={e => update({ [f.key]: e.target.value })} rows={2} style={{ width: '100%', padding: '10px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-strong)', fontSize: 13, resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: 1.5 }} />
          </div>
        ))}
      </div>

      {/* Logo prompt card */}
      <div style={{ flex: '0 0 320px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid rgba(108,63,197,0.3)', borderRadius: 14, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ color: '#9B72E8' }}><IconPalette /></span>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>Verdikt Logo Prompt</p>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 14px' }}>{VERDIKT_LOGO_PROMPT}</p>
          <button onClick={() => { navigator.clipboard.writeText(VERDIKT_LOGO_PROMPT); setCopied(true); setTimeout(() => setCopied(false), 2000) }} style={{ width: '100%', padding: '9px 0', borderRadius: 9, border: '1px solid rgba(108,63,197,0.4)', backgroundColor: copied ? 'rgba(0,200,83,0.1)' : 'rgba(108,63,197,0.12)', color: copied ? '#00C853' : '#9B72E8', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            {copied ? '✓ Copied — paste in Media Studio' : 'Copy logo prompt'}
          </button>
          <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '10px 0 0', textAlign: 'center' }}>Or pick the “Verdikt Logo” preset in Media Studio.</p>
        </div>

        {/* Live preview swatch */}
        <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 12px' }}>Palette Preview</p>
          <div style={{ display: 'flex', height: 48, borderRadius: 10, overflow: 'hidden' }}>
            {brandKit.colors.map(c => <div key={c.hex} style={{ flex: 1, backgroundColor: c.hex }} title={`${c.name} ${c.hex}`} />)}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {brandKit.colors.map(c => <span key={c.hex} style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-dim)' }}>{c.hex}</span>)}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Persistent Gallery ────────────────────────────────────────────────────────

function GallerySection({ refreshKey }: { refreshKey: number }) {
  const [assets, setAssets]   = useState<GalleryAsset[]>([])
  const [tags, setTags]       = useState<string[]>([])
  const [search, setSearch]   = useState('')
  const [activeTag, setActiveTag] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<GalleryAsset | null>(null)
  const [totalSpend, setTotalSpend] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (activeTag) params.set('tag', activeTag)
      const res = await fetch(`/api/company/marketing/gallery?${params}`)
      if (res.ok) {
        const data = await res.json()
        setAssets(data.assets ?? []); setTags(data.tags ?? [])
        setTotalSpend(data.totalSpend ?? 0); setTotalCount(data.totalCount ?? 0)
      }
    } finally { setLoading(false) }
  }, [search, activeTag])

  useEffect(() => { load() }, [load, refreshKey])

  const remove = async (id: string) => {
    await fetch(`/api/company/marketing/gallery/${id}`, { method: 'DELETE' })
    setSelected(null); load()
  }

  const avgCost = totalCount > 0 ? totalSpend / totalCount : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Running spend counter */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        {[
          { label: 'Total Ideogram spend', value: `$${totalSpend.toFixed(2)}`, color: '#9B72E8', sub: 'lifetime, all saved assets' },
          { label: 'Images generated',     value: String(totalCount),          color: '#00C853', sub: 'saved to gallery' },
          { label: 'Avg cost / image',     value: `$${avgCost.toFixed(3)}`,    color: '#E05C20', sub: 'Ideogram V_2' },
          { label: 'Showing',              value: String(assets.length),       color: 'var(--text-muted)', sub: search || activeTag ? 'filtered' : 'all' },
        ].map(s => (
          <div key={s.label} style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px' }}>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'monospace', color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{s.label}</div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 1 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by title, prompt, alt text…" style={{ flex: 1, minWidth: 200, padding: '9px 14px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text-strong)', fontSize: 13, outline: 'none' }} />
        <button onClick={load} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border-strong)', backgroundColor: 'transparent', color: 'var(--text-dim)', fontSize: 12, cursor: 'pointer' }}>↺ Refresh</button>
      </div>

      {/* Tag chips */}
      {tags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={() => setActiveTag('')} style={{ padding: '4px 12px', borderRadius: 999, border: `1px solid ${!activeTag ? 'rgba(108,63,197,0.5)' : 'var(--border)'}`, backgroundColor: !activeTag ? 'rgba(108,63,197,0.15)' : 'transparent', color: !activeTag ? '#9B72E8' : 'var(--text-dim)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>All</button>
          {tags.map(t => (
            <button key={t} onClick={() => setActiveTag(t)} style={{ padding: '4px 12px', borderRadius: 999, border: `1px solid ${activeTag === t ? 'rgba(108,63,197,0.5)' : 'var(--border)'}`, backgroundColor: activeTag === t ? 'rgba(108,63,197,0.15)' : 'transparent', color: activeTag === t ? '#9B72E8' : 'var(--text-dim)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{t}</button>
          ))}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 14 }}>Loading gallery…</div>
      ) : assets.length === 0 ? (
        <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px dashed var(--border)', borderRadius: 16, padding: '60px 40px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, color: 'var(--bg-inset)', marginBottom: 10 }}>🖼️</div>
          <p style={{ color: 'var(--text-faint)', fontSize: 14, margin: 0 }}>{search || activeTag ? 'No assets match your filters.' : 'No saved assets yet. Generate in Media Studio and click "Save to gallery".'}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {assets.map(a => (
            <div key={a.id} onClick={() => setSelected(a)} style={{ backgroundColor: 'var(--bg-surface)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', cursor: 'pointer' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.public_url} alt={a.alt_text} loading="lazy" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
              <div style={{ padding: '10px 12px' }}>
                <p style={{ color: 'var(--text)', fontSize: 12, fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title || a.prompt.slice(0, 40)}</p>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 9, color: 'var(--text-dim)', backgroundColor: 'var(--fill-soft)', padding: '2px 6px', borderRadius: 4 }}>{a.platform}</span>
                  {a.campaign_tag && <span style={{ fontSize: 9, color: '#9B72E8', backgroundColor: 'rgba(108,63,197,0.15)', padding: '2px 6px', borderRadius: 4 }}>{a.campaign_tag}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <>
          <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 49, cursor: 'pointer' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(640px, 92vw)', maxHeight: '88vh', overflowY: 'auto', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-strong)', borderRadius: 16, zIndex: 50 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selected.public_url} alt={selected.alt_text} style={{ width: '100%', display: 'block', borderTopLeftRadius: 16, borderTopRightRadius: 16 }} />
            <div style={{ padding: 20 }}>
              <h3 style={{ color: 'var(--text-strong)', fontSize: 16, fontWeight: 700, margin: '0 0 10px' }}>{selected.title}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {[
                  { k: 'Platform', v: `${selected.platform} · ${selected.dimensions}` },
                  { k: 'Style', v: selected.style },
                  { k: 'Campaign', v: selected.campaign_tag || '—' },
                  { k: 'Alt text', v: selected.alt_text },
                  { k: 'Prompt', v: selected.prompt },
                  { k: 'Created', v: new Date(selected.created_at).toLocaleString() },
                ].map(r => (
                  <div key={r.k} style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                    <span style={{ color: 'var(--text-faint)', width: 80, flexShrink: 0 }}>{r.k}</span>
                    <span style={{ color: 'var(--text-muted)', flex: 1 }}>{r.v}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <a href={selected.public_url} download target="_blank" rel="noopener noreferrer" style={{ flex: 1, textAlign: 'center', padding: '9px 0', borderRadius: 9, border: '1px solid rgba(108,63,197,0.3)', backgroundColor: 'rgba(108,63,197,0.1)', color: '#9B72E8', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>↓ Download</a>
                <button onClick={() => remove(selected.id)} style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid rgba(220,38,38,0.3)', backgroundColor: 'rgba(220,38,38,0.1)', color: '#DC2626', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Delete</button>
                <button onClick={() => setSelected(null)} style={{ padding: '9px 18px', borderRadius: 9, border: '1px solid var(--border-strong)', backgroundColor: 'transparent', color: 'var(--text-dim)', fontSize: 13, cursor: 'pointer' }}>Close</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Audience Segments ─────────────────────────────────────────────────────────

function AudienceSegments({ segments, loading }: { segments: Segment[]; loading: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
        {loading ? [1,2,3,4].map(i => <div key={i} style={{ height: 120, borderRadius: 14, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-soft)', animation: 'pulse 2s ease-in-out infinite' }} />)
        : segments.map(s => (
          <div key={s.label} style={{ backgroundColor: 'var(--bg-surface)', border: `1px solid ${s.color}25`, borderRadius: 14, padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>{s.label}</span>
              <span style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color: s.color }}>{s.count}</span>
            </div>
            <p style={{ color: 'var(--text-dim)', fontSize: 12, margin: '0 0 6px' }}>{s.description}</p>
            <span style={{ fontSize: 10, fontWeight: 600, color: s.color, backgroundColor: s.color + '18', padding: '2px 8px', borderRadius: 999 }}>{s.volume_range}</span>
          </div>
        ))}
      </div>
      <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px' }}>
        <h3 style={{ color: 'var(--text-dim)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 14px' }}>Suggested Campaigns by Segment</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { segment: '🐋 Whales',  action: 'VIP loyalty reward + exclusive market access', color: '#F59E0B' },
            { segment: '⚡ Active',  action: 'Weekend volume boost challenge + leaderboard',  color: '#6C3FC5' },
            { segment: '😴 Casual',  action: 'Low-risk intro market + guided first prediction', color: '#00C853' },
            { segment: '💤 Inactive', action: 'Win-back push with 2x P&L on first trade back', color: 'var(--text-muted)' },
          ].map(r => (
            <div key={r.segment} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', borderRadius: 10, backgroundColor: 'var(--bg-base)', border: '1px solid var(--fill-soft)' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: r.color, minWidth: 80 }}>{r.segment}</span>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', flex: 1 }}>{r.action}</span>
              <span style={{ fontSize: 12, color: 'var(--text-faintest)' }}>→</span>
            </div>
          ))}
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:0.7} }`}</style>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type MarketingSection = 'campaigns' | 'media' | 'gallery' | 'brand' | 'segments'

export function MarketingTab() {
  const [section, setSection]   = useState<MarketingSection>('campaigns')
  const [segments, setSegments] = useState<Segment[]>([])
  const [segLoading, setSegLoading] = useState(true)
  const [brandKit, setBrandKitState] = useState<BrandKit>(DEFAULT_BRAND_KIT)
  const [galleryKey, setGalleryKey]  = useState(0)

  // Load brand kit from localStorage once on mount
  useEffect(() => { setBrandKitState(loadBrandKit()) }, [])
  const setBrandKit = (bk: BrandKit) => { setBrandKitState(bk); saveBrandKit(bk) }

  const loadSegments = useCallback(async () => {
    setSegLoading(true)
    try {
      const res = await fetch('/api/company/marketing/segments')
      if (res.ok) { const data = await res.json(); setSegments(data.segments ?? []) }
    } finally { setSegLoading(false) }
  }, [])
  useEffect(() => { loadSegments() }, [loadSegments])

  const blurb: Record<MarketingSection, string> = {
    campaigns: 'Generate AI-powered campaign copy for any channel, goal, and audience in seconds.',
    media:     'Generate professional visuals with Ideogram AI — single, 4 variants, or all 8 platform sizes at once. Brand kit auto-applied.',
    gallery:   'Every saved creative, persisted to Supabase Storage. Search by prompt and filter by campaign tag.',
    brand:     'Define your palette, voice, and logo. Auto-injected into every image prompt for on-brand creatives.',
    segments:  'Player segments auto-computed from trading activity. Use these to target campaigns precisely.',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <TabBtn icon={<IconBullhorn />} label="Campaign Generator" active={section === 'campaigns'} onClick={() => setSection('campaigns')} />
        <TabBtn icon={<IconImage />}    label="Media Studio"       active={section === 'media'}     onClick={() => setSection('media')} />
        <TabBtn icon={<IconFolder />}   label="Gallery"            active={section === 'gallery'}   onClick={() => setSection('gallery')} />
        <TabBtn icon={<IconPalette />}  label="Brand Kit"          active={section === 'brand'}     onClick={() => setSection('brand')} />
        <TabBtn icon={<IconUsers />}    label="Audience Segments"  active={section === 'segments'}  onClick={() => setSection('segments')} />
      </div>

      <div style={{ padding: '10px 16px', borderRadius: 10, backgroundColor: 'rgba(108,63,197,0.08)', border: '1px solid rgba(108,63,197,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#9B72E8' }}>
          {section === 'campaigns' ? <IconBullhorn /> : section === 'media' ? <IconImage /> : section === 'gallery' ? <IconFolder /> : section === 'brand' ? <IconPalette /> : <IconUsers />}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{blurb[section]}</span>
      </div>

      {section === 'campaigns' && <CampaignGenerator segments={segments} />}
      {section === 'media'     && <MediaStudio brandKit={brandKit} onGallerySaved={() => setGalleryKey(k => k + 1)} />}
      {section === 'gallery'   && <GallerySection refreshKey={galleryKey} />}
      {section === 'brand'     && <BrandKitSection brandKit={brandKit} setBrandKit={setBrandKit} />}
      {section === 'segments'  && <AudienceSegments segments={segments} loading={segLoading} />}
    </div>
  )
}
