'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { FAL_VIDEO_MODELS, getFalVideoModel, makeCustomVideoModel, estVideoCost, FAL_DRAFT_MODEL_ID, FAL_TIER_ORDER, FAL_TIER_LABEL, type FalVideoModel, type CustomVideoSpec } from '@/lib/falVideoModels'
import VideoJobsPanel from '@/components/company/VideoJobsPanel'
import AssetEditorModal from '@/components/company/AssetEditorModal'

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
  engine:       string
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
  media_type?:  string
}

interface BrandColor { name: string; hex: string }
interface BrandKit {
  colors:          BrandColor[]
  logoDescription: string
  tone:            string
  visualStyle:     string
  autoInject:      boolean
  logoUrl?:        string | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PLATFORM_SIZES: PlatformSize[] = [
  { id: 'carousel',   label: 'Home Carousel',  aspect: 'ASPECT_16_9', dims: '1500×500',  aspectRatio: '3/1'  },
  { id: 'web_banner', label: 'Web Banner',     aspect: 'ASPECT_16_9', dims: '1920×1080', aspectRatio: '16/9' },
  { id: 'youtube',    label: 'YouTube Cover',  aspect: 'ASPECT_16_9', dims: '2560×1440', aspectRatio: '16/9' },
  { id: 'twitter',    label: 'X / Twitter',    aspect: 'ASPECT_16_9', dims: '1500×500',  aspectRatio: '3/1'  },
  { id: 'linkedin',   label: 'LinkedIn',       aspect: 'ASPECT_16_9', dims: '1584×396',  aspectRatio: '4/1'  },
  { id: 'facebook',   label: 'Facebook Cover', aspect: 'ASPECT_16_9', dims: '820×312',   aspectRatio: '16/9' },
  { id: 'instagram',  label: 'Instagram',      aspect: 'ASPECT_1_1',  dims: '1080×1080', aspectRatio: '1/1'  },
  { id: 'story',      label: 'Story / TikTok', aspect: 'ASPECT_9_16', dims: '1080×1920', aspectRatio: '9/16' },
  { id: 'pinterest',  label: 'Pinterest',      aspect: 'ASPECT_2_3',  dims: '1000×1500', aspectRatio: '2/3'  },
]

// Ideogram V_2 supports a fixed set of ratios — map any custom W×H to the nearest.
const IDEOGRAM_RATIOS: { aspect: string; r: number }[] = [
  { aspect: 'ASPECT_1_1', r: 1 }, { aspect: 'ASPECT_16_9', r: 16 / 9 }, { aspect: 'ASPECT_9_16', r: 9 / 16 },
  { aspect: 'ASPECT_4_3', r: 4 / 3 }, { aspect: 'ASPECT_3_4', r: 3 / 4 }, { aspect: 'ASPECT_2_3', r: 2 / 3 },
  { aspect: 'ASPECT_3_2', r: 3 / 2 }, { aspect: 'ASPECT_10_16', r: 10 / 16 }, { aspect: 'ASPECT_16_10', r: 16 / 10 },
]
function closestAspect(w: number, h: number): string {
  const r = w / h
  return IDEOGRAM_RATIOS.reduce((best, x) => Math.abs(x.r - r) < Math.abs(best.r - r) ? x : best).aspect
}

// Custom sizes persist per-admin in localStorage (same pattern as the Brand Kit).
const CUSTOM_SIZES_KEY = 'verdikt_custom_sizes'
function loadCustomSizes(): PlatformSize[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(CUSTOM_SIZES_KEY) ?? '[]') } catch { return [] }
}
function saveCustomSizes(sizes: PlatformSize[]) {
  try { localStorage.setItem(CUSTOM_SIZES_KEY, JSON.stringify(sizes)) } catch { /* ignore */ }
}

// Custom fal video models persist as serializable specs (buildInput is reattached
// via makeCustomVideoModel). Lets an admin paste any id from fal.ai/models.
const CUSTOM_VMODELS_KEY = 'verdikt_fal_video_models'
function loadCustomVideoSpecs(): CustomVideoSpec[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(CUSTOM_VMODELS_KEY) ?? '[]') } catch { return [] }
}
function saveCustomVideoSpecs(specs: CustomVideoSpec[]) {
  try { localStorage.setItem(CUSTOM_VMODELS_KEY, JSON.stringify(specs)) } catch { /* ignore */ }
}

// Carousel slide (mirrors promo_banners). Managed inside Media Studio.
interface PromoBanner {
  id:         string
  image_url:  string
  headline:   string
  subtext:    string
  cta_label:  string
  cta_href:   string
  sort_order: number
  is_active:  boolean
}

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
  logoUrl: null,
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

const ENGINE_COST = (engine?: string) => (engine === 'openai' ? 0.04 : engine === 'fal' ? 0.03 : IDEOGRAM_COST)

