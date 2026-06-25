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
  id:           string
  label:        string
  sublabel:     string
  aspect:       string
  dims:         string
  aspectRatio:  string   // CSS aspect-ratio for preview
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

// ── Constants ─────────────────────────────────────────────────────────────────

const PLATFORM_SIZES: PlatformSize[] = [
  { id: 'web_banner',  label: 'Web Banner',        sublabel: '1920×1080',  aspect: 'ASPECT_16_9',  dims: '1920×1080',  aspectRatio: '16/9'  },
  { id: 'youtube',     label: 'YouTube Cover',      sublabel: '2560×1440',  aspect: 'ASPECT_16_9',  dims: '2560×1440',  aspectRatio: '16/9'  },
  { id: 'twitter',     label: 'X / Twitter',        sublabel: '1500×500',   aspect: 'ASPECT_16_9',  dims: '1500×500',   aspectRatio: '3/1'   },
  { id: 'linkedin',    label: 'LinkedIn Banner',    sublabel: '1584×396',   aspect: 'ASPECT_16_9',  dims: '1584×396',   aspectRatio: '4/1'   },
  { id: 'facebook',    label: 'Facebook Cover',     sublabel: '820×312',    aspect: 'ASPECT_16_9',  dims: '820×312',    aspectRatio: '16/9'  },
  { id: 'instagram',   label: 'Instagram Post',     sublabel: '1080×1080',  aspect: 'ASPECT_1_1',   dims: '1080×1080',  aspectRatio: '1/1'   },
  { id: 'story',       label: 'Story / TikTok',     sublabel: '1080×1920',  aspect: 'ASPECT_9_16',  dims: '1080×1920',  aspectRatio: '9/16'  },
  { id: 'pinterest',   label: 'Pinterest',          sublabel: '1000×1500',  aspect: 'ASPECT_2_3',   dims: '1000×1500',  aspectRatio: '2/3'   },
]

const IDEOGRAM_COST = 0.08   // USD per image, Ideogram V_2

const STYLES = ['DESIGN', 'REALISTIC', 'RENDER_3D', 'ANIME']

const STYLE_DESC: Record<string, string> = {
  DESIGN:    'Graphic design, illustration, UI mockups',
  REALISTIC: 'Photorealistic photography style',
  RENDER_3D: '3D rendered scenes and product shots',
  ANIME:     'Anime / manga illustration style',
}

const PRESETS = [
  {
    label: 'Stadium Hero',
    prompt: 'Cinematic wide-angle shot of a packed football stadium at golden hour, crowd erupting in mass celebration, atmospheric lens flare cutting through crowd, rich emerald green pitch, vibrant energy and motion blur, ultra-detailed sports photography, 8k, Getty Images editorial style',
  },
  {
    label: 'Fintech Night',
    prompt: 'Aerial drone shot of Nairobi or Lagos skyline at night, glowing data-stream visualizations overlaid in emerald and violet arcs connecting city nodes, futuristic fintech aesthetic, cinematic depth of field, ultra-detailed, 8k, award-winning architectural photography',
  },
  {
    label: 'Dashboard 3D',
    prompt: 'Ultra-sleek dark-mode prediction market dashboard UI mockup floating in 3D space, live market odds on glassmorphism cards, deep purple-to-green gradient accents, neon data lines, Apple product photography style, studio lighting, crisp and professional',
  },
  {
    label: 'Player Win',
    prompt: 'Diverse group of young African adults on smartphones celebrating a correct prediction, genuine joy and confetti explosion, vibrant urban backdrop at golden hour, candid documentary photography, warm saturated color grading, Magnum Photos editorial style',
  },
  {
    label: 'Sports Energy',
    prompt: 'Dynamic collage of sports equipment — football, cricket bat, basketball — with electric neon light trails on deep black studio backdrop, product advertising photography, ultra-sharp focus, high contrast, modern sports brand campaign aesthetic',
  },
  {
    label: 'Data Network',
    prompt: 'Abstract global financial network visualization, interconnected glowing nodes spanning Africa and Europe on dark space background, emerald and violet data streams, high-detail 3D render, Beeple digital art style, cinematic atmosphere',
  },
]

