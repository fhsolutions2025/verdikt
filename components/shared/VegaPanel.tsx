'use client'

import { useState, useEffect } from 'react'

const ACCENT = '#00C853'

interface VegaConfig {
  is_active:            boolean
  budget_cap_inr:       number
  stop_loss_pct:        number
  max_position_size:    number
  confidence_threshold: number
  allowed_categories:   string[]
  max_trades_per_day:   number
  run_schedule:         string
  last_run_at:          string | null
  total_deployed:       number
  total_pnl:            number
}

const CATEGORIES = [
  { id: 'current_affairs', label: 'Current Affairs' },
  { id: 'finance',         label: 'Finance' },
  { id: 'sports',          label: 'Sports' },
  { id: 'politics',        label: 'Politics' },
]

const SCHEDULES = [
  { id: 'manual', label: 'Manual' },
  { id: 'hourly', label: 'Hourly' },
  { id: 'daily',  label: 'Daily' },
]

const TOOLTIPS: Record<string, string> = {
  'Budget cap':        'Maximum total capital Vega can have deployed at once. Vega will never open new positions if this limit is reached.',
  'Max position size': 'The largest amount Vega can put into a single trade. Smaller = more diversified risk.',
  'Stop-loss':         'Vega will automatically sell a position if it falls this % below the entry price.',
  'Min confidence':    'Vega only enters a market when its AI confidence score meets or exceeds this threshold.',
  'Max trades / day':  'Hard cap on new entry trades per calendar day. Exits and stop-losses are never counted.',
  'Allowed categories':'Vega will only look for opportunities in the market categories you enable here.',
  'Run schedule':      'How often Vega automatically scans and trades. "Manual" means only the Run now button triggers it.',
}

// ── Tooltip ────────────────────────────────────────────────────────────────────
function Tooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'default' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ color: '#4B5563' }}>
        <circle cx="6.5" cy="6.5" r="5.75" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M6.5 5.5v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        <circle cx="6.5" cy="3.75" r="0.7" fill="currentColor"/>
      </svg>
      {show && (
        <span style={{
          position: 'absolute',
          bottom: '120%',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#1F2937',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8,
          padding: '7px 10px',
          fontSize: 11,
          lineHeight: 1.5,
          color: '#D1D5DB',
          width: 200,
          whiteSpace: 'normal',
          zIndex: 100,
          pointerEvents: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}>
          {text}
          <span style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: '5px solid #1F2937',
          }} />
        </span>
      )}
    </span>
  )
}

// ── Field ──────────────────────────────────────────────────────────────────────
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 600 }}>{label}</span>
          {TOOLTIPS[label] && <Tooltip text={TOOLTIPS[label]} />}
        </div>
        {hint && <span style={{ color: '#4B5563', fontSize: 10 }}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}

// ── NumberInput ────────────────────────────────────────────────────────────────
function NumberInput({ value, onChange, min, max, step = 1, prefix }: {
  value: number; onChange: (v: number) => void; min: number; max: number; step?: number; prefix?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {prefix && <span style={{ color: '#6B7280', fontSize: 13, fontFamily: 'monospace' }}>{prefix}</span>}
      <input
        type="number" value={value} min={min} max={max} step={step}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          flex: 1,
          backgroundColor: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8,
          padding: '7px 10px',
          color: '#E6EDF3',
          fontSize: 13,
          fontFamily: 'monospace',
          outline: 'none',
        }}
        onFocus={e => { e.currentTarget.style.borderColor = ACCENT + '60' }}
        onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
      />
    </div>
  )
}

// ── Activity row type ──────────────────────────────────────────────────────────
interface ActivityRow {
  id:           string
  action:       string
  side:         string | null
  amount:       number | null
  realized_pnl: number | null
  rationale:    string | null
  created_at:   string
}

