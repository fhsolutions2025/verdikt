'use client'

import { useState, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

interface Headline {
  title:       string
  description: string
  pubDate:     string
  link:        string
  source:      string
}

interface MarketDraft {
  question:          string
  yes_price:         number
  no_price:          number
  closes_at:         string
  resolution_source: string
  rationale:         string
  ai_confidence:     number
}

type HeadlineState =
  | { status: 'idle' }
  | { status: 'generating' }
  | { status: 'not_viable' }
  | { status: 'preview';   draft: MarketDraft }
  | { status: 'published'; question: string }
  | { status: 'error';     message: string }

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; items: Headline[]; feedLabel: string }
  | { status: 'error'; message: string }

// ── Constants ────────────────────────────────────────────────────────────────

const FEEDS = [
  { id: 'google-news', label: '🌐 Google News' },
  { id: 'bbc',         label: '🔴 BBC World'   },
  { id: 'al-jazeera', label: '🟢 Al Jazeera'  },
  { id: 'reuters',     label: '🟠 Reuters'      },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatPubDate(raw: string): string {
  if (!raw) return ''
  try {
    const d = new Date(raw)
    if (isNaN(d.getTime())) return raw
    const now  = Date.now()
    const diff = now - d.getTime()
    if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  } catch { return raw }
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Spinner() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 14, height: 14,
        border: '2px solid var(--border-strong)',
        borderTopColor: '#00C853',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
        flexShrink: 0,
      }}
    />
  )
}

interface HeadlineCardProps {
  item:       Headline
  state:      HeadlineState
  isSelected: boolean
  onGenerate: () => void
  onSelect:   () => void
}

function HeadlineCard({ item, state, isSelected, onGenerate, onSelect }: HeadlineCardProps) {
  const isGenerating = state.status === 'generating'
  const isPublished  = state.status === 'published'
  const isNotViable  = state.status === 'not_viable'
  const isError      = state.status === 'error'
  const hasPreview   = state.status === 'preview'

  let borderColor = isSelected ? '#00C853' : 'var(--border-strong)'
  if (isPublished) borderColor = '#238636'
  if (isNotViable || isError) borderColor = 'var(--text-dim)'

  return (
    <div
      onClick={isPublished || isNotViable ? undefined : onSelect}
      style={{
        border:        `1px solid ${borderColor}`,
        borderRadius:  10,
        padding:       '12px 14px',
        backgroundColor: isSelected ? 'rgba(0,200,83,0.10)' : 'var(--bg-surface)',
        cursor:        isPublished || isNotViable ? 'default' : 'pointer',
        transition:    'border-color 0.15s, background-color 0.15s',
        opacity:       isPublished || isNotViable ? 0.55 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Title + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              color:       isPublished ? '#57AB5A' : 'var(--text-strong)',
              fontSize:    13,
              fontWeight:  600,
              lineHeight:  1.4,
              marginBottom: 6,
            }}
          >
            {isPublished
              ? `✓ Published: "${state.question.slice(0, 80)}${state.question.length > 80 ? '…' : ''}"`
              : item.title}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {item.source && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                {item.source}
              </span>
            )}
            {item.pubDate && (
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {formatPubDate(item.pubDate)}
              </span>
            )}
            {isNotViable && (
              <span style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>
                Not viable for prediction market
              </span>
            )}
            {isError && (
              <span style={{ fontSize: 11, color: '#F85149' }}>
                {(state as { status: 'error'; message: string }).message.slice(0, 80)}
              </span>
            )}
          </div>
        </div>

        {/* Action button */}
        {!isPublished && !isNotViable && (
          <button
            onClick={e => { e.stopPropagation(); onGenerate() }}
            disabled={isGenerating}
            style={{
              flexShrink:      0,
              display:         'flex',
              alignItems:      'center',
              gap:             6,
              padding:         '5px 12px',
              borderRadius:    6,
              fontSize:        12,
              fontWeight:      600,
              cursor:          isGenerating ? 'default' : 'pointer',
              backgroundColor: isGenerating ? 'var(--bg-surface)' : hasPreview ? 'rgba(0,200,83,0.14)' : 'var(--bg-surface)',
              border:          `1px solid ${hasPreview ? '#238636' : 'var(--border-strong)'}`,
              color:           hasPreview ? '#57AB5A' : 'var(--text-muted)',
              transition:      'all 0.15s',
              whiteSpace:      'nowrap',
            }}
          >
            {isGenerating ? (
              <><Spinner /> Thinking…</>
            ) : hasPreview ? (
              '↻ Redo'
            ) : (
              '→ Generate'
            )}
          </button>
        )}
      </div>
    </div>
  )
}

interface PreviewPanelProps {
  draft:    MarketDraft
  onChange: (d: MarketDraft) => void
  onPublish: () => void
  onCancel:  () => void
  publishing: boolean
  publishError: string | null
}