// ── Utility ───────────────────────────────────────────────────────────────────

function extractKeywords(prompt: string): string[] {
  const stopWords = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'on', 'in', 'at', 'with', 'for', 'by', 'to'])
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w))
    .slice(0, 12)
}

function buildAltText(prompt: string, platform: PlatformSize): string {
  const snippet = prompt.split(',')[0].replace(/\b(ultra|cinematic|8k|hd|professional)\b/gi, '').trim()
  return `${platform.label} marketing creative — ${snippet}`
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconBullhorn() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M2 7H6L12 3V15L6 11H2V7Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M6 11V15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M15 6.5C15.8 7.3 15.8 10.7 15 11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}

function IconImage() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="6.5" cy="6.5" r="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M2 13L6 9L9 12L12 9L16 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IconUsers() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="7" cy="6" r="3" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M1 16C1 13.2 3.7 11 7 11C10.3 11 13 13.2 13 16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M13 7C14.1 7 15 7.9 15 9C15 10.1 14.1 11 13 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M15 14C16.2 14.5 17 15.7 17 16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}

// ── Tab button ─────────────────────────────────────────────────────────────────

function TabBtn({
  icon, label, active, onClick,
}: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '8px 16px', borderRadius: 10,
        border: `1px solid ${active ? 'rgba(108,63,197,0.5)' : 'rgba(255,255,255,0.08)'}`,
        backgroundColor: active ? 'rgba(108,63,197,0.12)' : 'transparent',
        color: active ? '#9B72E8' : '#6B7280',
        fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s',
      }}
    >
      {icon}
      {label}
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
    setLoading(true)
    setCampaign(null)
    try {
      const res = await fetch('/api/company/marketing/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, segment, channel, extra }),
      })
      if (res.ok) {
        const data = await res.json()
        const c = { ...data.campaign, id: crypto.randomUUID(), generated_at: new Date().toISOString() }
        setCampaign(c)
        setHistory(h => [c, ...h].slice(0, 10))
      }
    } finally {
      setLoading(false)
    }
  }

  const copyAll = () => {
    if (!campaign) return
    const text = `Headline: ${campaign.headline}\n\n${campaign.body}\n\nCTA: ${campaign.cta}`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
      <div style={{
        flex: '0 0 280px', backgroundColor: '#161B22',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16, padding: 20,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <h3 style={{ color: '#E6EDF3', fontSize: 14, fontWeight: 700, margin: 0 }}>Campaign Brief</h3>

        {[
          { label: 'Goal',             value: goal,    onChange: setGoal,    options: GOALS    },
          { label: 'Audience Segment', value: segment, onChange: setSegment, options: SEGMENTS },
          { label: 'Channel',          value: channel, onChange: setChannel, options: CHANNELS },
        ].map(f => (
          <div key={f.label}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              {f.label}
            </label>
            <select
              value={f.value}
              onChange={e => f.onChange(e.target.value)}
              style={{
                width: '100%', padding: '8px 10px',
                backgroundColor: '#0D1117',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8, color: '#E6EDF3', fontSize: 13, cursor: 'pointer', outline: 'none',
              }}
            >
              {f.options.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
        ))}

        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Extra context (optional)
          </label>
          <textarea
            value={extra}
            onChange={e => setExtra(e.target.value)}
            placeholder="e.g. World Cup markets now live, 50% bonus on deposits this weekend…"
            rows={3}
            style={{
              width: '100%', padding: '8px 10px', backgroundColor: '#0D1117',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8, color: '#E6EDF3', fontSize: 12,
              resize: 'vertical', outline: 'none', fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <button
          onClick={generate}
          disabled={loading}
          style={{
            padding: '10px 0', borderRadius: 10,
            background: loading ? 'rgba(108,63,197,0.3)' : 'linear-gradient(135deg, #6C3FC5, #9B72E8)',
            border: 'none', color: '#fff',
            fontSize: 13, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Generating…' : '✦ Generate Campaign'}
        </button>

        {segments.length > 0 && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
            <p style={{ fontSize: 10, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Audience sizes
            </p>
            {segments.map(s => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: '#6B7280' }}>{s.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: s.color }}>{s.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 300, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {campaign ? (
          <div style={{
            backgroundColor: '#161B22',
            border: '1px solid rgba(108,63,197,0.3)',
            borderRadius: 16, padding: 24,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, backgroundColor: 'rgba(108,63,197,0.2)', color: '#9B72E8', marginRight: 8 }}>
                  {channel}
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)', color: '#6B7280' }}>
                  {segment}
                </span>
              </div>
              <button
                onClick={copyAll}
                style={{
                  padding: '6px 12px', borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.1)',
                  backgroundColor: copied ? 'rgba(0,200,83,0.1)' : 'transparent',
                  color: copied ? '#00C853' : '#6B7280',
                  fontSize: 11, cursor: 'pointer',
                }}
              >
                {copied ? '✓ Copied' : 'Copy all'}
              </button>
            </div>
            <h2 style={{ color: '#E6EDF3', fontSize: 20, fontWeight: 800, margin: '0 0 12px', lineHeight: 1.3 }}>
              {campaign.headline}
            </h2>
            <p style={{ color: '#9CA3AF', fontSize: 14, lineHeight: 1.6, margin: '0 0 16px', whiteSpace: 'pre-wrap' }}>
              {campaign.body}
            </p>
            <div style={{
              display: 'inline-block', padding: '10px 20px', borderRadius: 10,
              background: 'linear-gradient(135deg, #6C3FC5, #9B72E8)',
              color: '#fff', fontSize: 13, fontWeight: 700,
            }}>
              {campaign.cta}
            </div>
          </div>
        ) : (
          <div style={{
            backgroundColor: '#161B22', border: '1px dashed rgba(255,255,255,0.08)',
            borderRadius: 16, padding: '60px 40px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
            <span style={{ color: '#374151', fontSize: 32 }}>✦</span>
            <p style={{ color: '#4B5563', fontSize: 14, textAlign: 'center', margin: 0 }}>
              Fill in the brief and click Generate Campaign to create AI-powered copy.
            </p>
          </div>
        )}

        {history.length > 1 && (
          <div>
            <p style={{ fontSize: 11, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Recent ({history.length - 1} more)
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {history.slice(1, 4).map(c => (
                <button
                  key={c.id}
                  onClick={() => setCampaign(c)}
                  style={{
                    padding: '10px 14px', borderRadius: 10,
                    backgroundColor: '#161B22', border: '1px solid rgba(255,255,255,0.06)',
                    textAlign: 'left', cursor: 'pointer',
                  }}
                >
                  <p style={{ color: '#D1D5DB', fontSize: 13, fontWeight: 600, margin: 0 }}>{c.headline}</p>
                  <p style={{ color: '#4B5563', fontSize: 11, margin: '3px 0 0' }}>{c.goal} · {c.segment}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Media Studio ──────────────────────────────────────────────────────────────

function MediaStudio() {
  const [prompt, setPrompt]           = useState('')
  const [enhanced, setEnhanced]       = useState<string | null>(null)
  const [enhancing, setEnhancing]     = useState(false)
  const [style, setStyle]             = useState('DESIGN')
  const [platform, setPlatform]       = useState<PlatformSize>(PLATFORM_SIZES[0])
  const [loading, setLoading]         = useState(false)
  const [progress, setProgress]       = useState(0)
  const [result, setResult]           = useState<ImageMeta | null>(null)
  const [library, setLibrary]         = useState<ImageMeta[]>([])
  const [error, setError]             = useState<string | null>(null)
  const [saved, setSaved]             = useState(false)
  const [resizing, setResizing]       = useState<string | null>(null)   // platform.id being resized to
  const progressRef                   = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load library from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('verdikt_image_library')
      if (stored) setLibrary(JSON.parse(stored))
    } catch { /* ignore */ }
  }, [])

  // Animated progress bar — staged milestones matching typical Ideogram latency
  useEffect(() => {
    if (!loading) {
      if (progressRef.current) clearInterval(progressRef.current)
      return
    }
    setProgress(4)
    const milestones = [10, 22, 38, 55, 70, 82, 89, 93]
    let idx = 0
    progressRef.current = setInterval(() => {
      if (idx < milestones.length) {
        setProgress(milestones[idx++])
      } else {
        clearInterval(progressRef.current!)
      }
    }, 2200)
    return () => { if (progressRef.current) clearInterval(progressRef.current) }
  }, [loading])

  const effectivePrompt = enhanced ?? prompt

  const generate = async (targetPlatform = platform) => {
    if (!effectivePrompt.trim()) return
    setLoading(true)
    setError(null)
    setProgress(0)
    setSaved(false)
    try {
      const res  = await fetch('/api/company/marketing/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt:       effectivePrompt,
          style,
          aspect_ratio: targetPlatform.aspect,
        }),
      })
      const data = await res.json()
      if (res.ok && data.url) {
        setProgress(100)
        const meta: ImageMeta = {
          url:          data.url,
          title:        `${targetPlatform.label} — ${effectivePrompt.slice(0, 50)}`,
          alt_text:     buildAltText(effectivePrompt, targetPlatform),
          keywords:     extractKeywords(effectivePrompt),
          platform:     targetPlatform,
          style,
          prompt:       effectivePrompt,
          generated_at: new Date().toISOString(),
          seed:         data.seed,
        }
        setResult(meta)
        setPlatform(targetPlatform)
      } else {
        setError(data.error ?? 'Image generation failed')
      }
    } catch {
      setError('Network error — check edge function deployment')
    } finally {
      setLoading(false)
    }
  }

  const generateInSize = async (targetPlatform: PlatformSize) => {
    setResizing(targetPlatform.id)
    try {
      await generate(targetPlatform)
    } finally {
      setResizing(null)
    }
  }

  const enhancePrompt = async () => {
    if (!prompt.trim()) return
    setEnhancing(true)
    try {
      const res = await fetch('/api/company/marketing/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, platform: platform.label, style }),
      })
      if (res.ok) {
        const data = await res.json()
        setEnhanced(data.enhanced)
      }
    } finally {
      setEnhancing(false)
    }
  }

  const saveImage = () => {
    if (!result) return
    const updated = [result, ...library.filter(i => i.url !== result.url)].slice(0, 20)
    setLibrary(updated)
    try { localStorage.setItem('verdikt_image_library', JSON.stringify(updated)) } catch { /* ignore */ }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const downloadWithMeta = () => {
    if (!result) return
    // Download image
    const a = document.createElement('a')
    a.href     = result.url
    a.download = `verdikt-${result.platform.id}-${Date.now()}.jpg`
    a.target   = '_blank'
    a.click()

    // Download meta JSON sidecar
    const meta = {
      title:        result.title,
      alt_text:     result.alt_text,
      keywords:     result.keywords,
      platform:     result.platform.label,
      dimensions:   result.platform.dims,
      aspect_ratio: result.platform.aspect,
      style:        result.style,
      prompt:       result.prompt,
      generated_at: result.generated_at,
      seed:         result.seed,
      cost_usd:     IDEOGRAM_COST,
      generator:    'Ideogram V_2',
    }
    const blob = new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' })
    const b    = document.createElement('a')
    b.href     = URL.createObjectURL(blob)
    b.download = `verdikt-${result.platform.id}-${Date.now()}-meta.json`
    b.click()
  }

  const activePrompt = enhanced ?? prompt

  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>

      {/* ── Left panel ───────────────────────────────────────────────────── */}
      <div style={{
        flex: '0 0 300px', backgroundColor: '#161B22',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16, padding: 20,
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>

        {/* Cost indicator */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', borderRadius: 8,
          backgroundColor: 'rgba(108,63,197,0.08)',
          border: '1px solid rgba(108,63,197,0.2)',
        }}>
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>Cost per generation</span>
          <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'monospace', color: '#9B72E8' }}>
            ${IDEOGRAM_COST.toFixed(2)} USD
          </span>
        </div>

        {/* Platform / size selector */}
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Platform & Size
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {PLATFORM_SIZES.map(p => (
              <button
                key={p.id}
                onClick={() => setPlatform(p)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${platform.id === p.id ? 'rgba(108,63,197,0.5)' : 'rgba(255,255,255,0.06)'}`,
                  backgroundColor: platform.id === p.id ? 'rgba(108,63,197,0.12)' : 'transparent',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: platform.id === p.id ? '#9B72E8' : '#9CA3AF' }}>
                  {p.label}
                </span>
                <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#4B5563' }}>{p.dims}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Style */}
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Visual Style
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {STYLES.map(s => (
              <button
                key={s}
                onClick={() => setStyle(s)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '7px 12px', borderRadius: 8,
                  border: `1px solid ${style === s ? 'rgba(108,63,197,0.5)' : 'rgba(255,255,255,0.06)'}`,
                  backgroundColor: style === s ? 'rgba(108,63,197,0.12)' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: style === s ? '#9B72E8' : '#6B7280' }}>{s}</span>
                <span style={{ fontSize: 10, color: '#374151' }}>{STYLE_DESC[s]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Prompt */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Prompt
            </label>
            {enhanced && (
              <button
                onClick={() => setEnhanced(null)}
                style={{ fontSize: 10, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                ✕ Clear enhanced
              </button>
            )}
          </div>
          <textarea
            value={prompt}
            onChange={e => { setPrompt(e.target.value); setEnhanced(null) }}
            placeholder="Describe your creative in a few words…"
            rows={4}
            style={{
              width: '100%', padding: '10px',
              backgroundColor: '#0D1117',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8, color: '#E6EDF3', fontSize: 12,
              resize: 'vertical', outline: 'none', fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
          {/* AI Enhance button */}
          <button
            onClick={enhancePrompt}
            disabled={!prompt.trim() || enhancing}
            style={{
              marginTop: 6, width: '100%', padding: '7px 0', borderRadius: 8,
              border: '1px solid rgba(108,63,197,0.35)',
              backgroundColor: 'rgba(108,63,197,0.08)',
              color: enhancing ? '#4B5563' : '#9B72E8',
              fontSize: 12, fontWeight: 600, cursor: (!prompt.trim() || enhancing) ? 'default' : 'pointer',
            }}
          >
            {enhancing ? '✦ Enhancing…' : '✨ Enhance with AI'}
          </button>
          {enhanced && (
            <div style={{
              marginTop: 8, padding: '8px 10px', borderRadius: 8,
              backgroundColor: 'rgba(0,200,83,0.06)',
              border: '1px solid rgba(0,200,83,0.2)',
            }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#00C853', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                ✓ Enhanced prompt
              </p>
              <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0, lineHeight: 1.5 }}>{enhanced}</p>
            </div>
          )}
        </div>

        {/* Preset library */}
        <div>
          <p style={{ fontSize: 10, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Preset ideas
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => { setPrompt(p.prompt); setEnhanced(null) }}
                style={{
                  padding: '7px 10px', borderRadius: 8, backgroundColor: '#0D1117',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: '#6B7280', fontSize: 11, textAlign: 'left', cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#9CA3AF')}
                onMouseLeave={e => (e.currentTarget.style.color = '#6B7280')}
              >
                <span style={{ color: '#9B72E8', fontWeight: 700, marginRight: 6 }}>{p.label}</span>
                {p.prompt.slice(0, 45)}…
              </button>
            ))}
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={() => generate()}
          disabled={loading || !activePrompt.trim()}
          style={{
            padding: '11px 0', borderRadius: 10,
            background: (loading || !activePrompt.trim())
              ? 'rgba(108,63,197,0.3)'
              : 'linear-gradient(135deg, #6C3FC5, #9B72E8)',
            border: 'none', color: '#fff',
            fontSize: 13, fontWeight: 700,
            cursor: (loading || !activePrompt.trim()) ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Generating…' : `⚡ Generate — $${IDEOGRAM_COST.toFixed(2)}`}
        </button>
      </div>

      {/* ── Right panel ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Image area */}
        {loading ? (
          <div style={{
            position: 'relative',
            backgroundColor: '#161B22',
            borderRadius: 16, overflow: 'hidden',
            border: '1px solid rgba(108,63,197,0.3)',
            aspectRatio: platform.aspectRatio,
          }}>
            {/* Shimmer skeleton */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(90deg, #161B22 0%, #1F2937 50%, #161B22 100%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.6s ease-in-out infinite',
            }} />
            {/* Progress bar */}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              padding: '0 20px 20px',
            }}>
              <div style={{
                backgroundColor: 'rgba(255,255,255,0.06)',
                borderRadius: 999, height: 4, overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: 999,
                  background: 'linear-gradient(90deg, #6C3FC5, #9B72E8)',
                  width: `${progress}%`,
                  transition: 'width 0.8s ease-out',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 11, color: '#6B7280' }}>Ideogram V_2 generating…</span>
                <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: '#9B72E8' }}>
                  {progress}%
                </span>
              </div>
            </div>
          </div>
        ) : result ? (
          <>
            {/* Generated image */}
            <div style={{
              backgroundColor: '#161B22', borderRadius: 16, overflow: 'hidden',
              border: '1px solid rgba(108,63,197,0.3)',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result.url}
                alt={result.alt_text}
                title={result.title}
                style={{ width: '100%', display: 'block' }}
                loading="lazy"
              />

              {/* Action bar */}
              <div style={{
                padding: '14px 18px',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
              }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: '#9B72E8',
                  backgroundColor: 'rgba(108,63,197,0.15)',
                  padding: '3px 10px', borderRadius: 999,
                  border: '1px solid rgba(108,63,197,0.3)',
                }}>
                  {result.platform.label} · {result.platform.dims}
                </span>
                <span style={{ fontSize: 11, color: '#4B5563', flex: 1 }}>
                  {result.style}
                </span>
                <button
                  onClick={saveImage}
                  style={{
                    padding: '7px 14px', borderRadius: 8,
                    border: `1px solid ${saved ? 'rgba(0,200,83,0.4)' : 'rgba(255,255,255,0.1)'}`,
                    backgroundColor: saved ? 'rgba(0,200,83,0.1)' : 'transparent',
                    color: saved ? '#00C853' : '#9CA3AF',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {saved ? '✓ Saved' : '+ Save'}
                </button>
                <button
                  onClick={downloadWithMeta}
                  style={{
                    padding: '7px 14px', borderRadius: 8,
                    border: '1px solid rgba(108,63,197,0.3)',
                    backgroundColor: 'rgba(108,63,197,0.1)',
                    color: '#9B72E8', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  ↓ Download + Meta
                </button>
              </div>
            </div>

            {/* SEO Metadata panel */}
            <div style={{
              backgroundColor: '#161B22',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 14, padding: '16px 20px',
            }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 12px' }}>
                SEO Metadata
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { key: 'Alt Text',    val: result.alt_text },
                  { key: 'Title',       val: result.title },
                  { key: 'Dimensions',  val: result.platform.dims },
                  { key: 'Generated',   val: new Date(result.generated_at).toLocaleString() },
                  { key: 'Cost',        val: `$${IDEOGRAM_COST.toFixed(2)} USD` },
                  { key: 'Model',       val: 'Ideogram V_2' },
                ].map(r => (
                  <div key={r.key} style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                    <span style={{ color: '#4B5563', width: 90, flexShrink: 0 }}>{r.key}</span>
                    <span style={{ color: '#9CA3AF', flex: 1 }}>{r.val}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                  <span style={{ color: '#4B5563', width: 90, flexShrink: 0 }}>Keywords</span>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
                    {result.keywords.map(k => (
                      <span key={k} style={{
                        fontSize: 10, padding: '2px 7px', borderRadius: 999,
                        backgroundColor: 'rgba(255,255,255,0.05)', color: '#6B7280',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}>
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Generate in other sizes */}
            <div style={{
              backgroundColor: '#161B22',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 14, padding: '16px 20px',
            }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 12px' }}>
                Generate in another size — +${IDEOGRAM_COST.toFixed(2)} each
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {PLATFORM_SIZES.filter(p => p.id !== result.platform.id).map(p => (
                  <button
                    key={p.id}
                    onClick={() => generateInSize(p)}
                    disabled={loading || resizing === p.id}
                    style={{
                      padding: '6px 12px', borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.1)',
                      backgroundColor: resizing === p.id ? 'rgba(108,63,197,0.2)' : 'rgba(255,255,255,0.03)',
                      color: resizing === p.id ? '#9B72E8' : '#9CA3AF',
                      fontSize: 11, cursor: (loading || resizing === p.id) ? 'default' : 'pointer',
                      transition: 'all 0.12s',
                    }}
                    onMouseEnter={e => {
                      if (!loading && resizing !== p.id) {
                        e.currentTarget.style.backgroundColor = 'rgba(108,63,197,0.1)'
                        e.currentTarget.style.borderColor = 'rgba(108,63,197,0.4)'
                        e.currentTarget.style.color = '#9B72E8'
                      }
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)'
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                      e.currentTarget.style.color = '#9CA3AF'
                    }}
                  >
                    {resizing === p.id ? '…' : p.label}
                    <span style={{ color: '#374151', marginLeft: 5, fontSize: 10 }}>{p.dims}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : error ? (
          <div style={{
            backgroundColor: '#161B22', borderRadius: 16, padding: '40px',
            border: '1px solid rgba(220,38,38,0.3)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 24 }}>⚠</span>
            <p style={{ color: '#DC2626', fontSize: 14, textAlign: 'center', margin: 0 }}>{error}</p>
          </div>
        ) : (
          <div style={{
            backgroundColor: '#161B22', borderRadius: 16,
            border: '1px dashed rgba(255,255,255,0.08)',
            aspectRatio: platform.aspectRatio,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minHeight: 200,
          }}>
            <div style={{ textAlign: 'center', padding: 20 }}>
              <div style={{ fontSize: 40, color: '#1F2937', marginBottom: 10 }}>🎨</div>
              <p style={{ color: '#4B5563', fontSize: 13, margin: 0 }}>
                Generated creative will appear here.<br />
                Powered by Ideogram V_2 · ${IDEOGRAM_COST.toFixed(2)}/image
              </p>
            </div>
          </div>
        )}

        {/* Session library */}
        {library.length > 0 && (
          <div style={{
            backgroundColor: '#161B22',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14, padding: '16px 20px',
          }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 12px' }}>
              Saved Images ({library.length})
            </p>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {library.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setResult(img)}
                  style={{
                    flex: '0 0 80px', height: 50, borderRadius: 6, overflow: 'hidden', padding: 0,
                    border: result?.url === img.url ? '2px solid #9B72E8' : '2px solid transparent',
                    cursor: 'pointer', backgroundImage: `url(${img.url})`,
                    backgroundSize: 'cover', backgroundPosition: 'center',
                  }}
                  title={img.platform.label}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes shimmer {
          0%   { background-position: -200% 0 }
          100% { background-position: 200% 0 }
        }
      `}</style>
    </div>
  )
}

// ── Audience Segments ─────────────────────────────────────────────────────────

function AudienceSegments({ segments, loading }: { segments: Segment[]; loading: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
        {loading ? (
          [1,2,3,4].map(i => (
            <div key={i} style={{
              height: 120, borderRadius: 14,
              backgroundColor: '#161B22', border: '1px solid rgba(255,255,255,0.06)',
              animation: 'pulse 2s ease-in-out infinite',
            }} />
          ))
        ) : segments.map(s => (
          <div key={s.label} style={{
            backgroundColor: '#161B22',
            border: `1px solid ${s.color}25`,
            borderRadius: 14, padding: '18px 20px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#E6EDF3' }}>{s.label}</span>
              <span style={{ fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color: s.color }}>{s.count}</span>
            </div>
            <p style={{ color: '#6B7280', fontSize: 12, margin: '0 0 6px' }}>{s.description}</p>
            <span style={{
              fontSize: 10, fontWeight: 600, color: s.color, backgroundColor: s.color + '18',
              padding: '2px 8px', borderRadius: 999,
            }}>
              {s.volume_range}
            </span>
          </div>
        ))}
      </div>

      <div style={{
        backgroundColor: '#161B22', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14, padding: '18px 20px',
      }}>
        <h3 style={{ color: '#6B7280', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 14px' }}>
          Suggested Campaigns by Segment
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { segment: '🐋 Whales',  action: 'VIP loyalty reward + exclusive market access', color: '#F59E0B' },
            { segment: '⚡ Active',  action: 'Weekend volume boost challenge + leaderboard',  color: '#6C3FC5' },
            { segment: '😴 Casual',  action: 'Low-risk intro market + guided first prediction', color: '#00C853' },
            { segment: '💤 Inactive', action: 'Win-back push with 2x P&L on first trade back', color: '#9CA3AF' },
          ].map(r => (
            <div key={r.segment} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', borderRadius: 10,
              backgroundColor: '#0D1117', border: '1px solid rgba(255,255,255,0.05)',
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: r.color, minWidth: 80 }}>{r.segment}</span>
              <span style={{ fontSize: 13, color: '#9CA3AF', flex: 1 }}>{r.action}</span>
              <span style={{ fontSize: 12, color: '#374151' }}>→</span>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:0.7} }
      `}</style>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type MarketingSection = 'campaigns' | 'media' | 'segments'

export function MarketingTab() {
  const [section, setSection]     = useState<MarketingSection>('campaigns')
  const [segments, setSegments]   = useState<Segment[]>([])
  const [segLoading, setSegLoading] = useState(true)

  const loadSegments = useCallback(async () => {
    setSegLoading(true)
    try {
      const res = await fetch('/api/company/marketing/segments')
      if (res.ok) {
        const data = await res.json()
        setSegments(data.segments ?? [])
      }
    } finally {
      setSegLoading(false)
    }
  }, [])

  useEffect(() => { loadSegments() }, [loadSegments])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <TabBtn icon={<IconBullhorn />} label="Campaign Generator" active={section === 'campaigns'} onClick={() => setSection('campaigns')} />
        <TabBtn icon={<IconImage />}    label="Media Studio"       active={section === 'media'}     onClick={() => setSection('media')} />
        <TabBtn icon={<IconUsers />}    label="Audience Segments"  active={section === 'segments'}  onClick={() => setSection('segments')} />
      </div>

      <div style={{
        padding: '10px 16px', borderRadius: 10,
        backgroundColor: 'rgba(108,63,197,0.08)',
        border: '1px solid rgba(108,63,197,0.2)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ color: '#9B72E8' }}>
          {section === 'campaigns' ? <IconBullhorn /> : section === 'media' ? <IconImage /> : <IconUsers />}
        </span>
        <span style={{ color: '#9CA3AF', fontSize: 13 }}>
          {section === 'campaigns' && 'Generate AI-powered campaign copy for any channel, goal, and audience in seconds.'}
          {section === 'media' && 'Generate professional marketing visuals using Ideogram AI — 8 platform sizes, AI prompt enhancement, SEO metadata export.'}
          {section === 'segments' && 'Player segments auto-computed from trading activity. Use these to target campaigns precisely.'}
        </span>
      </div>

      {section === 'campaigns' && <CampaignGenerator segments={segments} />}
      {section === 'media'     && <MediaStudio />}
      {section === 'segments'  && <AudienceSegments segments={segments} loading={segLoading} />}
    </div>
  )
}