// ── VegaIcon — star with pulse animation when active ─────────────────────────
function VegaIcon({ active, running }: { active: boolean; running: boolean }) {
  return (
    <>
      <style>{`
        @keyframes vegaPulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:0.6; transform:scale(1.18); }
        }
        @keyframes vegaSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes vegaGlow {
          0%,100% { box-shadow: 0 0 0px 0px ${ACCENT}00; }
          50%      { box-shadow: 0 0 10px 4px ${ACCENT}55; }
        }
        .vega-icon-wrap {
          width:34px; height:34px; border-radius:9px;
          display:flex; align-items:center; justify-content:center;
          transition: background-color 0.3s;
        }
        .vega-icon-wrap.active  { animation: vegaGlow 2.4s ease-in-out infinite; }
        .vega-icon-wrap.running { animation: none; }
        .vega-star { transition: color 0.3s; }
        .vega-star.active  { animation: vegaPulse 2.4s ease-in-out infinite; }
        .vega-star.running { animation: vegaSpin 1.2s linear infinite; }
      `}</style>
      <div
        className={`vega-icon-wrap${active ? ' active' : ''}${running ? ' running' : ''}`}
        style={{ backgroundColor: active ? ACCENT + '20' : 'rgba(255,255,255,0.06)' }}
      >
        <svg
          width="18" height="18" viewBox="0 0 18 18" fill="none"
          className={`vega-star${running ? ' running' : active ? ' active' : ''}`}
          style={{ color: active ? ACCENT : '#6B7280' }}
        >
          <path
            d="M9 1L11 6.5L16.5 7L12.5 11L13.5 16.5L9 13.5L4.5 16.5L5.5 11L1.5 7L7 6.5L9 1Z"
            stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"
            fill={active ? ACCENT + '30' : 'none'}
          />
        </svg>
      </div>
    </>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────────
export function VegaPanel() {
  const [cfg, setCfg]           = useState<VegaConfig | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [running, setRunning]   = useState(false)
  const [msg, setMsg]           = useState<string | null>(null)
  const [activity, setActivity] = useState<ActivityRow[]>([])

  const loadActivity = () => {
    fetch('/api/autonomous-agent/activity')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.activity)) setActivity(d.activity) })
      .catch(() => {})
  }

  useEffect(() => {
    fetch('/api/autonomous-agent')
      .then(r => r.json())
      .then(d => { if (d.config) setCfg(d.config) })
      .catch(() => {})
      .finally(() => setLoading(false))
    loadActivity()
  }, [])

  const runNow = async () => {
    setRunning(true)
    setMsg(null)
    try {
      const res = await fetch('/api/autonomous-agent/run', { method: 'POST' })
      const d = await res.json()
      if (res.ok) {
        setMsg(`Run complete: ${d.entries} entered, ${d.exits} exited`)
        loadActivity()
        fetch('/api/autonomous-agent').then(r => r.json()).then(x => { if (x.config) setCfg(x.config) }).catch(() => {})
      } else {
        setMsg(d.error ?? 'Run failed')
      }
    } catch {
      setMsg('Network error')
    } finally {
      setRunning(false)
    }
  }

  const save = async (overrides?: Partial<VegaConfig>) => {
    if (!cfg) return
    const next = { ...cfg, ...overrides }
    setCfg(next)
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/autonomous-agent', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(next),
      })
      const d = await res.json()
      if (res.ok && d.config) {
        setCfg(d.config)
        setMsg('Saved')
        setTimeout(() => setMsg(null), 2000)
      } else {
        setMsg(d.error ?? 'Save failed')
      }
    } catch {
      setMsg('Network error')
    } finally {
      setSaving(false)
    }
  }

  const toggleCategory = (id: string) => {
    if (!cfg) return
    const has = cfg.allowed_categories.includes(id)
    const next = has
      ? cfg.allowed_categories.filter(c => c !== id)
      : [...cfg.allowed_categories, id]
    setCfg({ ...cfg, allowed_categories: next.length ? next : cfg.allowed_categories })
  }

  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#6B7280', fontSize: 13 }}>
        Loading Vega…
      </div>
    )
  }

  if (!cfg) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#F87171', fontSize: 13 }}>
        Could not load Vega config.
      </div>
    )
  }

  const pnlPositive = cfg.total_pnl >= 0

  return (
    <div style={{ padding: '14px 14px 8px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <div style={{
        backgroundColor: cfg.is_active ? ACCENT + '10' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${cfg.is_active ? ACCENT + '30' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 12,
        padding: '14px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <VegaIcon active={cfg.is_active} running={running} />
            <div>
              <div style={{ color: '#E6EDF3', fontSize: 14, fontWeight: 700 }}>Vega</div>
              <div style={{ color: cfg.is_active ? ACCENT : '#6B7280', fontSize: 11, fontWeight: 600 }}>
                {cfg.is_active ? 'Active · trading autonomously' : 'Paused'}
              </div>
            </div>
          </div>
          {/* Master toggle */}
          <div
            onClick={() => save({ is_active: !cfg.is_active })}
            title={cfg.is_active ? 'Pause Vega' : 'Activate Vega'}
            style={{
              width: 44, height: 24, borderRadius: 12,
              backgroundColor: cfg.is_active ? ACCENT : '#374151',
              position: 'relative', cursor: saving ? 'wait' : 'pointer',
              transition: 'background-color 0.2s', flexShrink: 0,
            }}
          >
            <div style={{
              position: 'absolute', top: 3, left: cfg.is_active ? 23 : 3,
              width: 18, height: 18, borderRadius: '50%',
              backgroundColor: '#fff', transition: 'left 0.2s',
            }} />
          </div>
        </div>

        {/* Live stats */}
        <div style={{ display: 'flex', gap: 20, marginTop: 14 }}>
          <div>
            <div style={{ color: '#6B7280', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Deployed</div>
            <div style={{ color: '#E6EDF3', fontSize: 15, fontWeight: 700, fontFamily: 'monospace' }}>
              {cfg.total_deployed.toFixed(0)}
            </div>
          </div>
          <div>
            <div style={{ color: '#6B7280', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>P&amp;L</div>
            <div style={{ color: pnlPositive ? ACCENT : '#F87171', fontSize: 15, fontWeight: 700, fontFamily: 'monospace' }}>
              {pnlPositive ? '+' : ''}{cfg.total_pnl.toFixed(0)}
            </div>
          </div>
          <div>
            <div style={{ color: '#6B7280', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last run</div>
            <div style={{ color: '#9CA3AF', fontSize: 13, fontWeight: 600 }}>
              {cfg.last_run_at ? new Date(cfg.last_run_at).toLocaleDateString() : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Guardrails description ─────────────────────────────────────────── */}
      <p style={{ color: '#6B7280', fontSize: 11.5, lineHeight: 1.5, margin: 0 }}>
        Vega only places trades that pass every rule below. All limits are enforced
        server-side — Vega can never exceed your budget cap or stop-loss.
      </p>

      {/* ── Config fields ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Budget cap" hint="total Vega can deploy">
          <NumberInput value={cfg.budget_cap_inr} onChange={v => setCfg({ ...cfg, budget_cap_inr: v })} min={50} max={50000} step={50} />
        </Field>

        <Field label="Max position size" hint="per single trade">
          <NumberInput value={cfg.max_position_size} onChange={v => setCfg({ ...cfg, max_position_size: v })} min={10} max={cfg.budget_cap_inr} step={10} />
        </Field>

        <Field label="Stop-loss" hint="exits if down this %">
          <NumberInput value={cfg.stop_loss_pct} onChange={v => setCfg({ ...cfg, stop_loss_pct: v })} min={1} max={90} prefix="%" />
        </Field>

        <Field label="Min confidence" hint="AI confidence to trade">
          <NumberInput value={cfg.confidence_threshold} onChange={v => setCfg({ ...cfg, confidence_threshold: v })} min={40} max={95} prefix="%" />
        </Field>

        <Field label="Max trades / day">
          <NumberInput value={cfg.max_trades_per_day} onChange={v => setCfg({ ...cfg, max_trades_per_day: v })} min={1} max={50} />
        </Field>

        {/* Categories */}
        <Field label="Allowed categories">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {CATEGORIES.map(c => {
              const active = cfg.allowed_categories.includes(c.id)
              return (
                <button
                  key={c.id}
                  onClick={() => toggleCategory(c.id)}
                  style={{
                    padding: '5px 11px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    backgroundColor: active ? ACCENT + '18' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${active ? ACCENT + '40' : 'rgba(255,255,255,0.1)'}`,
                    color: active ? ACCENT : '#6B7280',
                    transition: 'all 0.12s',
                  }}
                >
                  {c.label}
                </button>
              )
            })}
          </div>
        </Field>

        {/* Schedule */}
        <Field label="Run schedule" hint="how often Vega evaluates">
          <div style={{ display: 'flex', gap: 6 }}>
            {SCHEDULES.map(s => {
              const active = cfg.run_schedule === s.id
              return (
                <button
                  key={s.id}
                  onClick={() => setCfg({ ...cfg, run_schedule: s.id })}
                  style={{
                    flex: 1,
                    padding: '7px 0',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    backgroundColor: active ? ACCENT + '18' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${active ? ACCENT + '40' : 'rgba(255,255,255,0.1)'}`,
                    color: active ? ACCENT : '#6B7280',
                  }}
                >
                  {s.label}
                </button>
              )
            })}
          </div>
        </Field>
      </div>

      {/* ── Action bar ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
        <button
          onClick={() => save()}
          disabled={saving}
          style={{
            flex: 1,
            padding: '10px 0',
            borderRadius: 10,
            backgroundColor: ACCENT,
            border: 'none',
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            cursor: saving ? 'wait' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        <button
          onClick={runNow}
          disabled={running || !cfg.is_active}
          title={cfg.is_active ? 'Run Vega once now' : 'Enable Vega to run'}
          style={{
            padding: '10px 16px',
            borderRadius: 10,
            backgroundColor: 'transparent',
            border: `1px solid ${cfg.is_active ? ACCENT + '50' : 'rgba(255,255,255,0.1)'}`,
            color: cfg.is_active ? ACCENT : '#4B5563',
            fontSize: 13,
            fontWeight: 700,
            cursor: running || !cfg.is_active ? 'not-allowed' : 'pointer',
            opacity: running ? 0.6 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {running ? 'Running…' : 'Run now'}
        </button>
      </div>
      {msg && (
        <span style={{
          color: msg.includes('fail') || msg.includes('error') || msg.includes('not') ? '#F87171' : ACCENT,
          fontSize: 12, fontWeight: 600, textAlign: 'center',
        }}>
          {msg}
        </span>
      )}

      {/* ── Recent activity ────────────────────────────────────────────────── */}
      {activity.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 600 }}>Recent activity</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {activity.slice(0, 8).map(a => {
              const isExit  = a.action === 'stop_loss' || a.action === 'exit'
              const isError = a.action === 'error'
              const color   = isError ? '#F87171' : isExit ? '#F59E0B' : ACCENT
              const label   = a.action === 'stop_loss' ? 'STOP-LOSS'
                            : a.action === 'entry'      ? `ENTER ${a.side?.toUpperCase() ?? ''}`
                            : a.action === 'exit'       ? 'EXIT'
                            : a.action === 'error'      ? 'ERROR'
                            : a.action.toUpperCase()
              return (
                <div key={a.id} style={{
                  backgroundColor: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 8,
                  padding: '8px 10px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em' }}>{label}</span>
                    <span style={{ color: '#4B5563', fontSize: 10 }}>
                      {new Date(a.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {a.rationale && (
                    <p style={{ color: '#9CA3AF', fontSize: 11, lineHeight: 1.4, margin: '4px 0 0' }}>{a.rationale}</p>
                  )}
                  <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                    {a.amount != null && a.amount > 0 && (
                      <span style={{ color: '#6B7280', fontSize: 10, fontFamily: 'monospace' }}>{a.amount.toFixed(0)}</span>
                    )}
                    {a.realized_pnl != null && (
                      <span style={{ color: a.realized_pnl >= 0 ? ACCENT : '#F87171', fontSize: 10, fontFamily: 'monospace' }}>
                        {a.realized_pnl >= 0 ? '+' : ''}{a.realized_pnl.toFixed(0)}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p style={{ color: '#4B5563', fontSize: 10.5, lineHeight: 1.5, margin: '4px 0 0', textAlign: 'center' }}>
        Vega is an automated trading agent. This is not financial advice.
        You are responsible for funds it deploys within your configured limits.
      </p>
    </div>
  )
}
