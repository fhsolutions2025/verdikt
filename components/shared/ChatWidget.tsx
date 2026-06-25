'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { VegaPanel } from '@/components/shared/VegaPanel'

export type AgentType = 'player' | 'company' | 'mm_desk'

interface Message {
  id:        string
  role:      'user' | 'assistant'
  content:   string
  messageId: string | null
  feedback?: -1 | 1
}

interface AgentMeta {
  label:       string
  description: string
  accentColor: string
  icon:        React.ReactNode
}

const AGENT_META: Record<AgentType, AgentMeta> = {
  player: {
    label:       'Verdikt AI',
    description: 'Market insights & trading help',
    accentColor: '#00C853',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M5 8L7 10L11 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  company: {
    label:       'Ops AI',
    description: 'Platform metrics & risk analysis',
    accentColor: '#6366F1',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
        <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
        <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
        <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      </svg>
    ),
  },
  mm_desk: {
    label:       'MM AI',
    description: 'Repricing & book analysis',
    accentColor: '#F59E0B',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <polyline points="2,10 5,6 8,12 11,4 14,8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
}

function TypingDots({ color }: { color: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 0' }}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            backgroundColor: color,
            opacity: 0.6,
            animation: `chatDot 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </span>
  )
}

function ThumbButton({
  direction, active, onClick,
}: { direction: 'up' | 'down'; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={direction === 'up' ? 'Helpful' : 'Not helpful'}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '2px 4px',
        borderRadius: 4,
        color: active
          ? direction === 'up' ? '#00C853' : '#DC2626'
          : '#4B5563',
        transition: 'color 0.1s',
      }}
    >
      {direction === 'up' ? (
        <svg width="13" height="13" viewBox="0 0 13 13" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.3">
          <path d="M1 6.5V12H3.5V6.5M3.5 6.5L5.5 1.5C6.1 1.5 6.5 1.9 6.5 2.5V5H11L10.5 10.5H3.5V6.5Z"/>
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 13 13" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.3">
          <path d="M12 6.5V1H9.5V6.5M9.5 6.5L7.5 11.5C6.9 11.5 6.5 11.1 6.5 10.5V8H2L2.5 2.5H9.5V6.5Z"/>
        </svg>
      )}
    </button>
  )
}

export function ChatWidget({ agentType }: { agentType: AgentType }) {
  const meta = AGENT_META[agentType]
  const hasVega = agentType === 'player'
  const [open, setOpen]         = useState(false)
  const [view, setView]         = useState<'chat' | 'vega'>('chat')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [sessionId]             = useState(() => crypto.randomUUID())
  const [error, setError]       = useState<string | null>(null)
  const bottomRef               = useRef<HTMLDivElement>(null)
  const inputRef                = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        id:        'welcome',
        role:      'assistant',
        content:   `Hi! I'm ${meta.label}. ${meta.description}. How can I help you today?`,
        messageId: null,
      }])
    }
  }, [open, messages.length, meta.label, meta.description])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150)
  }, [open])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return

    setInput('')
    setError(null)

    const userMsg: Message = {
      id:        crypto.randomUUID(),
      role:      'user',
      content:   text,
      messageId: null,
    }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const history = messages
        .filter(m => m.id !== 'welcome')
        .map(m => ({ role: m.role, content: m.content }))
      history.push({ role: 'user', content: text })

      const res = await fetch(`/api/chat/${agentType}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: history, session_id: sessionId }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong.')
        setMessages(prev => prev.filter(m => m.id !== userMsg.id))
        return
      }

      setMessages(prev => [...prev, {
        id:        crypto.randomUUID(),
        role:      'assistant',
        content:   data.message,
        messageId: data.message_id,
      }])
    } catch {
      setError('Network error. Please try again.')
      setMessages(prev => prev.filter(m => m.id !== userMsg.id))
    } finally {
      setLoading(false)
    }
  }, [input, loading, messages, agentType, sessionId])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const submitFeedback = async (messageId: string, msgIdx: number, rating: -1 | 1) => {
    setMessages(prev => prev.map((m, i) => i === msgIdx ? { ...m, feedback: rating } : m))
    await fetch('/api/chat/feedback', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message_id: messageId, rating }),
    }).catch(() => {})
  }

  return (
    <>
      {/* ── CSS for dot animation ── */}
      <style>{`
        @keyframes chatDot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {/* ── Floating bubble ────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Open AI assistant"
        style={{
          position:        'fixed',
          bottom:          24,
          right:           24,
          width:           48,
          height:          48,
          borderRadius:    '50%',
          backgroundColor: meta.accentColor,
          border:          'none',
          cursor:          'pointer',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          color:           '#fff',
          boxShadow:       `0 4px 20px ${meta.accentColor}40`,
          zIndex:          9998,
          transition:      'transform 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)'
          ;(e.currentTarget as HTMLButtonElement).style.boxShadow = `0 6px 28px ${meta.accentColor}60`
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'
          ;(e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 20px ${meta.accentColor}40`
        }}
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M4 4L14 14M14 4L4 14" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        ) : meta.icon}
      </button>

      {/* ── Chat panel ─────────────────────────────────────────────────────── */}
      {open && (
        <div
          style={{
            position:        'fixed',
            bottom:          84,
            right:           24,
            width:           360,
            maxHeight:       540,
            backgroundColor: '#161B22',
            border:          `1px solid ${meta.accentColor}30`,
            borderRadius:    16,
            display:         'flex',
            flexDirection:   'column',
            overflow:        'hidden',
            zIndex:          9999,
            boxShadow:       '0 20px 60px rgba(0,0,0,0.5)',
          }}
        >
          {/* Header */}
          <div style={{
            padding:         '12px 16px',
            borderBottom:    `1px solid rgba(255,255,255,0.08)`,
            display:         'flex',
            alignItems:      'center',
            gap:             10,
            backgroundColor: '#0D1117',
          }}>
            <span style={{ color: meta.accentColor }}>{meta.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#E6EDF3', fontSize: 13, fontWeight: 700 }}>{meta.label}</div>
              <div style={{ color: '#6B7280', fontSize: 11 }}>{meta.description}</div>
            </div>
            <span style={{
              fontSize:        10,
              fontWeight:      700,
              color:           meta.accentColor,
              backgroundColor: meta.accentColor + '15',
              padding:         '2px 7px',
              borderRadius:    999,
              letterSpacing:   '0.05em',
            }}>LIVE</span>
          </div>

          {/* Tab switcher (player only: Chat | Vega) */}
          {hasVega && (
            <div style={{
              display: 'flex',
              gap: 4,
              padding: '8px 12px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              backgroundColor: '#0D1117',
            }}>
              {([['chat', 'Chat'], ['vega', 'Vega']] as const).map(([id, label]) => {
                const active = view === id
                return (
                  <button
                    key={id}
                    onClick={() => setView(id)}
                    style={{
                      flex: 1,
                      padding: '6px 0',
                      borderRadius: 8,
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 700,
                      backgroundColor: active ? meta.accentColor + '18' : 'transparent',
                      color: active ? meta.accentColor : '#6B7280',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    }}
                  >
                    {id === 'vega' && (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M6 1L7.3 4.3L11 4.7L8.3 7.3L9 11L6 9L3 11L3.7 7.3L1 4.7L4.7 4.3L6 1Z"
                          stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"
                          fill={active ? meta.accentColor + '30' : 'none'} />
                      </svg>
                    )}
                    {label}
                  </button>
                )
              })}
            </div>
          )}

          {/* ── Vega view ── */}
          {hasVega && view === 'vega' && <VegaPanel />}

          {/* ── Chat view ── */}
          {(!hasVega || view === 'chat') && (
          <>
          {/* Messages */}
          <div style={{
            flex:      1,
            overflowY: 'auto',
            padding:   '14px 14px 8px',
            display:   'flex',
            flexDirection: 'column',
            gap:       10,
          }}>
            {messages.map((msg, idx) => (
              <div key={msg.id} style={{
                display:       'flex',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                alignItems:    'flex-end',
                gap:           8,
              }}>
                {msg.role === 'assistant' && (
                  <div style={{
                    width:           26,
                    height:          26,
                    borderRadius:    '50%',
                    backgroundColor: meta.accentColor + '20',
                    color:           meta.accentColor,
                    display:         'flex',
                    alignItems:      'center',
                    justifyContent:  'center',
                    flexShrink:      0,
                  }}>
                    <span style={{ fontSize: 11 }}>{meta.icon}</span>
                  </div>
                )}
                <div style={{ maxWidth: '80%' }}>
                  <div style={{
                    backgroundColor: msg.role === 'user'
                      ? meta.accentColor + '20'
                      : 'rgba(255,255,255,0.05)',
                    border:          msg.role === 'user'
                      ? `1px solid ${meta.accentColor}30`
                      : '1px solid rgba(255,255,255,0.07)',
                    borderRadius:    msg.role === 'user'
                      ? '12px 12px 2px 12px'
                      : '12px 12px 12px 2px',
                    padding:         '9px 12px',
                    color:           '#D1D5DB',
                    fontSize:        13,
                    lineHeight:      1.5,
                    whiteSpace:      'pre-wrap',
                    wordBreak:       'break-word',
                  }}>
                    {msg.content}
                  </div>
                  {/* Feedback row for assistant messages */}
                  {msg.role === 'assistant' && msg.messageId && (
                    <div style={{ display: 'flex', gap: 2, marginTop: 4, justifyContent: 'flex-start' }}>
                      <ThumbButton
                        direction="up"
                        active={msg.feedback === 1}
                        onClick={() => msg.messageId && submitFeedback(msg.messageId, idx, 1)}
                      />
                      <ThumbButton
                        direction="down"
                        active={msg.feedback === -1}
                        onClick={() => msg.messageId && submitFeedback(msg.messageId, idx, -1)}
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%',
                  backgroundColor: meta.accentColor + '20',
                  color: meta.accentColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <span style={{ fontSize: 11 }}>{meta.icon}</span>
                </div>
                <div style={{
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '12px 12px 12px 2px',
                  padding: '9px 14px',
                }}>
                  <TypingDots color={meta.accentColor} />
                </div>
              </div>
            )}

            {error && (
              <div style={{
                backgroundColor: '#DC262615',
                border: '1px solid #DC262630',
                borderRadius: 8,
                padding: '8px 12px',
                color: '#F87171',
                fontSize: 12,
              }}>
                {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding:      '10px 12px',
            borderTop:    '1px solid rgba(255,255,255,0.08)',
            display:      'flex',
            gap:          8,
            alignItems:   'flex-end',
            backgroundColor: '#0D1117',
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything..."
              rows={1}
              style={{
                flex:            1,
                backgroundColor: 'rgba(255,255,255,0.05)',
                border:          '1px solid rgba(255,255,255,0.1)',
                borderRadius:    10,
                padding:         '8px 11px',
                color:           '#E6EDF3',
                fontSize:        13,
                resize:          'none',
                outline:         'none',
                fontFamily:      'inherit',
                lineHeight:      1.5,
                maxHeight:       100,
                overflowY:       'auto',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = meta.accentColor + '60' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
              onInput={e => {
                const t = e.currentTarget
                t.style.height = 'auto'
                t.style.height = Math.min(t.scrollHeight, 100) + 'px'
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              style={{
                width:           36,
                height:          36,
                borderRadius:    10,
                backgroundColor: !input.trim() || loading ? 'rgba(255,255,255,0.06)' : meta.accentColor,
                border:          'none',
                cursor:          !input.trim() || loading ? 'not-allowed' : 'pointer',
                display:         'flex',
                alignItems:      'center',
                justifyContent:  'center',
                color:           !input.trim() || loading ? '#4B5563' : '#fff',
                flexShrink:      0,
                transition:      'background-color 0.12s',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M12 7L2 2L4.5 7L2 12L12 7Z" fill="currentColor"/>
              </svg>
            </button>
          </div>
          </>
          )}
        </div>
      )}
    </>
  )
}