function buildMeta(data: { url: string; seed?: number; provider?: string }, prompt: string, style: string, platform: PlatformSize): ImageMeta {
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
    engine:       data.provider ?? 'ideogram',
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
          style: meta.style, prompt: meta.prompt, campaign_tag: campaignTag, seed: meta.seed, cost_usd: ENGINE_COST(meta.engine), image_engine: meta.engine,
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
  const [imageProvider, setImageProvider] = useState<'ideogram' | 'openai' | 'fal'>('ideogram')
  const [customSizes, setCustomSizes] = useState<PlatformSize[]>([])
  const [platform, setPlatform]   = useState<PlatformSize>(PLATFORM_SIZES[0])
  const [showCustom, setShowCustom] = useState(false)
  const [cw, setCw]               = useState('1500')
  const [ch, setCh]               = useState('500')
  const [cname, setCname]         = useState('')
  const [mode, setMode]           = useState<GenMode>('single')
  const [campaignTag, setCampaignTag] = useState('')
  const [loading, setLoading]     = useState(false)
  const [progress, setProgress]   = useState(0)
  const [batchDone, setBatchDone] = useState(0)
  const [batchTotal, setBatchTotal] = useState(0)
  const [results, setResults]     = useState<ImageMeta[]>([])
  const [error, setError]         = useState<string | null>(null)
  const progressRef               = useRef<ReturnType<typeof setInterval> | null>(null)

  // Carousel publish (only when the Home Carousel size is selected)
  const [bHeadline, setBHeadline] = useState('')
  const [bSubtext, setBSubtext]   = useState('')
  const [bCtaLabel, setBCtaLabel] = useState('Explore markets →')
  const [bCtaHref, setBCtaHref]   = useState('/player')
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished]   = useState(false)
  const [bannerRefresh, setBannerRefresh] = useState(0)

  // Video (fal.ai — model picker, frames, output controls)
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image')
  const [videoUrl, setVideoUrl]   = useState<string | null>(null)
  const [videoBusy, setVideoBusy] = useState(false)
  const [videoErr, setVideoErr]   = useState<string | null>(null)
  const [videoSaved, setVideoSaved] = useState(false)
  const [vProgress, setVProgress] = useState(0)
  const vProgressRef              = useRef<ReturnType<typeof setInterval> | null>(null)
  const [vMode, setVMode]         = useState<'draft' | 'final'>('final')   // progressive-enhancement tier
  const [jobsRefresh, setJobsRefresh] = useState(0)                        // bump to refetch Recent renders
  const [vModelId, setVModelId]   = useState<string>(FAL_VIDEO_MODELS[0].id)
  const [vAspect, setVAspect]     = useState<string>(FAL_VIDEO_MODELS[0].aspects[0])
  const [vDuration, setVDuration] = useState<number>(FAL_VIDEO_MODELS[0].durations[0])
  const [vResolution, setVResolution] = useState<string>(FAL_VIDEO_MODELS[0].resolutions[0])
  const [vAudio, setVAudio]       = useState(false)
  const [vStartUrl, setVStartUrl] = useState<string | null>(null)
  const [vEndUrl, setVEndUrl]     = useState<string | null>(null)
  const [vUploading, setVUploading] = useState<'start' | 'end' | null>(null)
  const [vInputMode, setVInputMode] = useState<'text' | 'frame'>('text')
  const [historyFor, setHistoryFor] = useState<'start' | 'end' | null>(null)
  const [historyImages, setHistoryImages] = useState<{ public_url: string; title?: string }[]>([])
  // Custom (user-pasted) fal models + the "Custom fal model…" entry form.
  const [customVModels, setCustomVModels] = useState<FalVideoModel[]>([])
  const [showVidForm, setShowVidForm] = useState(false)
  const [vidIdInput, setVidIdInput]   = useState('')
  const [vidNameInput, setVidNameInput] = useState('')
  const [vidKind, setVidKind]         = useState<'text' | 'frame'>('text')
  const [vidAudio, setVidAudio]       = useState(false)
  const allVModels = [...FAL_VIDEO_MODELS, ...customVModels]
  const vModel = allVModels.find(m => m.id === vModelId) ?? FAL_VIDEO_MODELS[0]
  const useFrames = vInputMode === 'frame' && vModel.caps.start
  const isDraft = vMode === 'draft'
  const draftModel = getFalVideoModel(FAL_DRAFT_MODEL_ID) ?? FAL_VIDEO_MODELS[0]
  // Cost shown reflects the tier actually used: draft forces the cheap model, no audio.
  const costModel = isDraft ? draftModel : vModel
  const costAudio = isDraft ? false : vAudio

  // Load gallery images when the History (frame picker) modal opens.
  useEffect(() => {
    if (!historyFor) return
    let cancelled = false
    fetch('/api/company/marketing/gallery').then(r => r.json()).then(d => {
      if (cancelled) return
      const imgs = (d.assets ?? []).filter((a: { media_type?: string }) => a.media_type !== 'video')
      setHistoryImages(imgs.map((a: { public_url: string; title?: string }) => ({ public_url: a.public_url, title: a.title })))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [historyFor])

  const selectVideoModel = (id: string) => {
    if (id === '__addvid__') { setShowVidForm(true); return }
    setShowVidForm(false)
    const m = allVModels.find(x => x.id === id); if (!m) return
    setVModelId(id)
    setVAspect(m.aspects[0]); setVDuration(m.durations[0]); setVResolution(m.resolutions[0])
    if (!m.caps.audio) setVAudio(false)
    if (!m.caps.end) setVEndUrl(null)
    // Force the right input mode for single-capability endpoints.
    if (!m.caps.text)       setVInputMode('frame')
    else if (!m.caps.start) { setVStartUrl(null); setVEndUrl(null); setVInputMode('text') }
  }

  const saveCustomVideoModel = () => {
    const id = vidIdInput.trim()
    if (!id) return
    const spec: CustomVideoSpec = { id, label: vidNameInput.trim() || undefined, kind: vidKind, audio: vidAudio }
    const specs = [...loadCustomVideoSpecs().filter(s => s.id !== id), spec]
    saveCustomVideoSpecs(specs)
    setCustomVModels(specs.map(makeCustomVideoModel))
    setShowVidForm(false); setVidIdInput(''); setVidNameInput(''); setVidKind('text'); setVidAudio(false)
    selectVideoModelFromSpec(spec)
  }
  // Select a just-saved custom model (its FalVideoModel is now in customVModels).
  const selectVideoModelFromSpec = (spec: CustomVideoSpec) => {
    const m = makeCustomVideoModel(spec)
    setVModelId(m.id)
    setVAspect(m.aspects[0]); setVDuration(m.durations[0]); setVResolution(m.resolutions[0])
    setVAudio(m.caps.audio ? vidAudio : false)
    setVInputMode(m.caps.text ? 'text' : 'frame')
    if (!m.caps.start) { setVStartUrl(null); setVEndUrl(null) }
  }

  const uploadFrame = async (which: 'start' | 'end', file: File) => {
    setVUploading(which)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/company/marketing/video/upload', { method: 'POST', body: fd })
      const d = await res.json()
      if (res.ok && d.url) { if (which === 'start') setVStartUrl(d.url); else setVEndUrl(d.url) }
      else setVideoErr(d.error ?? 'Frame upload failed')
    } finally { setVUploading(null) }
  }

  useEffect(() => { setCustomSizes(loadCustomSizes()) }, [])
  useEffect(() => { setCustomVModels(loadCustomVideoSpecs().map(makeCustomVideoModel)) }, [])

  const sizeOptions = [...PLATFORM_SIZES, ...customSizes]
  const isCarousel  = platform.id === 'carousel'

  const onSizeChange = (id: string) => {
    if (id === '__custom__') { setShowCustom(true); return }
    setShowCustom(false)
    const found = sizeOptions.find(p => p.id === id)
    if (found) setPlatform(found)
  }

  const saveCustomPreset = () => {
    const w = parseInt(cw, 10), h = parseInt(ch, 10)
    if (!w || !h || w < 64 || h < 64) return
    const preset: PlatformSize = {
      id:          `custom_${w}x${h}`,
      label:       cname.trim() || `Custom ${w}×${h}`,
      dims:        `${w}×${h}`,
      aspect:      closestAspect(w, h),
      aspectRatio: `${w}/${h}`,
    }
    const next = [...customSizes.filter(s => s.id !== preset.id), preset]
    setCustomSizes(next); saveCustomSizes(next)
    setPlatform(preset); setShowCustom(false); setCname('')
  }

  const publishToCarousel = async () => {
    if (results.length === 0) return
    setPublishing(true); setError(null)
    try {
      // Re-host the temporary studio image into Storage.
      const imgRes = await fetch('/api/company/banners/image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: results[0].url }),
      })
      const img = await imgRes.json()
      if (!imgRes.ok || !img.url) throw new Error(img.error ?? 'Re-host failed')
      // Create the slide (appended, active).
      const putRes = await fetch('/api/company/banners', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: img.url, headline: bHeadline, subtext: bSubtext,
          cta_label: bCtaLabel, cta_href: bCtaHref || '/player', sort_order: 999, is_active: true,
        }),
      })
      if (!putRes.ok) { const d = await putRes.json(); throw new Error(d.error ?? 'Publish failed') }
      setPublished(true); setBannerRefresh(k => k + 1)
    } catch (e) { setError((e as Error).message) }
    finally { setPublishing(false) }
  }

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

  // Video progress (estimated): climbs toward ~95% over ~90s, snaps to 100 on done.
  useEffect(() => {
    if (!videoBusy) { if (vProgressRef.current) clearInterval(vProgressRef.current); return }
    setVProgress(3)
    vProgressRef.current = setInterval(() => {
      setVProgress(p => (p >= 95 ? 95 : p + Math.max(1, Math.round((95 - p) / 12))))
    }, 1500)
    return () => { if (vProgressRef.current) clearInterval(vProgressRef.current) }
  }, [videoBusy])

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
    setLoading(true); setError(null); setResults([]); setProgress(0); setPublished(false)

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
    setLoading(true); setError(null); setResults([]); setMode('single'); setPlatform(p); setProgress(0); setPublished(false)
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

  const runVideo = async () => {
    if (!basePrompt.trim() && !vStartUrl) return
    // Cost guard: confirm before pricey (> ~$1) renders so credits aren't burned by accident.
    const estCost = estVideoCost(costModel, vDuration, costAudio)
    if (estCost > 1 && typeof window !== 'undefined' &&
        !window.confirm(`${costModel.label} · ${vDuration}s${costAudio ? ' · audio' : ''} will cost ~$${estCost.toFixed(2)} on fal. Generate?`)) return
    setVideoBusy(true); setVideoErr(null); setVideoUrl(null); setVideoSaved(false)
    try {
      let res = await fetch('/api/company/marketing/video', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: vModelId, prompt: effectivePrompt, isDraft,
          startUrl: useFrames ? (vStartUrl ?? undefined) : undefined,
          endUrl: useFrames ? (vEndUrl ?? undefined) : undefined,
          aspect: vAspect, duration: vDuration, resolution: vResolution, audio: vAudio,
        }),
      })
      let d = await res.json()
      setJobsRefresh(k => k + 1)   // a durable job row now exists — show it in Recent renders
      if (!res.ok) { setVideoErr(d.error ?? 'Video generation failed'); return }
      // If the job is still running, re-poll via GET until done (~5 min cap).
      const deadline = Date.now() + 300_000
      while (d.processing && d.request_id && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 6_000))
        const q = new URLSearchParams({ request_id: d.request_id, ...(d.model ? { model: d.model } : {}), ...(d.status_url ? { status_url: d.status_url } : {}), ...(d.response_url ? { response_url: d.response_url } : {}) })
        res = await fetch(`/api/company/marketing/video?${q}`)
        d = await res.json()
        if (!res.ok) { setVideoErr(d.error ?? 'Video generation failed'); return }
      }
      if (d.url) { setVProgress(100); setVideoUrl(d.url) }
      else setVideoErr('Still rendering — it will appear in Recent renders when done.')
    } catch {
      setVideoErr('Network error')
    } finally { setVideoBusy(false); setJobsRefresh(k => k + 1) }
  }

  const saveVideo = async () => {
    if (!videoUrl) return
    setVideoBusy(true)
    try {
      const res = await fetch('/api/company/marketing/gallery', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: videoUrl, media_type: 'video', title: `Video — ${basePrompt.slice(0, 50)}`,
          alt_text: basePrompt.slice(0, 120), platform: 'Video', dimensions: '',
          prompt: basePrompt, campaign_tag: campaignTag, cost_usd: estVideoCost(vModel, vDuration, vAudio), image_engine: 'fal',
        }),
      })
      if (res.ok) { setVideoSaved(true); onGallerySaved() }
    } finally { setVideoBusy(false) }
  }

  const perImageCost = imageProvider === 'openai' ? 0.04 : imageProvider === 'fal' ? 0.03 : IDEOGRAM_COST
  const costFor = (m: GenMode) => m === 'single' ? perImageCost : m === 'batch' ? perImageCost * 4 : perImageCost * 8
  const single  = results.length === 1 && mode === 'single'

  // Pre-fill the carousel headline from the prompt when a carousel result lands.
  useEffect(() => {
    if (single && isCarousel && !bHeadline.trim()) {
      const first = basePrompt.split(/[,.]/)[0].trim()
      if (first) setBHeadline(first.length > 48 ? first.slice(0, 48) : first)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [single, isCarousel])

  const selStyle: React.CSSProperties = { padding: '8px 10px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-strong)', fontSize: 13, cursor: 'pointer', outline: 'none' }
  const fldLabel: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* In video mode: controls left, preview right. In image mode: full-width. */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>

      {/* ── Control toolbar ────────────────────────────────────────────────── */}
      <div style={{ flex: mediaType === 'video' ? '1 1 440px' : '1 1 100%', minWidth: 320, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Row 1: brand chip + selects */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, backgroundColor: brandKit.autoInject ? 'rgba(0,200,83,0.07)' : 'var(--fill-subtle)', border: `1px solid ${brandKit.autoInject ? 'rgba(0,200,83,0.2)' : 'var(--border-soft)'}`, alignSelf: 'stretch' }}>
            <span style={{ color: brandKit.autoInject ? '#00C853' : 'var(--text-dim)' }}><IconPalette /></span>
            <div style={{ display: 'flex', gap: 3 }}>
              {brandKit.colors.map(c => <span key={c.hex} style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: c.hex, border: '1px solid var(--border-strong)' }} />)}
            </div>
          </div>

          {/* Media type: Image / Video */}
          <div>
            <label style={fldLabel}>Type</label>
            <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'var(--bg-base)' }}>
              {(['image', 'video'] as const).map(t => (
                <button key={t} onClick={() => setMediaType(t)} style={{
                  padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  backgroundColor: mediaType === t ? 'rgba(108,63,197,0.16)' : 'transparent',
                  color: mediaType === t ? '#9B72E8' : 'var(--text-dim)', textTransform: 'capitalize',
                }}>{t}</button>
              ))}
            </div>
          </div>

          {mediaType === 'image' && (<>
          <div>
            <label style={fldLabel}>Mode</label>
            <select value={mode} onChange={e => setMode(e.target.value as GenMode)} style={selStyle}>
              <option value="single">Single image — ${perImageCost.toFixed(2)}</option>
              <option value="batch">4 variants — ${(perImageCost * 4).toFixed(2)}</option>
              <option value="all">All 8 platforms — ${(perImageCost * 8).toFixed(2)}</option>
            </select>
          </div>

          <div>
            <label style={fldLabel}>Size</label>
            <select value={showCustom ? '__custom__' : platform.id} onChange={e => onSizeChange(e.target.value)} disabled={mode === 'all'} style={{ ...selStyle, opacity: mode === 'all' ? 0.5 : 1 }}>
              {sizeOptions.map(p => <option key={p.id} value={p.id}>{p.label} — {p.dims}</option>)}
              <option value="__custom__">Custom…</option>
            </select>
          </div>

          <div>
            <label style={fldLabel}>Engine</label>
            <select value={imageProvider} onChange={e => setImageProvider(e.target.value as 'ideogram' | 'openai' | 'fal')} style={selStyle}>
              <option value="ideogram">Ideogram V_2 — $0.08</option>
              <option value="openai">GPT Image — $0.04</option>
              <option value="fal">fal.ai (FLUX) — $0.03</option>
            </select>
          </div>

          <div>
            <label style={fldLabel}>Style</label>
            <select value={style} onChange={e => setStyle(e.target.value)} style={selStyle}>
              {STYLES.map(s => <option key={s} value={s} title={STYLE_DESC[s]}>{s}</option>)}
            </select>
          </div>
          </>)}

          {mediaType === 'video' && (
            <div>
              <label style={fldLabel}>Model</label>
              <select value={showVidForm ? '__addvid__' : vModelId} onChange={e => selectVideoModel(e.target.value)} style={selStyle}>
                {FAL_TIER_ORDER.map(tier => (
                  <optgroup key={tier} label={FAL_TIER_LABEL[tier]}>
                    {FAL_VIDEO_MODELS.filter(m => m.tier === tier).map(m => (
                      <option key={m.id} value={m.id}>{m.caps.audio ? '🔊 ' : ''}{m.label} — ${m.costPerSec.toFixed(2)}/s</option>
                    ))}
                  </optgroup>
                ))}
                {customVModels.length > 0 && (
                  <optgroup label="My models">
                    {customVModels.map(m => <option key={m.id} value={m.id}>{m.caps.audio ? '🔊 ' : ''}{m.label}</option>)}
                  </optgroup>
                )}
                <option value="__addvid__">＋ Custom fal model…</option>
              </select>
            </div>
          )}

          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={fldLabel}>Campaign tag (gallery)</label>
            <input value={campaignTag} onChange={e => setCampaignTag(e.target.value)} placeholder="e.g. world-cup-2026" style={{ ...selStyle, width: '100%', cursor: 'text', boxSizing: 'border-box' }} />
          </div>
        </div>

        {/* Custom size form */}
        {showCustom && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', padding: '10px 12px', borderRadius: 10, backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-soft)' }}>
            <div><label style={fldLabel}>Width</label><input value={cw} onChange={e => setCw(e.target.value.replace(/\D/g, ''))} style={{ ...selStyle, width: 90, cursor: 'text' }} /></div>
            <span style={{ paddingBottom: 9, color: 'var(--text-faint)' }}>×</span>
            <div><label style={fldLabel}>Height</label><input value={ch} onChange={e => setCh(e.target.value.replace(/\D/g, ''))} style={{ ...selStyle, width: 90, cursor: 'text' }} /></div>
            <div style={{ flex: 1, minWidth: 140 }}><label style={fldLabel}>Preset name (optional)</label><input value={cname} onChange={e => setCname(e.target.value)} placeholder={`Custom ${cw}×${ch}`} style={{ ...selStyle, width: '100%', cursor: 'text', boxSizing: 'border-box' }} /></div>
            <button onClick={saveCustomPreset} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6C3FC5, #9B72E8)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Save preset</button>
            <button onClick={() => setShowCustom(false)} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-dim)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
            <p style={{ width: '100%', fontSize: 10, color: 'var(--text-faintest)', margin: '2px 0 0' }}>Ideogram renders the nearest supported ratio ({closestAspect(parseInt(cw) || 1, parseInt(ch) || 1).replace('ASPECT_', '').replace('_', ':')}); saved presets persist in this dropdown.</p>
          </div>
        )}

        {imageProvider === 'openai' && (
          <p style={{ fontSize: 10, color: 'var(--text-faintest)', margin: 0 }}>OpenAI gpt-image-1 via openai-image-proxy. Style presets apply to Ideogram only.</p>
        )}

        {/* Custom fal video model — paste any exact id from fal.ai/models */}
        {mediaType === 'video' && showVidForm && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', padding: '10px 12px', borderRadius: 10, backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-soft)' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <label style={fldLabel}>fal model id</label>
              <input value={vidIdInput} onChange={e => setVidIdInput(e.target.value)} placeholder="e.g. bytedance/seedance-2.0/text-to-video" style={{ ...selStyle, width: '100%', cursor: 'text', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={fldLabel}>Type</label>
              <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)' }}>
                {([['text', 'Text'], ['frame', 'Frame']] as const).map(([k, lbl]) => (
                  <button key={k} onClick={() => setVidKind(k)} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, backgroundColor: vidKind === k ? 'rgba(108,63,197,0.16)' : 'transparent', color: vidKind === k ? '#9B72E8' : 'var(--text-dim)' }}>{lbl}</button>
                ))}
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-dim)', cursor: 'pointer', paddingBottom: 8 }}>
              <input type="checkbox" checked={vidAudio} onChange={e => setVidAudio(e.target.checked)} /> Audio
            </label>
            <div style={{ flex: 1, minWidth: 140 }}><label style={fldLabel}>Name (optional)</label><input value={vidNameInput} onChange={e => setVidNameInput(e.target.value)} placeholder="Display name" style={{ ...selStyle, width: '100%', cursor: 'text', boxSizing: 'border-box' }} /></div>
            <button onClick={saveCustomVideoModel} disabled={!vidIdInput.trim()} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: vidIdInput.trim() ? 'linear-gradient(135deg, #6C3FC5, #9B72E8)' : 'rgba(108,63,197,0.3)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: vidIdInput.trim() ? 'pointer' : 'default' }}>Save</button>
            <button onClick={() => setShowVidForm(false)} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-dim)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
            <p style={{ width: '100%', fontSize: 10, color: 'var(--text-faintest)', margin: '2px 0 0' }}>Paste the exact id from fal.ai/models (it runs verbatim). Choose <b>Frame</b> for image-to-video endpoints. Saved models persist in this dropdown.</p>
          </div>
        )}

        {/* Video controls: frames + output (per model) */}
        {mediaType === 'video' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px', borderRadius: 10, backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-soft)' }}>
            {/* Draft → Final tier (progressive enhancement: cheap drafts, premium finals) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)' }}>
                {([['draft', '⚡ Draft'], ['final', '★ Final']] as const).map(([m, label]) => (
                  <button key={m} onClick={() => setVMode(m)} style={{
                    padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                    backgroundColor: vMode === m ? 'rgba(0,200,83,0.16)' : 'transparent',
                    color: vMode === m ? '#00C853' : 'var(--text-dim)',
                  }}>{label}</button>
                ))}
              </div>
              <p style={{ fontSize: 10, color: 'var(--text-faintest)', margin: 0, flex: 1 }}>
                {isDraft
                  ? `Draft: cheap ${draftModel.label} at ${draftModel.resolutions[0]}, no audio — iterate fast & cheap.`
                  : `Final: your selected model at full resolution${vModel.caps.audio ? ' + audio' : ''}.`}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <p style={{ fontSize: 10, color: 'var(--text-faintest)', margin: 0, flex: 1 }}>
                {vModel.label} · {[vModel.caps.text && 'text→video', vModel.caps.start && 'image→video', vModel.caps.end && 'end frame', vModel.caps.audio && 'audio'].filter(Boolean).join(' · ')}
              </p>
              {vModel.caps.start && vModel.caps.text && (
                <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)' }}>
                  {([['text', 'Text → Video'], ['frame', 'Frame → Video']] as const).map(([m, label]) => (
                    <button key={m} onClick={() => setVInputMode(m)} style={{
                      padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                      backgroundColor: vInputMode === m ? 'rgba(108,63,197,0.16)' : 'transparent',
                      color: vInputMode === m ? '#9B72E8' : 'var(--text-dim)',
                    }}>{label}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Frames (Frame → Video mode) */}
            {useFrames && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {([['start', 'Start frame', vStartUrl, setVStartUrl] as const,
                   ...(vModel.caps.end ? [['end', 'End frame', vEndUrl, setVEndUrl] as const] : [])
                  ]).map(([which, label, url, setUrl]) => (
                  <div key={which} style={{ width: 150 }}>
                    <label style={fldLabel}>{label}</label>
                    <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', borderRadius: 8, border: '1px dashed var(--border-strong)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-surface)' }}>
                      {url ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <button onClick={() => setUrl(null)} title="Remove" style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', cursor: 'pointer', fontSize: 13 }}>×</button>
                        </>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{vUploading === which ? 'Uploading…' : 'No frame'}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      <label style={{ flex: 1, textAlign: 'center', fontSize: 11, padding: '5px 0', borderRadius: 6, border: '1px solid var(--border-strong)', cursor: 'pointer', color: 'var(--text-dim)' }}>
                        Upload
                        <input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) uploadFrame(which, f) }} />
                      </label>
                      <button onClick={() => setHistoryFor(which)} style={{ flex: 1, fontSize: 11, padding: '5px 0', borderRadius: 6, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer' }}>Gallery</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Output controls */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div><label style={fldLabel}>Aspect</label><select value={vAspect} onChange={e => setVAspect(e.target.value)} style={selStyle}>{vModel.aspects.map(a => <option key={a} value={a}>{a}</option>)}</select></div>
              <div><label style={fldLabel}>Duration</label><select value={vDuration} onChange={e => setVDuration(Number(e.target.value))} style={selStyle}>{vModel.durations.map(d => <option key={d} value={d}>{d}s</option>)}</select></div>
              <div><label style={fldLabel}>Resolution</label><select value={vResolution} onChange={e => setVResolution(e.target.value)} style={selStyle}>{vModel.resolutions.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
              {vModel.caps.audio && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-dim)', cursor: 'pointer', paddingBottom: 8 }}>
                  <input type="checkbox" checked={vAudio} onChange={e => setVAudio(e.target.checked)} /> Audio
                </label>
              )}
            </div>
          </div>
        )}

        {/* Row 2: prompt + actions */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <textarea value={prompt} onChange={e => { setPrompt(e.target.value); setEnhanced(null) }} placeholder="Describe your creative in a few words…" rows={2} style={{ flex: 1, minWidth: 240, padding: '10px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-strong)', fontSize: 13, resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button onClick={enhancePrompt} disabled={!prompt.trim() || enhancing} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid rgba(108,63,197,0.35)', backgroundColor: 'rgba(108,63,197,0.08)', color: enhancing ? 'var(--text-faint)' : '#9B72E8', fontSize: 12, fontWeight: 600, cursor: (!prompt.trim() || enhancing) ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
              {enhancing ? '✦ Enhancing…' : '✨ Enhance'}
            </button>
            {mediaType === 'image' ? (
              <button onClick={run} disabled={loading || !basePrompt.trim()} style={{ padding: '9px 18px', borderRadius: 8, background: (loading || !basePrompt.trim()) ? 'rgba(108,63,197,0.3)' : 'linear-gradient(135deg, #6C3FC5, #9B72E8)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: (loading || !basePrompt.trim()) ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
                {loading ? 'Generating…' : `⚡ Generate — $${costFor(mode).toFixed(2)}`}
              </button>
            ) : (
              <button onClick={runVideo} disabled={videoBusy || (!basePrompt.trim() && !vStartUrl)} style={{ padding: '9px 18px', borderRadius: 8, background: (videoBusy || (!basePrompt.trim() && !vStartUrl)) ? 'rgba(108,63,197,0.3)' : 'linear-gradient(135deg, #6C3FC5, #9B72E8)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: (videoBusy || (!basePrompt.trim() && !vStartUrl)) ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
                {videoBusy ? 'Generating…' : `🎬 ${isDraft ? 'Draft' : 'Generate'} — ~$${estVideoCost(costModel, vDuration, costAudio).toFixed(2)}`}
              </button>
            )}
          </div>
        </div>

        {enhanced && (
          <div style={{ padding: '8px 10px', borderRadius: 8, backgroundColor: 'rgba(0,200,83,0.06)', border: '1px solid rgba(0,200,83,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#00C853', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>✓ Enhanced prompt</p>
              <button onClick={() => setEnhanced(null)} style={{ fontSize: 10, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>✕ Clear</button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>{enhanced}</p>
          </div>
        )}

        {/* Presets chip row */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PRESETS.map(p => (
            <button key={p.label} onClick={() => { setPrompt(p.prompt); setEnhanced(null) }} title={p.prompt} style={{ padding: '5px 10px', borderRadius: 999, backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-soft)', color: '#9B72E8', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>{/* close control toolbar */}

      {/* ── Right preview (video mode) ─────────────────────────────────────── */}
      {mediaType === 'video' && (
        <div style={{ flex: '1 1 360px', minWidth: 300 }}>
          {videoBusy ? (
            <div style={{ position: 'relative', backgroundColor: '#0a0a0f', borderRadius: 16, border: '1px solid rgba(108,63,197,0.3)', aspectRatio: vAspect.replace(':', '/'), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, minHeight: 220 }}>
              <svg width="84" height="84" viewBox="0 0 100 100" fill="none" aria-hidden="true">
                <path d="M20 20 L50 80 L80 20" fill="none" stroke="#00C853" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"
                  style={{ strokeDasharray: 150, strokeDashoffset: 150, animation: 'vdraw 1.6s ease-in-out infinite' }} />
              </svg>
              <div style={{ width: '70%', maxWidth: 260 }}>
                <div style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 999, height: 5, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, #00C853, #6C3FC5)', width: `${vProgress}%`, transition: 'width 0.9s ease-out' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>Generating with {vModel.label}…</span>
                  <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: '#00C853' }}>{vProgress}%</span>
                </div>
              </div>
            </div>
          ) : videoUrl ? (
            <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(108,63,197,0.3)' }}>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={videoUrl} controls style={{ width: '100%', display: 'block', background: '#000' }} />
              <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border-soft)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#9B72E8', backgroundColor: 'rgba(108,63,197,0.15)', padding: '3px 10px', borderRadius: 999 }}>{vModel.label}</span>
                <span style={{ flex: 1 }} />
                <button onClick={saveVideo} disabled={videoBusy || videoSaved} style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${videoSaved ? 'rgba(0,200,83,0.4)' : 'var(--border-strong)'}`, backgroundColor: videoSaved ? 'rgba(0,200,83,0.1)' : 'transparent', color: videoSaved ? '#00C853' : 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: videoSaved ? 'default' : 'pointer' }}>
                  {videoSaved ? '✓ In gallery' : 'Save to gallery'}
                </button>
                <a href={videoUrl} download target="_blank" rel="noopener noreferrer" style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(108,63,197,0.3)', backgroundColor: 'rgba(108,63,197,0.1)', color: '#9B72E8', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>↓ Download</a>
              </div>
            </div>
          ) : videoErr ? (
            <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: 16, padding: 40, border: '1px solid rgba(220,38,38,0.3)', textAlign: 'center', color: '#DC2626', fontSize: 14 }}>{videoErr}</div>
          ) : (
            <div style={{ position: 'relative', backgroundColor: '#0a0a0f', borderRadius: 16, border: '1px dashed var(--border-strong)', aspectRatio: vAspect.replace(':', '/'), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 220, overflow: 'hidden' }}>
              <svg width="72" height="72" viewBox="0 0 100 100" fill="none" aria-hidden="true" style={{ opacity: 0.35 }}>
                <path d="M20 20 L50 80 L80 20" fill="none" stroke="#00C853" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p style={{ color: 'var(--text-faint)', fontSize: 12, margin: 0 }}>Your video preview appears here</p>
            </div>
          )}
        </div>
      )}

      </div>{/* close controls/preview row */}

      {/* Durable jobs — billed renders are never lost, even after reload/navigation */}
      {mediaType === 'video' && <VideoJobsPanel refreshKey={jobsRefresh} onPick={(u) => { setVideoUrl(u); setVideoErr(null) }} />}

      {/* ── Result area (image mode) ───────────────────────────────────────── */}
      {mediaType === 'image' && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Loading */}
        {mediaType === 'image' && loading && mode === 'single' && (
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

        {mediaType === 'image' && loading && mode !== 'single' && (
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
        {mediaType === 'image' && !loading && single && (
          <>
            <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(108,63,197,0.3)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={results[0].url} alt={results[0].alt_text} title={results[0].title} loading="lazy" style={{ width: '100%', display: 'block' }} />
              <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border-soft)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#9B72E8', backgroundColor: 'rgba(108,63,197,0.15)', padding: '3px 10px', borderRadius: 999, border: '1px solid rgba(108,63,197,0.3)' }}>{results[0].platform.label} · {results[0].platform.dims}</span>
                <span style={{ fontSize: 11, color: 'var(--text-faint)', flex: 1 }}>{results[0].style}</span>
                {!isCarousel && <SaveAndDownload meta={results[0]} campaignTag={campaignTag} onSaved={onGallerySaved} />}
              </div>
            </div>

            {/* Publish to Home Carousel — primary action at carousel size */}
            {isCarousel && (
              <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid rgba(0,200,83,0.35)', borderRadius: 14, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#00A844', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Publish to Home Carousel</p>
                <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '-4px 0 0' }}>Overlay text is optional — leave blank if the artwork already contains the headline.</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div><label style={fldLabel}>Headline</label><input value={bHeadline} onChange={e => setBHeadline(e.target.value)} placeholder="Predict. Win. Repeat." style={{ ...selStyle, width: '100%', cursor: 'text', boxSizing: 'border-box' }} /></div>
                  <div><label style={fldLabel}>Subtext</label><input value={bSubtext} onChange={e => setBSubtext(e.target.value)} placeholder="Trade real-world outcomes." style={{ ...selStyle, width: '100%', cursor: 'text', boxSizing: 'border-box' }} /></div>
                  <div><label style={fldLabel}>CTA label</label><input value={bCtaLabel} onChange={e => setBCtaLabel(e.target.value)} style={{ ...selStyle, width: '100%', cursor: 'text', boxSizing: 'border-box' }} /></div>
                  <div><label style={fldLabel}>CTA link</label><input value={bCtaHref} onChange={e => setBCtaHref(e.target.value)} style={{ ...selStyle, width: '100%', cursor: 'text', boxSizing: 'border-box' }} /></div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <button onClick={publishToCarousel} disabled={publishing || published} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', backgroundColor: published ? 'rgba(0,200,83,0.15)' : '#00C853', color: published ? '#00A844' : '#fff', fontSize: 13, fontWeight: 700, cursor: (publishing || published) ? 'default' : 'pointer' }}>
                    {published ? '✓ Published to carousel' : publishing ? 'Publishing…' : 'Publish to Home Carousel'}
                  </button>
                  <span style={{ fontSize: 11, color: 'var(--text-faintest)' }}>Also:</span>
                  <SaveAndDownload meta={results[0]} campaignTag={campaignTag} onSaved={onGallerySaved} />
                </div>
              </div>
            )}

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
        {mediaType === 'image' && !loading && results.length > 0 && !single && (
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
        {mediaType === 'image' && !loading && error && results.length === 0 && (
          <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: 16, padding: '40px', border: '1px solid rgba(220,38,38,0.3)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 24 }}>⚠</span>
            <p style={{ color: '#DC2626', fontSize: 14, textAlign: 'center', margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Empty */}
        {mediaType === 'image' && !loading && results.length === 0 && !error && (
          <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: 16, border: '1px dashed var(--border)', aspectRatio: mode === 'all' ? '16/9' : platform.aspectRatio, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
            <div style={{ textAlign: 'center', padding: 20 }}>
              <div style={{ fontSize: 40, color: 'var(--bg-inset)', marginBottom: 10 }}>🎨</div>
              <p style={{ color: 'var(--text-faint)', fontSize: 13, margin: 0 }}>Generated creative will appear here.<br />Powered by Ideogram V_2 · ${IDEOGRAM_COST.toFixed(2)}/image</p>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Frame picker (History) modal */}
      {historyFor && (
        <>
          <div onClick={() => setHistoryFor(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 59 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(680px, 92vw)', maxHeight: '82vh', overflowY: 'auto', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-strong)', borderRadius: 16, zIndex: 60, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0, color: 'var(--text-strong)' }}>Pick a {historyFor} frame</h3>
              <button onClick={() => setHistoryFor(null)} style={{ border: 'none', background: 'var(--bg-inset)', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', color: 'var(--text-dim)', fontSize: 16 }}>×</button>
            </div>
            {historyImages.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-faint)', textAlign: 'center', padding: 30 }}>No gallery images yet — generate some images first.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                {historyImages.map((a, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={a.public_url} alt={a.title ?? ''} onClick={() => { if (historyFor === 'start') setVStartUrl(a.public_url); else setVEndUrl(a.public_url); setHistoryFor(null) }}
                    style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border)' }} />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Home Carousel manager ──────────────────────────────────────────── */}
      <CarouselManager refreshKey={bannerRefresh} />

      <style>{`@keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} } @keyframes vdraw { 0%{stroke-dashoffset:150} 50%{stroke-dashoffset:0} 100%{stroke-dashoffset:-150} }`}</style>
    </div>
  )
}

// ── Home Carousel manager (embedded in Media Studio) ───────────────────────────
// Lists promo_banners: edit overlay text, reorder, toggle active, delete. Slide
// images come from the studio generator (Home Carousel size → Publish), so there
// is no per-card image generation here.
function CarouselManager({ refreshKey }: { refreshKey: number }) {
  const [banners, setBanners] = useState<PromoBanner[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId]   = useState<string | null>(null)
  const [msg, setMsg]         = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/company/banners')
      if (res.ok) { const d = await res.json(); setBanners(d.banners ?? []) }
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load, refreshKey])

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

  const save = async (b: PromoBanner) => {
    setBusyId(b.id); setMsg(null)
    try { await put(b); setMsg('Saved ✓') } catch (e) { setMsg((e as Error).message) } finally { setBusyId(null) }
  }
  const remove = async (id: string) => {
    setBusyId(id); setMsg(null)
    try {
      const res = await fetch(`/api/company/banners?id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setBanners(prev => prev.filter(b => b.id !== id))
    } catch (e) { setMsg((e as Error).message) } finally { setBusyId(null) }
  }
  const move = async (id: string, dir: -1 | 1) => {
    const idx = banners.findIndex(b => b.id === id); const j = idx + dir
    if (idx < 0 || j < 0 || j >= banners.length) return
    const a = banners[idx], b = banners[j]
    const aNew = { ...a, sort_order: b.sort_order }, bNew = { ...b, sort_order: a.sort_order }
    setBusyId(id); setMsg(null)
    try {
      await Promise.all([put(aNew), put(bNew)])
      setBanners(prev => [...prev.map(x => x.id === a.id ? aNew : x.id === b.id ? bNew : x)].sort((x, y) => x.sort_order - y.sort_order))
    } catch (e) { setMsg((e as Error).message) } finally { setBusyId(null) }
  }

  const fld: React.CSSProperties = { padding: '7px 9px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-strong)', fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const icon: React.CSSProperties = { width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-base)', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 13 }

  return (
    <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div>
          <h3 style={{ color: 'var(--text-strong)', fontSize: 14, fontWeight: 800, margin: 0 }}>Home Carousel</h3>
          <p style={{ color: 'var(--text-faint)', fontSize: 11, margin: '3px 0 0' }}>Slides shown in the player&apos;s Visual theme. Generate art above (Size → Home Carousel → Publish), then order &amp; edit here.</p>
        </div>
        {msg && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{msg}</span>}
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-faint)', fontSize: 12, padding: '20px', textAlign: 'center' }}>Loading…</p>
      ) : banners.length === 0 ? (
        <p style={{ color: 'var(--text-faint)', fontSize: 12, padding: '20px', textAlign: 'center' }}>No slides yet. Generate at the Home Carousel size and click “Publish to Home Carousel”.</p>
      ) : (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {banners.map(b => (
            <div key={b.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, opacity: b.is_active ? 1 : 0.6 }}>
              <div style={{ position: 'relative', width: '100%', aspectRatio: '3 / 1', borderRadius: 8, overflow: 'hidden', background: b.image_url ? 'var(--bg-inset)' : 'linear-gradient(120deg,#06281A,#00C853)' }}>
                {b.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.image_url} alt={b.headline} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <input value={b.headline} onChange={e => patch(b.id, { headline: e.target.value })} placeholder="Headline" style={fld} />
                <input value={b.subtext} onChange={e => patch(b.id, { subtext: e.target.value })} placeholder="Subtext" style={fld} />
                <input value={b.cta_label} onChange={e => patch(b.id, { cta_label: e.target.value })} placeholder="CTA label" style={fld} />
                <input value={b.cta_href} onChange={e => patch(b.id, { cta_href: e.target.value })} placeholder="/player" style={fld} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-dim)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={b.is_active} onChange={e => patch(b.id, { is_active: e.target.checked })} /> Active
                </label>
                <button onClick={() => move(b.id, -1)} disabled={busyId === b.id} title="Up" style={icon}>↑</button>
                <button onClick={() => move(b.id, 1)} disabled={busyId === b.id} title="Down" style={icon}>↓</button>
                <button onClick={() => save(b)} disabled={busyId === b.id} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', backgroundColor: '#00C853', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                <button onClick={() => remove(b.id)} disabled={busyId === b.id} style={{ marginLeft: 'auto', padding: '7px 12px', borderRadius: 8, border: '1px solid #DC2626', background: 'transparent', color: '#DC2626', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
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
          style: meta.style, prompt: meta.prompt, campaign_tag: campaignTag, seed: meta.seed, cost_usd: ENGINE_COST(meta.engine), image_engine: meta.engine,
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

const LOGO_MODELS = [
  { id: 'fal-ai/flux-pro/v1.1',       label: 'FLUX Pro v1.1', cost: 0.04 },
  { id: 'fal-ai/flux-pro/v1.1-ultra', label: 'FLUX Ultra',    cost: 0.06 },
] as const

function BrandKitSection({ brandKit, setBrandKit }: { brandKit: BrandKit; setBrandKit: (bk: BrandKit) => void }) {
  const [copied, setCopied] = useState(false)
  const [logoModel, setLogoModel] = useState<string>(LOGO_MODELS[0].id)
  const [logoBusy, setLogoBusy]   = useState(false)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)   // freshly generated, unsaved
  const [logoSaving, setLogoSaving]   = useState(false)
  const [logoErr, setLogoErr]     = useState<string | null>(null)
  const update = (patch: Partial<BrandKit>) => setBrandKit({ ...brandKit, ...patch })

  // Inject the active palette + visual style into the logo prompt so the mark is on-brand.
  const logoPrompt = () => {
    const colors = brandKit.colors.map(c => `${c.name} ${c.hex}`).join(', ')
    const base = brandKit.logoDescription?.trim() || VERDIKT_LOGO_PROMPT
    return `${base}. Brand palette: ${colors}. ${brandKit.visualStyle}`.trim()
  }

  // A generated-but-unsaved preview is cached so it survives leaving/returning to
  // the Brand Kit tab (it's only persisted to Supabase on Save).
  useEffect(() => {
    try { const p = localStorage.getItem('verdikt_logo_preview'); if (p) setLogoPreview(p) } catch { /* ignore */ }
  }, [])

  const generateLogo = async () => {
    setLogoBusy(true); setLogoErr(null); setLogoPreview(null)
    try {
      const r = await fetch('/api/company/marketing/brand/logo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: logoPrompt(), model: logoModel }),
      })
      const d = await r.json()
      if (r.ok && d.url) { setLogoPreview(d.url); try { localStorage.setItem('verdikt_logo_preview', d.url) } catch { /* ignore */ } }
      else setLogoErr(d.error ?? 'Logo generation failed')
    } catch { setLogoErr('Network error') } finally { setLogoBusy(false) }
  }

  const saveLogo = async () => {
    if (!logoPreview) return
    setLogoSaving(true); setLogoErr(null)
    try {
      const r = await fetch('/api/company/marketing/brand/logo', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: logoPreview }),
      })
      const d = await r.json()
      if (r.ok && d.logo_url) {
        setBrandKit({ ...brandKit, logoUrl: d.logo_url }); setLogoPreview(null)
        try { localStorage.removeItem('verdikt_logo_preview') } catch { /* ignore */ }
        // Also surface it in the asset gallery (reads marketing_assets).
        fetch('/api/company/marketing/gallery', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: d.logo_url, media_type: 'image', title: 'Brand Logo', alt_text: 'Verdikt brand logo', platform: 'Brand', dimensions: '', prompt: 'brand logo', campaign_tag: 'brand', cost_usd: 0, image_engine: 'fal' }),
        }).catch(() => {})
      }
      else setLogoErr(d.error ?? 'Save failed')
    } catch { setLogoErr('Network error') } finally { setLogoSaving(false) }
  }
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

          {/* Current saved logo (if any) */}
          {brandKit.logoUrl && !logoPreview && (
            <div style={{ marginBottom: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={brandKit.logoUrl} alt="Brand logo" style={{ width: '100%', borderRadius: 10, border: '1px solid var(--border)', background: '#0a0a0f', display: 'block' }} />
              <p style={{ fontSize: 10, color: '#00C853', margin: '6px 0 0', textAlign: 'center' }}>✓ Saved to Brand Kit</p>
            </div>
          )}

          {/* Fresh, unsaved preview */}
          {logoPreview && (
            <div style={{ marginBottom: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoPreview} alt="Logo preview" style={{ width: '100%', borderRadius: 10, border: '1px solid rgba(224,92,32,0.55)', background: '#0a0a0f', display: 'block' }} />
              <p style={{ fontSize: 11, color: '#E05C20', fontWeight: 700, margin: '6px 0 0', textAlign: 'center' }}>⚠ Not saved yet — click Save to keep it</p>
              <button onClick={saveLogo} disabled={logoSaving} style={{ width: '100%', marginTop: 6, padding: '10px 0', borderRadius: 9, border: 'none', background: logoSaving ? 'rgba(0,200,83,0.4)' : 'linear-gradient(135deg, #00A847, #00C853)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: logoSaving ? 'default' : 'pointer' }}>
                {logoSaving ? 'Saving…' : '✓ Save to Brand Kit'}
              </button>
            </div>
          )}

          {logoErr && <p style={{ fontSize: 11, color: '#DC2626', margin: '0 0 10px' }}>{logoErr}</p>}

          {/* Model toggle (Pro / Ultra) */}
          <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'var(--bg-base)', marginBottom: 8 }}>
            {LOGO_MODELS.map(m => (
              <button key={m.id} onClick={() => setLogoModel(m.id)} style={{ flex: 1, padding: '6px 4px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, backgroundColor: logoModel === m.id ? 'rgba(108,63,197,0.16)' : 'transparent', color: logoModel === m.id ? '#9B72E8' : 'var(--text-dim)' }}>{m.label}</button>
            ))}
          </div>

          <button onClick={generateLogo} disabled={logoBusy} style={{ width: '100%', padding: '9px 0', borderRadius: 9, border: 'none', background: logoBusy ? 'rgba(108,63,197,0.3)' : 'linear-gradient(135deg, #6C3FC5, #9B72E8)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: logoBusy ? 'default' : 'pointer' }}>
            {logoBusy ? '✦ Generating…' : `✨ Generate logo — ~$${(LOGO_MODELS.find(m => m.id === logoModel)?.cost ?? 0.04).toFixed(2)}`}
          </button>

          <button onClick={() => { navigator.clipboard.writeText(logoPrompt()); setCopied(true); setTimeout(() => setCopied(false), 2000) }} style={{ width: '100%', marginTop: 8, padding: '8px 0', borderRadius: 9, border: '1px solid rgba(108,63,197,0.4)', backgroundColor: copied ? 'rgba(0,200,83,0.1)' : 'transparent', color: copied ? '#00C853' : '#9B72E8', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            {copied ? '✓ Copied' : 'Copy logo prompt'}
          </button>
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
  const [editing, setEditing]   = useState<GalleryAsset | null>(null)
  const [hovered, setHovered]   = useState<string | null>(null)
  const [totalSpend, setTotalSpend] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  // "Add to Home Carousel" form (inside the detail modal)
  const [addOpen, setAddOpen]   = useState(false)
  const [aHeadline, setAHeadline] = useState('')
  const [aSubtext, setASubtext] = useState('')
  const [aCta, setACta]         = useState('Explore markets →')
  const [aHref, setAHref]       = useState('/player')
  const [adding, setAdding]     = useState(false)
  const [added, setAdded]       = useState(false)

  const openAddForm = (a: GalleryAsset) => {
    // Pre-fill headline from a cleaned title (strip the "Platform — " prefix).
    const clean = (a.title || a.prompt || '').replace(/^[^—]*—\s*/, '').split(/[,.]/)[0].trim()
    setAHeadline(clean.length > 48 ? clean.slice(0, 48) : clean)
    setASubtext(''); setACta('Explore markets →'); setAHref('/player')
    setAdded(false); setAddOpen(true)
  }

  const addToCarousel = async () => {
    if (!selected) return
    setAdding(true)
    try {
      const res = await fetch('/api/company/banners', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: selected.public_url, headline: aHeadline, subtext: aSubtext,
          cta_label: aCta, cta_href: aHref || '/player', sort_order: 999, is_active: true,
        }),
      })
      if (res.ok) { setAdded(true); setAddOpen(false) }
    } finally { setAdding(false) }
  }

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
            <div key={a.id} onClick={() => setSelected(a)} onMouseEnter={() => setHovered(a.id)} onMouseLeave={() => setHovered(h => h === a.id ? null : h)} style={{ position: 'relative', backgroundColor: 'var(--bg-surface)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', cursor: 'pointer' }}>
              {a.media_type === 'video'
                ? <video src={a.public_url} muted style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block', background: '#000' }} />
                // eslint-disable-next-line @next/next/no-img-element
                : <img src={a.public_url} alt={a.alt_text} loading="lazy" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />}
              {/* Quick-edit on hover (images only) — edit in one click, no modal/scroll. */}
              {a.media_type !== 'video' && hovered === a.id && (
                <button onClick={(e) => { e.stopPropagation(); setEditing(a) }}
                  style={{ position: 'absolute', top: 8, right: 8, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8, border: 'none', background: 'rgba(108,63,197,0.92)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
                  ✏ Edit
                </button>
              )}
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
          <div onClick={() => { setSelected(null); setAddOpen(false) }} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 49, cursor: 'pointer' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(640px, 92vw)', maxHeight: '88vh', overflowY: 'auto', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-strong)', borderRadius: 16, zIndex: 50 }}>
            {selected.media_type === 'video'
              ? <video src={selected.public_url} controls style={{ width: '100%', display: 'block', borderTopLeftRadius: 16, borderTopRightRadius: 16, background: '#000' }} />
              // eslint-disable-next-line @next/next/no-img-element
              : <img src={selected.public_url} alt={selected.alt_text} style={{ width: '100%', display: 'block', borderTopLeftRadius: 16, borderTopRightRadius: 16 }} />}
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
              {/* Add to Home Carousel — inline form */}
              {addOpen && (
                <div style={{ marginBottom: 12, padding: '12px 14px', borderRadius: 10, backgroundColor: 'var(--bg-surface)', border: '1px solid rgba(0,200,83,0.3)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#00A844', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Add to Home Carousel</p>
                  <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '-2px 0 0' }}>Overlay text is optional — leave blank if the artwork already has the headline.</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {([['Headline', aHeadline, setAHeadline], ['Subtext', aSubtext, setASubtext], ['CTA label', aCta, setACta], ['CTA link', aHref, setAHref]] as [string, string, (v: string) => void][]).map(([lbl, val, set]) => (
                      <div key={lbl}>
                        <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{lbl}</label>
                        <input value={val} onChange={e => set(e.target.value)} style={{ width: '100%', padding: '8px 10px', backgroundColor: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-strong)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={addToCarousel} disabled={adding} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', backgroundColor: '#00C853', color: '#fff', fontSize: 13, fontWeight: 700, cursor: adding ? 'default' : 'pointer' }}>{adding ? 'Adding…' : 'Add slide'}</button>
                    <button onClick={() => setAddOpen(false)} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'transparent', color: 'var(--text-dim)', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Sticky action bar — always reachable without scrolling past the image/metadata */}
              <div style={{ position: 'sticky', bottom: 0, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '4px -20px -20px', padding: '14px 20px', backgroundColor: 'var(--bg-base)', borderTop: '1px solid var(--border)' }}>
                {selected.media_type !== 'video' && (
                  <button onClick={() => { setEditing(selected); setSelected(null); setAddOpen(false) }} style={{ flex: 1, minWidth: 140, padding: '10px 0', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg, #6C3FC5, #9B72E8)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>✏ Edit image</button>
                )}
                <button onClick={() => addOpen ? setAddOpen(false) : openAddForm(selected)} disabled={added} style={{ flex: 1, minWidth: 150, padding: '10px 0', borderRadius: 9, border: 'none', backgroundColor: added ? 'rgba(0,200,83,0.15)' : '#00C853', color: added ? '#00A844' : '#fff', fontSize: 13, fontWeight: 700, cursor: added ? 'default' : 'pointer' }}>
                  {added ? '✓ Added to carousel' : '+ Add to Home Carousel'}
                </button>
                <a href={selected.public_url} download target="_blank" rel="noopener noreferrer" style={{ textAlign: 'center', padding: '10px 14px', borderRadius: 9, border: '1px solid rgba(108,63,197,0.3)', backgroundColor: 'rgba(108,63,197,0.1)', color: '#9B72E8', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>↓ Download</a>
                <button onClick={() => remove(selected.id)} style={{ padding: '10px 16px', borderRadius: 9, border: '1px solid rgba(220,38,38,0.3)', backgroundColor: 'rgba(220,38,38,0.1)', color: '#DC2626', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Delete</button>
                <button onClick={() => { setSelected(null); setAddOpen(false) }} style={{ padding: '10px 16px', borderRadius: 9, border: '1px solid var(--border-strong)', backgroundColor: 'transparent', color: 'var(--text-dim)', fontSize: 13, cursor: 'pointer' }}>Close</button>
              </div>
            </div>
          </div>
        </>
      )}

      {editing && (
        <AssetEditorModal
          asset={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
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
  const brandSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Brand kit lives in Supabase (brand_settings); localStorage is a fast cache/fallback.
  // CRITICAL: only overlay DB fields that actually have content — a blank/seeded DB
  // row must never erase the cached/default kit (that bug wiped everything).
  useEffect(() => {
    let cancelled = false
    const base = loadBrandKit()   // cache, or defaults
    setBrandKitState(base)
    fetch('/api/company/marketing/brand').then(r => r.ok ? r.json() : null).then(d => {
      if (cancelled || !d?.brand) return
      const db = d.brand as Partial<BrandKit>
      const merged: BrandKit = {
        colors:          Array.isArray(db.colors) && db.colors.length ? db.colors : base.colors,
        tone:            db.tone?.trim()            ? db.tone            : base.tone,
        visualStyle:     db.visualStyle?.trim()     ? db.visualStyle     : base.visualStyle,
        logoDescription: db.logoDescription?.trim() ? db.logoDescription : base.logoDescription,
        autoInject:      typeof db.autoInject === 'boolean' ? db.autoInject : base.autoInject,
        logoUrl:         db.logoUrl ?? base.logoUrl ?? null,
      }
      setBrandKitState(merged); saveBrandKit(merged)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Update state + cache immediately; debounce the DB write (PUT) to avoid per-keystroke spam.
  const setBrandKit = (bk: BrandKit) => {
    setBrandKitState(bk); saveBrandKit(bk)
    if (brandSaveRef.current) clearTimeout(brandSaveRef.current)
    brandSaveRef.current = setTimeout(() => {
      fetch('/api/company/marketing/brand', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bk) }).catch(() => {})
    }, 800)
  }

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
