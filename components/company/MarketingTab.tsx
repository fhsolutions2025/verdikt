'use client'

import { useCallback, useEffect, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Segment {
  label:        string
  count:        number
  description:  string
  volume_range: string
  color:        string
}

interface Campaign {
  id:          string
  goal:        string
  segment:     string
  channel:     string
  headline:    string
  body:        string
  cta:         string
  generated_at: string
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

const GOALS = ['Reactivate churned players', 'Onboard new players', 'Boost volume', 'Promote new markets', 'VIP retention', 'Referral drive']
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
      {/* Controls */}
      <div style={{
        flex: '0 0 280px',
        backgroundColor: '#161B22',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16, padding: 20,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <h3 style={{ color: '#E6EDF3', fontSize: 14, fontWeight: 700, margin: 0 }}>Campaign Brief</h3>

        {[
          { label: 'Goal', value: goal, onChange: setGoal, options: GOALS },
          { label: 'Audience Segment', value: segment, onChange: setSegment, options: SEGMENTS },
          { label: 'Channel', value: channel, onChange: setChannel, options: CHANNELS },
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
              width: '100%', padding: '8px 10px',
              backgroundColor: '#0D1117',
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
            transition: 'opacity 0.12s',
          }}
        >
          {loading ? 'Generating…' : '✦ Generate Campaign'}
        </button>

        {/* Segment ref */}
        {segments.length > 0 && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
            <p style={{ fontSize: 10, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Audience sizes
            </p>
            {segments.map(s => (
              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: '#6B7280' }}>{s.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: s.color }}>
                  {s.count}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Output */}
      <div style={{ flex: 1, minWidth: 300, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {campaign ? (
          <div style={{
            backgroundColor: '#161B22',
            border: '1px solid rgba(108,63,197,0.3)',
            borderRadius: 16, padding: 24,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                  backgroundColor: 'rgba(108,63,197,0.2)', color: '#9B72E8', marginRight: 8,
                }}>
                  {channel}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                  backgroundColor: 'rgba(255,255,255,0.06)', color: '#6B7280',
                }}>
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
              display: 'inline-block',
              padding: '10px 20px', borderRadius: 10,
              background: 'linear-gradient(135deg, #6C3FC5, #9B72E8)',
              color: '#fff', fontSize: 13, fontWeight: 700,
            }}>
              {campaign.cta}
            </div>
          </div>
        ) : (
          <div style={{
            backgroundColor: '#161B22',
            border: '1px dashed rgba(255,255,255,0.08)',
            borderRadius: 16, padding: '60px 40px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
            <span style={{ color: '#374151', fontSize: 32 }}>✦</span>
            <p style={{ color: '#4B5563', fontSize: 14, textAlign: 'center', margin: 0 }}>
              Fill in the brief and click Generate Campaign to create AI-powered copy.
            </p>
          </div>
        )}

        {/* History */}
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
                    backgroundColor: '#161B22',
                    border: '1px solid rgba(255,255,255,0.06)',
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

// ── Media Studio ─────────────────────────────────────────────────────────────

function MediaStudio() {
  const [prompt, setPrompt]     = useState('')
  const [style, setStyle]       = useState('REALISTIC')
  const [loading, setLoading]   = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)

  const STYLES = ['REALISTIC', 'DESIGN', 'RENDER_3D', 'ANIME']
  const PRESETS = [
    'Sports betting platform marketing banner, dark background, green neon accents',
    'Abstract financial market heatmap visualization, futuristic dark theme',
    'Football players celebrating victory, cinematic, vibrant colors',
    'Prediction market platform hero image, glassmorphism UI, purple gradient',
  ]

  const generate = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    setError(null)
    setImageUrl(null)
    try {
      const res = await fetch('/api/company/marketing/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, style }),
      })
      const data = await res.json()
      if (res.ok && data.url) {
        setImageUrl(data.url)
      } else {
        setError(data.error ?? 'Image generation failed')
      }
    } catch {
      setError('Network error — check edge function deployment')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
      {/* Controls */}
      <div style={{
        flex: '0 0 280px',
        backgroundColor: '#161B22',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16, padding: 20,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <h3 style={{ color: '#E6EDF3', fontSize: 14, fontWeight: 700, margin: 0 }}>Creative Brief</h3>

        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Style
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STYLES.map(s => (
              <button
                key={s}
                onClick={() => setStyle(s)}
                style={{
                  padding: '4px 10px', borderRadius: 8,
                  border: `1px solid ${style === s ? 'rgba(108,63,197,0.5)' : 'rgba(255,255,255,0.08)'}`,
                  backgroundColor: style === s ? 'rgba(108,63,197,0.15)' : 'transparent',
                  color: style === s ? '#9B72E8' : '#6B7280',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Prompt
          </label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Describe your creative…"
            rows={5}
            style={{
              width: '100%', padding: '10px',
              backgroundColor: '#0D1117',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8, color: '#E6EDF3', fontSize: 12,
              resize: 'vertical', outline: 'none', fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div>
          <p style={{ fontSize: 10, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Quick presets
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {PRESETS.map((p, i) => (
              <button
                key={i}
                onClick={() => setPrompt(p)}
                style={{
                  padding: '7px 10px', borderRadius: 8,
                  backgroundColor: '#0D1117',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: '#6B7280', fontSize: 11, textAlign: 'left', cursor: 'pointer',
                  transition: 'color 0.12s',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#9CA3AF')}
                onMouseLeave={e => (e.currentTarget.style.color = '#6B7280')}
              >
                {p.slice(0, 55)}…
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={generate}
          disabled={loading || !prompt.trim()}
          style={{
            padding: '10px 0', borderRadius: 10,
            background: (loading || !prompt.trim()) ? 'rgba(108,63,197,0.3)' : 'linear-gradient(135deg, #6C3FC5, #9B72E8)',
            border: 'none', color: '#fff',
            fontSize: 13, fontWeight: 700, cursor: (loading || !prompt.trim()) ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Generating…' : '⚡ Generate Image'}
        </button>
      </div>

      {/* Output */}
      <div style={{ flex: 1, minWidth: 300 }}>
        {loading ? (
          <div style={{
            backgroundColor: '#161B22', borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.08)',
            aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                border: '2px solid rgba(108,63,197,0.3)',
                borderTopColor: '#6C3FC5',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 12px',
              }} />
              <p style={{ color: '#6B7280', fontSize: 13 }}>Generating creative…</p>
            </div>
          </div>
        ) : imageUrl ? (
          <div style={{
            backgroundColor: '#161B22', borderRadius: 16, overflow: 'hidden',
            border: '1px solid rgba(108,63,197,0.3)',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="Generated marketing creative" style={{ width: '100%', display: 'block' }} />
            <div style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ color: '#6B7280', fontSize: 12, margin: 0 }}>Style: {style}</p>
              <a
                href={imageUrl}
                download="marketing-creative.jpg"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '7px 14px', borderRadius: 8,
                  backgroundColor: 'rgba(108,63,197,0.15)',
                  border: '1px solid rgba(108,63,197,0.3)',
                  color: '#9B72E8', fontSize: 12, fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                ↓ Download
              </a>
            </div>
          </div>
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
            aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, color: '#1F2937', marginBottom: 10 }}>🎨</div>
              <p style={{ color: '#4B5563', fontSize: 13 }}>
                Your generated creative will appear here.<br/>
                Powered by Ideogram AI.
              </p>
            </div>
          </div>
        )}
      </div>
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
              <span style={{
                fontSize: 20, fontWeight: 800, fontFamily: 'monospace', color: s.color,
              }}>{s.count}</span>
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
        backgroundColor: '#161B22',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14, padding: '18px 20px',
      }}>
        <h3 style={{ color: '#6B7280', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 14px' }}>
          Suggested Campaigns by Segment
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { segment: '🐋 Whales', action: 'VIP loyalty reward + exclusive market access', color: '#F59E0B' },
            { segment: '⚡ Active', action: 'Weekend volume boost challenge + leaderboard', color: '#6C3FC5' },
            { segment: '😴 Casual', action: 'Low-risk intro market + guided first prediction', color: '#00C853' },
            { segment: '💤 Inactive', action: 'Win-back push with 2x P&L on first trade back', color: '#9CA3AF' },
          ].map(r => (
            <div key={r.segment} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '10px 14px', borderRadius: 10,
              backgroundColor: '#0D1117',
              border: '1px solid rgba(255,255,255,0.05)',
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: r.color, minWidth: 80 }}>{r.segment}</span>
              <span style={{ fontSize: 13, color: '#9CA3AF', flex: 1 }}>{r.action}</span>
              <span style={{ fontSize: 12, color: '#374151' }}>→</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type MarketingSection = 'campaigns' | 'media' | 'segments'

export function MarketingTab() {
  const [section, setSection]   = useState<MarketingSection>('campaigns')
  const [segments, setSegments] = useState<Segment[]>([])
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
      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <TabBtn icon={<IconBullhorn />} label="Campaign Generator" active={section === 'campaigns'} onClick={() => setSection('campaigns')} />
        <TabBtn icon={<IconImage />}    label="Media Studio"       active={section === 'media'}     onClick={() => setSection('media')} />
        <TabBtn icon={<IconUsers />}    label="Audience Segments"  active={section === 'segments'}  onClick={() => setSection('segments')} />
      </div>

      {/* Section label */}
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
          {section === 'media' && 'Generate professional marketing visuals using Ideogram AI — banners, creatives, social assets.'}
          {section === 'segments' && 'Player segments auto-computed from trading activity. Use these to target campaigns precisely.'}
        </span>
      </div>

      {section === 'campaigns' && <CampaignGenerator segments={segments} />}
      {section === 'media'     && <MediaStudio />}
      {section === 'segments'  && <AudienceSegments segments={segments} loading={segLoading} />}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:0.7} }
        @keyframes spin  { to{transform:rotate(360deg)} }
      `}</style>
    </div>
  )
}