function PreviewPanel({ draft, onChange, onPublish, onCancel, publishing, publishError }: PreviewPanelProps) {
  const yp = draft.yes_price
  const np = draft.no_price

  return (
    <div
      style={{
        border:          '1px solid #00C853',
        borderRadius:    12,
        backgroundColor: 'rgba(0,200,83,0.08)',
        padding:         20,
        marginTop:       16,
      }}
    >
      <p style={{ color: '#00C853', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 16 }}>
        ✦ MARKET PREVIEW
      </p>

      {/* Question */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5 }}>
          QUESTION
        </label>
        <textarea
          value={draft.question}
          onChange={e => onChange({ ...draft, question: e.target.value })}
          rows={2}
          style={{
            width:           '100%',
            backgroundColor: 'var(--bg-surface)',
            border:          '1px solid var(--border-strong)',
            borderRadius:    8,
            color:           'var(--text-strong)',
            fontSize:        14,
            fontWeight:      600,
            padding:         '10px 12px',
            resize:          'vertical',
            outline:         'none',
            fontFamily:      'inherit',
            lineHeight:      1.4,
            boxSizing:       'border-box',
          }}
        />
      </div>

      {/* YES / NO prices */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 8 }}>
          PROBABILITY  —  YES: <span style={{ color: '#00C853' }}>{yp}¢</span>  /  NO: <span style={{ color: '#E05C20' }}>{np}¢</span>
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', width: 22 }}>5</span>
          <input
            type="range"
            min={5} max={95} step={1}
            value={yp}
            onChange={e => {
              const v = Number(e.target.value)
              onChange({ ...draft, yes_price: v, no_price: 100 - v })
            }}
            style={{ flex: 1, accentColor: '#00C853', cursor: 'pointer' }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-dim)', width: 22, textAlign: 'right' }}>95</span>
        </div>
        {/* Visual bar */}
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 8 }}>
          <div style={{ width: `${yp}%`, backgroundColor: '#00C853', transition: 'width 0.1s' }} />
          <div style={{ flex: 1, backgroundColor: '#E05C20' }} />
        </div>
      </div>

      {/* Closes at */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <label style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5 }}>
            CLOSES AT
          </label>
          <input
            type="date"
            value={draft.closes_at}
            onChange={e => onChange({ ...draft, closes_at: e.target.value })}
            style={{
              width:           '100%',
              backgroundColor: 'var(--bg-surface)',
              border:          '1px solid var(--border-strong)',
              borderRadius:    8,
              color:           'var(--text-strong)',
              fontSize:        13,
              padding:         '8px 10px',
              outline:         'none',
              boxSizing:       'border-box',
            }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5 }}>
            AI CONFIDENCE
          </label>
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border:          '1px solid var(--border-strong)',
              borderRadius:    8,
              padding:         '8px 10px',
              fontSize:        13,
              color:           draft.ai_confidence >= 70 ? '#57AB5A' : draft.ai_confidence >= 55 ? '#D29922' : '#E05C20',
              fontWeight:      700,
              fontFamily:      'monospace',
            }}
          >
            {draft.ai_confidence}%
          </div>
        </div>
      </div>

      {/* Resolution source */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5 }}>
          RESOLUTION SOURCE
        </label>
        <input
          type="text"
          value={draft.resolution_source}
          onChange={e => onChange({ ...draft, resolution_source: e.target.value })}
          style={{
            width:           '100%',
            backgroundColor: 'var(--bg-surface)',
            border:          '1px solid var(--border-strong)',
            borderRadius:    8,
            color:           'var(--text-strong)',
            fontSize:        13,
            padding:         '8px 10px',
            outline:         'none',
            fontFamily:      'inherit',
            boxSizing:       'border-box',
          }}
        />
      </div>

      {/* Rationale (read-only) */}
      {draft.rationale && (
        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            border:          '1px solid var(--border-strong)',
            borderRadius:    8,
            padding:         '10px 12px',
            marginBottom:    14,
          }}
        >
          <p style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 3, fontWeight: 600 }}>
            HAIKU RATIONALE
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {draft.rationale}
          </p>
        </div>
      )}

      {/* Status route notice */}
      <p style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 14 }}>
        Market enters <code style={{ color: 'var(--text-muted)' }}>pending_ai</code> → normalize-byv sets confidence → MM approval → <code style={{ color: '#00C853' }}>live</code>
      </p>

      {/* Error */}
      {publishError && (
        <div
          style={{
            backgroundColor: 'rgba(220,38,38,0.08)',
            border:          '1px solid #F85149',
            borderRadius:    8,
            padding:         '8px 12px',
            marginBottom:    12,
          }}
        >
          <p style={{ color: '#F85149', fontSize: 12 }}>{publishError}</p>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={onPublish}
          disabled={publishing || !draft.question.trim()}
          style={{
            flex:            1,
            padding:         '10px 0',
            borderRadius:    8,
            fontSize:        13,
            fontWeight:      700,
            cursor:          publishing ? 'default' : 'pointer',
            backgroundColor: publishing ? 'var(--bg-surface)' : '#00C853',
            border:          'none',
            color:           publishing ? 'var(--text-dim)' : 'var(--bg-base)',
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
            gap:             6,
          }}
        >
          {publishing ? <><Spinner /> Publishing…</> : '↑ Publish Market'}
        </button>
        <button
          onClick={onCancel}
          disabled={publishing}
          style={{
            padding:         '10px 20px',
            borderRadius:    8,
            fontSize:        13,
            fontWeight:      600,
            cursor:          'pointer',
            backgroundColor: 'transparent',
            border:          '1px solid var(--border-strong)',
            color:           'var(--text-muted)',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function NewsMarketCreator() {
  const [selectedFeed,  setSelectedFeed]  = useState('google-news')
  const [fetchState,    setFetchState]    = useState<FetchState>({ status: 'idle' })
  const [headlineStates, setHeadlineStates] = useState<Record<number, HeadlineState>>({})
  const [selectedIdx,   setSelectedIdx]   = useState<number | null>(null)
  const [publishing,    setPublishing]    = useState(false)
  const [publishError,  setPublishError]  = useState<string | null>(null)

  // ── Fetch headlines ────────────────────────────────────────────
  const fetchHeadlines = useCallback(async () => {
    setFetchState({ status: 'loading' })
    setHeadlineStates({})
    setSelectedIdx(null)

    try {
      const res  = await fetch(`/api/rss-fetch?feed=${selectedFeed}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setFetchState({ status: 'loaded', items: data.items, feedLabel: data.feed })
    } catch (err) {
      setFetchState({
        status:  'error',
        message: err instanceof Error ? err.message : 'Failed to fetch feed',
      })
    }
  }, [selectedFeed])

  // ── Generate market for a headline ────────────────────────────
  const generateMarket = useCallback(async (item: Headline, idx: number) => {
    setSelectedIdx(idx)
    setHeadlineStates(prev => ({ ...prev, [idx]: { status: 'generating' } }))

    try {
      const res  = await fetch('/api/generate-market', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ title: item.title, description: item.description }),
      })
      const data = await res.json()

      if (!res.ok) {
        setHeadlineStates(prev => ({
          ...prev,
          [idx]: { status: 'error', message: data.error ?? `HTTP ${res.status}` },
        }))
        return
      }

      if (!data.viable) {
        setHeadlineStates(prev => ({ ...prev, [idx]: { status: 'not_viable' } }))
        setSelectedIdx(null)
        return
      }

      setHeadlineStates(prev => ({
        ...prev,
        [idx]: { status: 'preview', draft: data as MarketDraft },
      }))
    } catch (err) {
      setHeadlineStates(prev => ({
        ...prev,
        [idx]: {
          status:  'error',
          message: err instanceof Error ? err.message : 'Generate failed',
        },
      }))
    }
  }, [])

  // ── Update draft in preview ────────────────────────────────────
  const updateDraft = useCallback((idx: number, draft: MarketDraft) => {
    setHeadlineStates(prev => ({ ...prev, [idx]: { status: 'preview', draft } }))
  }, [])

  // ── Publish market ─────────────────────────────────────────────
  const publishMarket = useCallback(async (idx: number, draft: MarketDraft) => {
    setPublishing(true)
    setPublishError(null)

    try {
      const res  = await fetch('/api/publish-market', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(draft),
      })
      const data = await res.json()

      if (!res.ok) {
        setPublishError(data.error ?? `HTTP ${res.status}`)
        return
      }

      setHeadlineStates(prev => ({
        ...prev,
        [idx]: { status: 'published', question: draft.question },
      }))
      setSelectedIdx(null)
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Publish failed')
    } finally {
      setPublishing(false)
    }
  }, [])

  // ── Cancel preview ─────────────────────────────────────────────
  const cancelPreview = useCallback((idx: number) => {
    setHeadlineStates(prev => ({ ...prev, [idx]: { status: 'idle' } }))
    setSelectedIdx(null)
    setPublishError(null)
  }, [])

  // ── Render ─────────────────────────────────────────────────────

  const items = fetchState.status === 'loaded' ? fetchState.items : []

  const publishedCount = Object.values(headlineStates).filter(s => s.status === 'published').length

  return (
    <section
      style={{
        backgroundColor: 'var(--bg-surface)',
        border:          '1px solid var(--border-strong)',
        borderRadius:    12,
        overflow:        'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding:         '16px 20px',
          borderBottom:    '1px solid var(--border-strong)',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'space-between',
          gap:             12,
        }}
      >
        <div>
          <p style={{ color: 'var(--text-strong)', fontSize: 14, fontWeight: 700, marginBottom: 2 }}>
            News → Market
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            Curate headlines and generate prediction markets with one click
          </p>
        </div>
        {publishedCount > 0 && (
          <span
            style={{
              backgroundColor: 'rgba(0,200,83,0.12)',
              border:          '1px solid #238636',
              borderRadius:    20,
              padding:         '3px 10px',
              fontSize:        11,
              color:           '#57AB5A',
              fontWeight:      700,
              whiteSpace:      'nowrap',
            }}
          >
            {publishedCount} published this session
          </span>
        )}
      </div>

      <div style={{ padding: 20 }}>

        {/* Feed selector */}
        <div style={{ marginBottom: 14 }}>
          <p style={{ color: 'var(--text-dim)', fontSize: 11, fontWeight: 600, marginBottom: 8, letterSpacing: '0.06em' }}>
            SELECT FEED
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {FEEDS.map(f => (
              <button
                key={f.id}
                onClick={() => {
                  setSelectedFeed(f.id)
                  setFetchState({ status: 'idle' })
                  setHeadlineStates({})
                  setSelectedIdx(null)
                }}
                style={{
                  padding:         '5px 12px',
                  borderRadius:    20,
                  fontSize:        12,
                  fontWeight:      600,
                  cursor:          'pointer',
                  backgroundColor: selectedFeed === f.id ? '#00C853' : 'var(--bg-surface)',
                  border:          `1px solid ${selectedFeed === f.id ? '#00C853' : 'var(--border-strong)'}`,
                  color:           selectedFeed === f.id ? 'var(--bg-base)' : 'var(--text-muted)',
                  transition:      'all 0.15s',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Fetch button */}
        <button
          onClick={fetchHeadlines}
          disabled={fetchState.status === 'loading'}
          style={{
            width:           '100%',
            padding:         '10px 0',
            borderRadius:    8,
            fontSize:        13,
            fontWeight:      700,
            cursor:          fetchState.status === 'loading' ? 'default' : 'pointer',
            backgroundColor: fetchState.status === 'loading' ? 'var(--bg-surface)' : 'var(--bg-surface)',
            border:          '1px solid var(--border-strong)',
            color:           fetchState.status === 'loading' ? 'var(--text-dim)' : 'var(--text-strong)',
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
            gap:             8,
            marginBottom:    16,
          }}
        >
          {fetchState.status === 'loading' ? (
            <><Spinner /> Fetching headlines…</>
          ) : fetchState.status === 'loaded' ? (
            '↻ Refresh Headlines'
          ) : (
            '↓ Fetch Latest Headlines'
          )}
        </button>

        {/* Fetch error */}
        {fetchState.status === 'error' && (
          <div
            style={{
              backgroundColor: 'rgba(220,38,38,0.08)',
              border:          '1px solid #F85149',
              borderRadius:    8,
              padding:         '10px 14px',
              marginBottom:    16,
            }}
          >
            <p style={{ color: '#F85149', fontSize: 12, fontWeight: 600 }}>
              Failed to load feed
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 3 }}>
              {fetchState.message}
            </p>
          </div>
        )}

        {/* Headlines list */}
        {fetchState.status === 'loaded' && items.length > 0 && (
          <div>
            <p style={{ color: 'var(--text-dim)', fontSize: 11, fontWeight: 600, marginBottom: 10, letterSpacing: '0.06em' }}>
              {fetchState.feedLabel.toUpperCase()} — {items.length} HEADLINES
              <span style={{ color: 'var(--border-strong)', marginLeft: 8 }}>
                · click a headline to select, then Generate
              </span>
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((item, idx) => {
                const st = headlineStates[idx] ?? { status: 'idle' as const }
                return (
                  <div key={idx}>
                    <HeadlineCard
                      item={item}
                      state={st}
                      isSelected={selectedIdx === idx}
                      onSelect={() => {
                        if (selectedIdx !== idx) {
                          setSelectedIdx(idx)
                          setPublishError(null)
                        }
                      }}
                      onGenerate={() => generateMarket(item, idx)}
                    />

                    {/* Preview panel renders inline, directly under the headline it belongs to */}
                    {selectedIdx === idx && st.status === 'preview' && (
                      <PreviewPanel
                        draft={st.draft}
                        onChange={d => updateDraft(idx, d)}
                        onPublish={() => publishMarket(idx, st.draft)}
                        onCancel={() => cancelPreview(idx)}
                        publishing={publishing}
                        publishError={publishError}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {fetchState.status === 'loaded' && items.length === 0 && (
          <p style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
            No headlines returned from feed.
          </p>
        )}

      </div>

      {/* Spin animation */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </section>
  )
}
