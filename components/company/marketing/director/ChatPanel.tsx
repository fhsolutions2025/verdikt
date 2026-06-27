'use client'

// Campaign Director — LEFT conversational chat column of the two-pane workspace.
// Owns the interview flow (one step at a time), renders an assistant transcript with
// selectable MCQ option cards, and a pinned composer at the bottom.

import React from 'react'
import {
  INTERVIEW,
  buildBrief,
  isComplete,
  type InterviewAnswers,
  type InterviewOption,
  type InterviewStep,
} from '@/lib/marketing/directorInterview'
import {
  ACCENT,
  PURPLE,
  PURPLE_LIGHT,
  GRADIENT,
  S,
  Btn,
  Avatar,
  Dot,
  TypingDots,
} from '@/components/company/marketing/director/theme'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function ChatPanel({
  brands,
  regions,
  onSubmitBrief,
  submitting,
  started,
}: {
  brands: { id: string; name: string }[]
  regions: { region: string; framing: string }[]
  onSubmitBrief: (brandId: string, answers: InterviewAnswers) => void
  submitting: boolean
  started: boolean
}): React.JSX.Element {
  const [stepIdx, setStepIdx] = React.useState(0)
  const [answers, setAnswers] = React.useState<InterviewAnswers>({})
  const [custom, setCustom] = React.useState('')
  const [typing, setTyping] = React.useState(true)   // brief "typing…" reveal per question

  const total = INTERVIEW.length
  const step = INTERVIEW[Math.min(stepIdx, total - 1)]
  const isLast = stepIdx >= total - 1
  const complete = isComplete(answers)

  const scrollRef = React.useRef<HTMLDivElement | null>(null)
  React.useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [stepIdx, started, submitting, typing])

  // Stream each question in: show a short "typing…" indicator, then reveal the step.
  React.useEffect(() => {
    if (started) return
    setTyping(true)
    const t = setTimeout(() => setTyping(false), 650)
    return () => clearTimeout(t)
  }, [stepIdx, started])

  // ── Dynamic option resolution ──────────────────────────────────────────────
  const optionsFor = React.useCallback(
    (s: InterviewStep): InterviewOption[] => {
      if (s.dynamicOptions === 'brands') return brands.map(b => ({ value: b.id, label: b.name }))
      if (s.dynamicOptions === 'regions')
        return regions.map(r => ({ value: r.region, label: `${r.region} (${r.framing})` }))
      return s.options ?? []
    },
    [brands, regions],
  )

  const labelFor = React.useCallback(
    (s: InterviewStep, value: string): string => {
      const opt = optionsFor(s).find(o => o.value === value)
      return opt ? opt.label : value
    },
    [optionsFor],
  )

  const displayAnswer = React.useCallback(
    (s: InterviewStep): string => {
      const v = answers[s.id]
      if (v === undefined || v === '') return s.optional ? '(skipped)' : ''
      if (Array.isArray(v)) return v.map(x => labelFor(s, x)).join(', ')
      if (s.kind === 'text') return v
      return labelFor(s, v)
    },
    [answers, labelFor],
  )

  // ── Mutations ───────────────────────────────────────────────────────────────
  const setSingle = (value: string) => {
    setAnswers(prev => ({ ...prev, [step.id]: value }))
  }
  const toggleMulti = (value: string) => {
    setAnswers(prev => {
      const cur = Array.isArray(prev[step.id]) ? (prev[step.id] as string[]) : []
      const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value]
      return { ...prev, [step.id]: next }
    })
  }
  const setText = (value: string) => {
    setAnswers(prev => ({ ...prev, [step.id]: value }))
  }
  const addCustom = () => {
    const v = custom.trim()
    if (!v) return
    if (step.kind === 'multi') {
      setAnswers(prev => {
        const cur = Array.isArray(prev[step.id]) ? (prev[step.id] as string[]) : []
        return cur.includes(v) ? prev : { ...prev, [step.id]: [...cur, v] }
      })
    } else {
      setSingle(v)
    }
    setCustom('')
  }

  const goBack = () => {
    setCustom('')
    setStepIdx(i => Math.max(0, i - 1))
  }
  const goNext = () => {
    setCustom('')
    setStepIdx(i => Math.min(total - 1, i + 1))
  }
  const submit = () => {
    if (!complete || submitting) return
    onSubmitBrief(String(answers.brand ?? ''), answers)
  }

  // Whether the current step has a usable answer (for Next-enable).
  const stepAnswered = (() => {
    const v = answers[step.id]
    if (step.optional) return true
    if (Array.isArray(v)) return v.length > 0
    return !!(v && v.trim())
  })()

  const isSelected = (value: string): boolean => {
    const v = answers[step.id]
    if (Array.isArray(v)) return v.includes(value)
    return v === value
  }

  const locked = started || submitting

  // Reference buildBrief so the brief shape stays wired into this owner component.
  const briefReady = complete ? buildBrief(answers).brand_id !== '' : false
  void briefReady

  // ── Render ────────────────────────────────────────────────────────────────
  const opts = optionsFor(step)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: 'var(--bg-base)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-surface)',
          flexShrink: 0,
        }}
      >
        <Avatar label="Campaign Director" size={38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 15,
              fontWeight: 800,
              color: 'var(--text-strong)',
            }}
          >
            Campaign Director
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>▾</span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: 'var(--text-dim)',
            }}
          >
            <Dot color={ACCENT} size={7} />
            AI Marketing Agent
          </div>
        </div>
        <span
          style={{ fontSize: 20, color: 'var(--text-faint)', cursor: 'pointer', lineHeight: 1 }}
          title="More"
        >
          ⋯
        </span>
      </div>

      {/* Transcript */}
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '18px' }}>
        {/* Intro bubble */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <Avatar label="Campaign Director" size={28} />
          <div style={{ ...S.bubble, maxWidth: '85%' }}>
            Hi! I&apos;m your Campaign Director. Let&apos;s build a campaign brief together —
            answer a few quick questions and my sub-agents will get to work.
          </div>
        </div>

        {/* Answered steps transcript */}
        {INTERVIEW.slice(0, stepIdx).map(s => (
          <AnsweredPair key={s.id} prompt={s.prompt} answer={displayAnswer(s) || '—'} />
        ))}

        {/* Typing indicator while the next question "streams" in */}
        {!started && typing && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <Avatar label="Campaign Director" size={28} />
            <div style={{ ...S.bubble, display: 'inline-flex', alignItems: 'center' }}>
              <TypingDots />
            </div>
          </div>
        )}

        {/* Current step (hidden once started or while typing) */}
        {!started && !typing && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <Avatar label="Campaign Director" size={28} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...S.bubble }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', marginBottom: 6 }}>
                  Step {stepIdx + 1}/{total}
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-strong)' }}>
                  {step.prompt}
                </div>
                {step.helper && (
                  <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginTop: 4 }}>
                    {step.helper}
                  </div>
                )}
              </div>

              {/* MCQ / multi option cards */}
              {(step.kind === 'mcq' || step.kind === 'multi') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                  {opts.length === 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--text-faint)', padding: '6px 2px' }}>
                      No options available.
                    </div>
                  )}
                  {opts.map((o, i) => {
                    const sel = isSelected(o.value)
                    return (
                      <OptionCard
                        key={o.value}
                        letter={LETTERS[i] ?? '•'}
                        title={o.label}
                        selected={sel}
                        onClick={() =>
                          step.kind === 'multi' ? toggleMulti(o.value) : setSingle(o.value)
                        }
                      />
                    )
                  })}

                  {step.kind === 'multi' && opts.length > 0 && (
                    <div style={{ display: 'flex', gap: 14, padding: '2px 2px 0' }}>
                      <button
                        type="button"
                        onClick={() => setAnswers(prev => ({ ...prev, [step.id]: opts.map(o => o.value) }))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: PURPLE_LIGHT, padding: 0 }}
                      >Select all</button>
                      <button
                        type="button"
                        onClick={() => setAnswers(prev => ({ ...prev, [step.id]: [] }))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--text-faint)', padding: 0 }}
                      >Clear</button>
                    </div>
                  )}

                  {step.allowCustom && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                      <input
                        value={custom}
                        onChange={e => setCustom(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            addCustom()
                          }
                        }}
                        placeholder="Add your own…"
                        style={{ ...S.input }}
                      />
                      <Btn variant="ghost" size="sm" onClick={addCustom} disabled={!custom.trim()}>
                        Add
                      </Btn>
                    </div>
                  )}
                </div>
              )}

              {/* Text step */}
              {step.kind === 'text' && (
                <textarea
                  value={typeof answers[step.id] === 'string' ? (answers[step.id] as string) : ''}
                  onChange={e => setText(e.target.value)}
                  placeholder={step.optional ? 'Optional…' : 'Type your answer…'}
                  rows={3}
                  style={{
                    ...S.input,
                    marginTop: 10,
                    resize: 'vertical',
                    minHeight: 72,
                    fontFamily: 'inherit',
                  }}
                />
              )}

              {/* Step controls */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 12,
                }}
              >
                <Btn variant="ghost" size="sm" onClick={goBack} disabled={stepIdx === 0}>
                  ← Back
                </Btn>
                <div style={{ flex: 1 }} />
                {!isLast && (
                  <Btn variant="soft" size="sm" onClick={goNext} disabled={!stepAnswered}>
                    Next →
                  </Btn>
                )}
                {isLast && (
                  <Btn variant="primary" size="md" onClick={submit} disabled={!complete || submitting}>
                    + New Campaign
                  </Btn>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Thinking / brief-sent state */}
        {(submitting || started) && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
            <Avatar label="Campaign Director" size={28} />
            <div style={{ ...S.bubble, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              {submitting ? (
                <>
                  <TypingDots />
                  <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                    Sending brief to the sub-agents…
                  </span>
                </>
              ) : (
                <span style={{ fontSize: 13.5, color: 'var(--text)' }}>
                  Brief received — my sub-agents are working on your campaign assets now. ✨
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div
        style={{
          flexShrink: 0,
          padding: '12px 16px 16px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-surface)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--bg-base)',
            border: '1px solid var(--border)',
            borderRadius: 999,
            padding: '6px 6px 6px 16px',
            opacity: locked ? 0.6 : 1,
          }}
        >
          <input
            placeholder={
              started ? 'Brief sent — sub-agents working…' : 'Message Campaign Director…'
            }
            disabled={locked}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 14,
              color: 'var(--text-strong)',
            }}
          />
          <GlyphBtn glyph="📎" title="Attach" />
          <GlyphBtn glyph="😊" title="Emoji" />
          <GlyphBtn glyph="✨" title="Suggestions" />
          <button
            title="Send"
            disabled={locked}
            style={{
              width: 38,
              height: 38,
              borderRadius: 999,
              border: 'none',
              cursor: locked ? 'default' : 'pointer',
              background: GRADIENT,
              color: '#fff',
              fontSize: 16,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            ↑
          </button>
        </div>
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-faint)',
            textAlign: 'center',
            marginTop: 8,
          }}
        >
          AI responses can make mistakes. Please review important info.
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────────

function AnsweredPair({ prompt, answer }: { prompt: string; answer: string }): React.JSX.Element {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
        <Avatar label="Campaign Director" size={22} />
        <div style={{ fontSize: 12.5, color: 'var(--text-dim)', alignSelf: 'center' }}>{prompt}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#fff',
            background: PURPLE,
            borderRadius: 14,
            borderBottomRightRadius: 4,
            padding: '8px 14px',
            maxWidth: '80%',
          }}
        >
          {answer}
        </div>
      </div>
    </div>
  )
}

