'use client'

import { useState, useEffect } from 'react'

const ACCENT = '#00C853'
const SURFACE = 'rgba(255,255,255,0.04)'
const BORDER  = 'rgba(255,255,255,0.08)'

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
  { id: 'daily',  label: 'Daily'  },
]

const TOOLTIPS: Record<string, string> = {
  'Budget cap':        'Maximum total capital Vega can have deployed at once.',
  'Max position size': 'Largest amount Vega can put into a single trade.',
  'Stop-loss':         'Vega automatically sells a position if it falls this % from entry.',
  'Min confidence':    'Vega only trades markets whose AI confidence meets this threshold.',
  'Max trades / day':  'Hard cap on new entries per day. Exits are never counted.',
  'Allowed categories':'Vega only looks for trades in these market categories.',
  'Run schedule':      '"Manual" means only the Run now button triggers Vega.',
}

// ── Animations ──────────────────────────────────────────────────────────────────
const CSS = `
  @keyframes vegaPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.65;transform:scale(1.2)} }
  @keyframes vegaSpin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  @keyframes vegaGlow  { 0%,100%{box-shadow:0 0 0 0 ${ACCENT}00} 50%{box-shadow:0 0 14px 4px ${ACCENT}44} }
  @keyframes fadeIn    { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
  .vega-star-active  { animation: vegaPulse 2.4s ease-in-out infinite; color:${ACCENT} !important; }
  .vega-star-running { animation: vegaSpin 1.1s linear infinite; color:${ACCENT} !important; }
  .vega-glow         { animation: vegaGlow 2.4s ease-in-out infinite; }
  .vega-msg          { animation: fadeIn .18s ease; }
`

// ── Tooltip ─────────────────────────────────────────────────────────────────────
function Tip({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ color: '#4B5563', cursor: 'default' }}>
        <circle cx="6.5" cy="6.5" r="5.75" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M6.5 5.5v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        <circle cx="6.5" cy="3.75" r=".7" fill="currentColor"/>
      </svg>
      {show && (
        <span style={{
          position: 'absolute', bottom: '130%', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: '#161B22', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8, padding: '8px 11px', fontSize: 11, lineHeight: 1.55,
          color: '#D1D5DB', width: 210, whiteSpace: 'normal', zIndex: 200,
          pointerEvents: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          {text}
          <span style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
            borderTop: '5px solid #161B22',
          }}/>
        </span>
      )}
    </span>
  )
}

// ── Section label ────────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      color: '#4B5563', fontSize: 10, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.08em',
      marginBottom: 2,
    }}>
      <div style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
      {children}
      <div style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
    </div>
  )
}

// ── Field ────────────────────────────────────────────────────────────────────────
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 600 }}>{label}</span>
          {TOOLTIPS[label] && <Tip text={TOOLTIPS[label]} />}
        </div>
        {hint && <span style={{ color: '#374151', fontSize: 10 }}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}

// ── Number input ─────────────────────────────────────────────────────────────────
function NumInput({ value, onChange, min, max, step = 1, suffix }: {
  value: number; onChange: (v: number) => void
  min: number; max: number; step?: number; suffix?: string
}) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <input
        type="number" value={value} min={min} max={max} step={step}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          width: '100%', backgroundColor: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.09)', borderRadius: 9,
          padding: suffix ? '9px 36px 9px 12px' : '9px 12px',
          color: '#E6EDF3', fontSize: 14, fontFamily: 'monospace', outline: 'none',
          transition: 'border-color .15s',
        }}
        onFocus={e  => { e.currentTarget.style.borderColor = ACCENT + '55' }}
        onBlur={e   => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)' }}
      />
      {suffix && (
        <span style={{ position: 'absolute', right: 12, color: '#4B5563', fontSize: 12, pointerEvents: 'none' }}>
          {suffix}
        </span>
      )}
    </div>
  )
}

// ── Activity types ───────────────────────────────────────────────────────────────
interface ActivityRow {
  id: string; action: string; side: string | null
  amount: number | null; realized_pnl: number | null
  rationale: string | null; created_at: string
}

const ACTION_META: Record<string, { label: string; color: string }> = {
  entry:           { label: 'ENTER',         color: ACCENT },
  stop_loss:       { label: 'STOP-LOSS',     color: '#F59E0B' },
  exit:            { label: 'EXIT',          color: '#F59E0B' },
  error:           { label: 'ERROR',         color: '#F87171' },
  circuit_breaker: { label: 'CIRCUIT BREAK', color: '#F59E0B' },
  belief_failure:  { label: 'BELIEF FAIL',   color: '#F59E0B' },
}

// ── Toggle ───────────────────────────────────────────────────────────────────────
function Toggle({ on, onChange, disabled }: { on: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <div
      onClick={disabled ? undefined : onChange}
      className={on ? 'vega-glow' : ''}
      style={{
        width: 46, height: 26, borderRadius: 13,
        backgroundColor: on ? ACCENT : '#1F2937',
        border: `1px solid ${on ? ACCENT + '60' : 'rgba(255,255,255,0.1)'}`,
        position: 'relative', cursor: disabled ? 'wait' : 'pointer',
        transition: 'background-color .22s, border-color .22s', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: on ? 23 : 3,
        width: 18, height: 18, borderRadius: '50%',
        backgroundColor: '#fff',
        boxShadow: on ? `0 1px 6px ${ACCENT}88` : '0 1px 4px rgba(0,0,0,0.4)',
        transition: 'left .22s, box-shadow .22s',
      }}/>
    </div>
  )
}