function OptionCard({
  letter,
  title,
  description,
  selected,
  onClick,
}: {
  letter: string
  title: string
  description?: string
  selected: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        textAlign: 'left',
        padding: '11px 14px',
        cursor: 'pointer',
        borderRadius: 'var(--radius-md, 12px)',
        background: selected ? `${PURPLE_LIGHT}1A` : 'var(--bg-inset)',
        border: `1.5px solid ${selected ? PURPLE_LIGHT : 'var(--border-soft)'}`,
        transition: 'background .15s, border-color .15s',
      }}
    >
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: 8,
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12.5,
          fontWeight: 800,
          background: selected ? PURPLE : 'var(--bg-surface)',
          color: selected ? '#fff' : 'var(--text-dim)',
          border: selected ? 'none' : '1px solid var(--border)',
        }}
      >
        {letter}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--text-strong)',
          }}
        >
          {title}
        </span>
        {description && (
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
            {description}
          </span>
        )}
      </span>
      {selected && (
        <span style={{ color: ACCENT, fontSize: 16, fontWeight: 800, flexShrink: 0 }}>✓</span>
      )}
    </button>
  )
}

function GlyphBtn({ glyph, title }: { glyph: string; title: string }): React.JSX.Element {
  return (
    <button
      title={title}
      style={{
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        fontSize: 16,
        padding: 4,
        lineHeight: 1,
        color: 'var(--text-dim)',
      }}
    >
      {glyph}
    </button>
  )
}