// ── Main panel ───────────────────────────────────────────────────────────────────
export function VegaPanel() {
  const [cfg, setCfg]           = useState<VegaConfig | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [running, setRunning]   = useState(false)
  const [msg, setMsg]           = useState<{ text: string; ok: boolean } | null>(null)
  const [activity, setActivity] = useState<ActivityRow[]>([])

  const loadActivity = () =>
    fetch('/api/autonomous-agent/activity')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.activity)) setActivity(d.activity) })
      .catch(() => {})

  useEffect(() => {
    fetch('/api/autonomous-agent')
      .then(r => r.json())
      .then(d => { if (d.config) setCfg(d.config) })
      .catch(() => {})
      .finally(() => setLoading(false))
    loadActivity()
  }, [])

  const flash = (text: string, ok: boolean) => {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 3000)
  }

  const save = async (overrides?: Partial<VegaConfig>) => {
    if (!cfg) return
    const next = { ...cfg, ...overrides }
    setCfg(next); setSaving(true)
    try {
      const res = await fetch('/api/autonomous-agent', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      const d = await res.json()
      if (res.ok && d.config) { setCfg(d.config); flash('Settings saved', true) }
      else flash(d.error ?? 'Save failed', false)
    } catch { flash('Network error', false) }
    finally { setSaving(false) }
  }

  const runNow = async () => {
    setRunning(true)
    try {
      const res = await fetch('/api/autonomous-agent/run', { method: 'POST' })
      const d   = await res.json()
      if (res.ok) {
        flash(`${d.entries} entered · ${d.exits} exited`, true)
        loadActivity()
        fetch('/api/autonomous-agent').then(r => r.json()).then(x => { if (x.config) setCfg(x.config) }).catch(() => {})
      } else flash(d.error ?? 'Run failed', false)
    } catch { flash('Network error', false) }
    finally { setRunning(false) }
  }

  const toggleCategory = (id: string) => {
    if (!cfg) return
    const has  = cfg.allowed_categories.includes(id)
    const next = has
      ? cfg.allowed_categories.filter(c => c !== id)
      : [...cfg.allowed_categories, id]
    setCfg({ ...cfg, allowed_categories: next.length ? next : cfg.allowed_categories })
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#4B5563', fontSize: 13 }}>
      Loading Vega…
    </div>
  )
  if (!cfg) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#F87171', fontSize: 13 }}>
      Could not load config.
    </div>
  )

  const pct     = cfg.budget_cap_inr > 0 ? Math.min(100, (cfg.total_deployed / cfg.budget_cap_inr) * 100) : 0
  const pnlPos  = cfg.total_pnl >= 0
  const canRun  = cfg.is_active && !running

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <style>{CSS}</style>

      {/* ── FIXED TOP ─────────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, padding: '14px 14px 12px' }}>

        {/* Hero card */}
        <div style={{
          borderRadius: 14,
          background: cfg.is_active
            ? `linear-gradient(135deg, ${ACCENT}14 0%, rgba(255,255,255,0.03) 60%)`
            : 'rgba(255,255,255,0.03)',
          border: `1px solid ${cfg.is_active ? ACCENT + '28' : BORDER}`,
          padding: '14px 16px 16px',
          transition: 'background .3s, border-color .3s',
        }}>

          {/* Name row + toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Icon */}
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                backgroundColor: cfg.is_active ? ACCENT + '1A' : 'rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background-color .3s',
              }}>
                <svg
                  width="18" height="18" viewBox="0 0 18 18" fill="none"
                  className={running ? 'vega-star-running' : cfg.is_active ? 'vega-star-active' : ''}
                  style={{ color: cfg.is_active ? ACCENT : '#4B5563', transition: 'color .3s' }}
                >
                  <path d="M9 1L11 6.5L16.5 7L12.5 11L13.5 16.5L9 13.5L4.5 16.5L5.5 11L1.5 7L7 6.5L9 1Z"
                    stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"
                    fill={cfg.is_active ? ACCENT + '28' : 'none'}
                  />
                </svg>
              </div>
              <div>
                <div style={{ color: '#E6EDF3', fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>Vega</div>
                <div style={{
                  fontSize: 11, fontWeight: 600, marginTop: 1,
                  color: cfg.is_active ? ACCENT : '#4B5563',
                  transition: 'color .3s',
                }}>
                  {running ? 'Running scan…' : cfg.is_active ? 'Active · trading autonomously' : 'Paused'}
                </div>
              </div>
            </div>
            <Toggle on={cfg.is_active} onChange={() => save({ is_active: !cfg.is_active })} disabled={saving} />
          </div>

          {/* Stats row */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
            gap: 1, backgroundColor: BORDER, borderRadius: 10, overflow: 'hidden',
          }}>
            {/* Deployed */}
            <div style={{ backgroundColor: '#0D1117', padding: '10px 12px' }}>
              <div style={{ color: '#4B5563', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                Deployed
              </div>
              <div style={{ color: '#E6EDF3', fontSize: 15, fontWeight: 700, fontFamily: 'monospace' }}>
                {cfg.total_deployed.toLocaleString()}
              </div>
              <div style={{ marginTop: 6, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  width: `${pct}%`,
                  backgroundColor: pct > 80 ? '#F59E0B' : ACCENT,
                  transition: 'width .4s ease',
                }}/>
              </div>
              <div style={{ color: '#374151', fontSize: 9, marginTop: 3 }}>
                of {cfg.budget_cap_inr.toLocaleString()} cap
              </div>
            </div>

            {/* P&L */}
            <div style={{ backgroundColor: '#0D1117', padding: '10px 12px' }}>
              <div style={{ color: '#4B5563', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                P&amp;L
              </div>
              <div style={{ color: pnlPos ? ACCENT : '#F87171', fontSize: 15, fontWeight: 700, fontFamily: 'monospace' }}>
                {pnlPos ? '+' : ''}{cfg.total_pnl.toLocaleString()}
              </div>
              <div style={{ marginTop: 6, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 2, width: '100%',
                  backgroundColor: pnlPos ? ACCENT + '44' : '#F8717144',
                }}/>
              </div>
              <div style={{ color: '#374151', fontSize: 9, marginTop: 3 }}>
                {pnlPos ? 'in profit' : 'in loss'}
              </div>
            </div>

            {/* Last run */}
            <div style={{ backgroundColor: '#0D1117', padding: '10px 12px' }}>
              <div style={{ color: '#4B5563', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                Last run
              </div>
              {cfg.last_run_at ? (
                <>
                  <div style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 700 }}>
                    {new Date(cfg.last_run_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div style={{ color: '#374151', fontSize: 9, marginTop: 2 }}>
                    {new Date(cfg.last_run_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </div>
                </>
              ) : (
                <div style={{ color: '#374151', fontSize: 12, fontWeight: 700, marginTop: 2 }}>—</div>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            onClick={runNow}
            disabled={!canRun}
            title={cfg.is_active ? 'Run Vega once now' : 'Activate Vega first'}
            style={{
              flex: 1, padding: '11px 0', borderRadius: 10,
              backgroundColor: canRun ? ACCENT : 'rgba(255,255,255,0.04)',
              border: `1px solid ${canRun ? ACCENT : BORDER}`,
              color: canRun ? '#000' : '#374151',
              fontSize: 13, fontWeight: 700,
              cursor: canRun ? 'pointer' : 'not-allowed',
              transition: 'all .2s',
            }}
          >
            {running ? 'Running…' : 'Run now'}
          </button>
          <button
            onClick={() => save()}
            disabled={saving}
            style={{
              flex: 1, padding: '11px 0', borderRadius: 10,
              backgroundColor: 'transparent',
              border: `1px solid ${ACCENT}55`,
              color: ACCENT,
              fontSize: 13, fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.6 : 1,
              transition: 'all .2s',
            }}
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>

        {/* Status message */}
        {msg && (
          <div className="vega-msg" style={{
            marginTop: 8, padding: '7px 12px', borderRadius: 8, textAlign: 'center',
            backgroundColor: msg.ok ? ACCENT + '12' : 'rgba(248,113,113,0.1)',
            border: `1px solid ${msg.ok ? ACCENT + '30' : 'rgba(248,113,113,0.25)'}`,
            color: msg.ok ? ACCENT : '#F87171',
            fontSize: 12, fontWeight: 600,
          }}>
            {msg.ok ? '✓ ' : '✕ '}{msg.text}
          </div>
        )}

        {/* Scroll hint */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, color: '#374151', fontSize: 10.5 }}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M5.5 1.5v8M2.5 6.5l3 3 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Settings &amp; activity below
        </div>
      </div>

      {/* ── SCROLLABLE SECTION ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '0 14px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Risk limits group */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SectionLabel>Risk limits</SectionLabel>

            {/* Budget cap + position size side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Budget cap" hint="total">
                <NumInput value={cfg.budget_cap_inr} onChange={v => setCfg({ ...cfg, budget_cap_inr: v })} min={50} max={50000} step={50} />
              </Field>
              <Field label="Max position size" hint="per trade">
                <NumInput value={cfg.max_position_size} onChange={v => setCfg({ ...cfg, max_position_size: v })} min={10} max={cfg.budget_cap_inr} step={10} />
              </Field>
            </div>

            {/* Stop-loss + min confidence side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Stop-loss" hint="exit threshold">
                <NumInput value={cfg.stop_loss_pct} onChange={v => setCfg({ ...cfg, stop_loss_pct: v })} min={1} max={90} suffix="%" />
              </Field>
              <Field label="Min confidence" hint="AI floor">
                <NumInput value={cfg.confidence_threshold} onChange={v => setCfg({ ...cfg, confidence_threshold: v })} min={40} max={95} suffix="%" />
              </Field>
            </div>
          </div>

          {/* Behaviour group */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SectionLabel>Behaviour</SectionLabel>

            <Field label="Max trades / day">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="range" min={1} max={20} value={cfg.max_trades_per_day}
                  onChange={e => setCfg({ ...cfg, max_trades_per_day: Number(e.target.value) })}
                  style={{ flex: 1, accentColor: ACCENT, cursor: 'pointer' }}
                />
                <span style={{
                  minWidth: 28, textAlign: 'center',
                  backgroundColor: ACCENT + '18', border: `1px solid ${ACCENT}30`,
                  borderRadius: 6, padding: '3px 7px',
                  color: ACCENT, fontSize: 12, fontWeight: 700, fontFamily: 'monospace',
                }}>
                  {cfg.max_trades_per_day}
                </span>
              </div>
            </Field>

            <Field label="Allowed categories">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {CATEGORIES.map(c => {
                  const on = cfg.allowed_categories.includes(c.id)
                  return (
                    <button key={c.id} onClick={() => toggleCategory(c.id)} style={{
                      padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                      cursor: 'pointer', transition: 'all .12s',
                      backgroundColor: on ? ACCENT + '18' : SURFACE,
                      border: `1px solid ${on ? ACCENT + '40' : BORDER}`,
                      color: on ? ACCENT : '#6B7280',
                    }}>
                      {c.label}
                    </button>
                  )
                })}
              </div>
            </Field>

            <Field label="Run schedule" hint="auto-run frequency">
              <div style={{ display: 'flex', gap: 6 }}>
                {SCHEDULES.map(s => {
                  const on = cfg.run_schedule === s.id
                  return (
                    <button key={s.id} onClick={() => setCfg({ ...cfg, run_schedule: s.id })} style={{
                      flex: 1, padding: '8px 0', borderRadius: 9,
                      fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .12s',
                      backgroundColor: on ? ACCENT + '18' : SURFACE,
                      border: `1px solid ${on ? ACCENT + '40' : BORDER}`,
                      color: on ? ACCENT : '#6B7280',
                    }}>
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </Field>
          </div>

          {/* Activity */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SectionLabel>Recent activity</SectionLabel>

            {activity.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '16px 0',
                color: '#374151', fontSize: 12,
                backgroundColor: SURFACE, borderRadius: 10,
                border: `1px solid ${BORDER}`,
              }}>
                No activity yet — activate Vega and run to see trades here.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {activity.slice(0, 10).map(a => {
                  const meta = ACTION_META[a.action] ?? { label: a.action.toUpperCase(), color: '#6B7280' }
                  return (
                    <div key={a.id} style={{
                      backgroundColor: SURFACE, border: `1px solid ${BORDER}`,
                      borderRadius: 10, padding: '10px 12px',
                      borderLeft: `3px solid ${meta.color}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: meta.color, fontSize: 10, fontWeight: 800, letterSpacing: '0.05em' }}>
                            {meta.label}{a.action === 'entry' && a.side ? ` ${a.side.toUpperCase()}` : ''}
                          </span>
                          {a.amount != null && a.amount > 0 && (
                            <span style={{
                              backgroundColor: 'rgba(255,255,255,0.05)',
                              borderRadius: 4, padding: '1px 6px',
                              color: '#6B7280', fontSize: 10, fontFamily: 'monospace',
                            }}>
                              {a.amount.toFixed(0)}
                            </span>
                          )}
                          {a.realized_pnl != null && (
                            <span style={{
                              color: a.realized_pnl >= 0 ? ACCENT : '#F87171',
                              fontSize: 10, fontFamily: 'monospace', fontWeight: 700,
                            }}>
                              {a.realized_pnl >= 0 ? '+' : ''}{a.realized_pnl.toFixed(0)}
                            </span>
                          )}
                        </div>
                        <span style={{ color: '#374151', fontSize: 10, whiteSpace: 'nowrap' }}>
                          {new Date(a.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {a.rationale && (
                        <p style={{ color: '#6B7280', fontSize: 11, lineHeight: 1.45, margin: 0 }}>{a.rationale}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <p style={{ color: '#2D3748', fontSize: 10, lineHeight: 1.5, margin: 0, textAlign: 'center' }}>
            Vega is an automated trading agent. This is not financial advice.
            You are responsible for funds deployed within your configured limits.
          </p>
        </div>
      </div>
    </div>
  )
}
