'use client'

import { useState, useEffect, useRef } from 'react'

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

type Theme = 'dark' | 'light'
type BodyTab = 'settings' | 'activity'

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

// ── Theme palettes (exposed as CSS custom properties on the panel root so every
//    sub-component themes automatically, no prop threading) ─────────────────────
const PALETTES: Record<Theme, Record<string, string>> = {
  dark: {
    '--vp-bg':       '#0D1117',
    '--vp-elevated': '#161B22',
    '--vp-surface':  'rgba(255,255,255,0.04)',
    '--vp-border':   'rgba(255,255,255,0.08)',
    '--vp-strong':   '#E6EDF3',
    '--vp-text':     '#9CA3AF',
    '--vp-dim':      '#6B7280',
    '--vp-faint':    '#4B5563',
    '--vp-fainter':  '#374151',
    '--vp-shadow':   'rgba(0,0,0,0.5)',
    '--vp-accent-text': ACCENT,
  },
  light: {
    '--vp-bg':       '#FFFFFF',
    '--vp-elevated': '#F3F4F6',
    '--vp-surface':  'rgba(17,24,39,0.035)',
    '--vp-border':   'rgba(17,24,39,0.12)',
    '--vp-strong':   '#111827',
    '--vp-text':     '#374151',
    '--vp-dim':      '#6B7280',
    '--vp-faint':    '#9CA3AF',
    '--vp-fainter':  '#C0C7D1',
    '--vp-shadow':   'rgba(17,24,39,0.18)',
    '--vp-accent-text': '#00A844',
  },
}

// ── Animations + var-driven helpers ───────────────────────────────────────────
const CSS = `
  @keyframes vegaPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.65;transform:scale(1.2)} }
  @keyframes vegaSpin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  @keyframes vegaGlow  { 0%,100%{box-shadow:0 0 0 0 ${ACCENT}00} 50%{box-shadow:0 0 14px 4px ${ACCENT}44} }
  @keyframes fadeIn    { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
  @keyframes vegaFlash { 0%{box-shadow:0 0 0 0 ${ACCENT}66; background:${ACCENT}14} 100%{box-shadow:0 0 0 6px ${ACCENT}00; background:var(--vp-surface)} }
  .vega-star-active  { animation: vegaPulse 2.4s ease-in-out infinite; color:${ACCENT} !important; }
  .vega-star-running { animation: vegaSpin 1.1s linear infinite; color:${ACCENT} !important; }
  .vega-glow         { animation: vegaGlow 2.4s ease-in-out infinite; }
  .vega-msg          { animation: fadeIn .18s ease; }
  .vega-flash        { animation: vegaFlash 1.6s ease-out; }
`

// ── Tooltip ─────────────────────────────────────────────────────────────────────
function Tip({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ color: 'var(--vp-faint)', cursor: 'default' }}>
        <circle cx="6.5" cy="6.5" r="5.75" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M6.5 5.5v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        <circle cx="6.5" cy="3.75" r=".7" fill="currentColor"/>
      </svg>
      {show && (
        <span style={{
          position: 'absolute', bottom: '130%', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: 'var(--vp-elevated)', border: '1px solid var(--vp-border)',
          borderRadius: 8, padding: '8px 11px', fontSize: 11, lineHeight: 1.55,
          color: 'var(--vp-strong)', width: 210, whiteSpace: 'normal', zIndex: 200,
          pointerEvents: 'none', boxShadow: '0 8px 24px var(--vp-shadow)',
        }}>
          {text}
          <span style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
            borderTop: '5px solid var(--vp-elevated)',
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
      color: 'var(--vp-faint)', fontSize: 10, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.08em',
      marginBottom: 2,
    }}>
      <div style={{ flex: 1, height: 1, backgroundColor: 'var(--vp-border)' }} />
      {children}
      <div style={{ flex: 1, height: 1, backgroundColor: 'var(--vp-border)' }} />
    </div>
  )
}

// ── Field ────────────────────────────────────────────────────────────────────────
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ color: 'var(--vp-text)', fontSize: 12, fontWeight: 600 }}>{label}</span>
          {TOOLTIPS[label] && <Tip text={TOOLTIPS[label]} />}
        </div>
        {hint && <span style={{ color: 'var(--vp-fainter)', fontSize: 10 }}>{hint}</span>}
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
          width: '100%', backgroundColor: 'var(--vp-surface)',
          border: '1px solid var(--vp-border)', borderRadius: 9,
          padding: suffix ? '9px 36px 9px 12px' : '9px 12px',
          color: 'var(--vp-strong)', fontSize: 14, fontFamily: 'monospace', outline: 'none',
          transition: 'border-color .15s',
        }}
        onFocus={e  => { e.currentTarget.style.borderColor = ACCENT + '55' }}
        onBlur={e   => { e.currentTarget.style.borderColor = 'var(--vp-border)' }}
      />
      {suffix && (
        <span style={{ position: 'absolute', right: 12, color: 'var(--vp-faint)', fontSize: 12, pointerEvents: 'none' }}>
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
        backgroundColor: on ? ACCENT : 'var(--vp-surface)',
        border: `1px solid ${on ? ACCENT + '60' : 'var(--vp-border)'}`,
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

// ── Theme toggle (sun / moon) ─────────────────────────────────────────────────────
function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const isDark = theme === 'dark'
  return (
    <button
      onClick={onToggle}
      title={isDark ? 'Switch to light view' : 'Switch to dark view'}
      aria-label="Toggle colour theme"
      style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        backgroundColor: 'var(--vp-surface)', border: '1px solid var(--vp-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color: 'var(--vp-dim)', transition: 'all .18s',
      }}
    >
      {isDark ? (
        // moon
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <path d="M12.5 8.7A5.2 5.2 0 0 1 6.3 2.5a5.2 5.2 0 1 0 6.2 6.2Z"
            stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
        </svg>
      ) : (
        // sun
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <circle cx="7.5" cy="7.5" r="3" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M7.5 1v1.6M7.5 12.4V14M1 7.5h1.6M12.4 7.5H14M3 3l1.1 1.1M10.9 10.9 12 12M12 3l-1.1 1.1M4.1 10.9 3 12"
            stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
      )}
    </button>
  )
}

// ── Segmented control (Settings | Activity) ───────────────────────────────────────
function Segmented({ tab, activityCount, onChange }: {
  tab: BodyTab; activityCount: number; onChange: (t: BodyTab) => void
}) {
  const items: { id: BodyTab; label: string; badge?: number }[] = [
    { id: 'settings', label: 'Settings' },
    { id: 'activity', label: 'Activity', badge: activityCount },
  ]
  return (
    <div style={{
      display: 'flex', gap: 3, padding: 3, borderRadius: 11,
      backgroundColor: 'var(--vp-surface)', border: '1px solid var(--vp-border)',
    }}>
      {items.map(it => {
        const on = tab === it.id
        return (
          <button key={it.id} onClick={() => onChange(it.id)} style={{
            flex: 1, padding: '7px 0', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all .15s',
            backgroundColor: on ? ACCENT + '1A' : 'transparent',
            border: `1px solid ${on ? ACCENT + '40' : 'transparent'}`,
            color: on ? 'var(--vp-accent-text)' : 'var(--vp-dim)',
          }}>
            {it.label}
            {it.badge != null && it.badge > 0 && (
              <span style={{
                minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8,
                fontSize: 9.5, fontWeight: 800, fontFamily: 'monospace',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: on ? ACCENT + '28' : 'var(--vp-border)',
                color: on ? 'var(--vp-accent-text)' : 'var(--vp-dim)',
              }}>
                {it.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Main panel ───────────────────────────────────────────────────────────────────
export function VegaPanel() {
  const [cfg, setCfg]           = useState<VegaConfig | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [running, setRunning]   = useState(false)
  const [msg, setMsg]           = useState<{ text: string; kind: 'ok' | 'info' | 'err' } | null>(null)
  const [activity, setActivity] = useState<ActivityRow[]>([])
  const [theme, setTheme]       = useState<Theme>('dark')
  const [tab, setTab]           = useState<BodyTab>('settings')
  const [flashId, setFlashId]   = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Restore saved theme preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem('vega-theme')
      if (saved === 'light' || saved === 'dark') setTheme(saved)
    } catch { /* ignore */ }
  }, [])

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      try { localStorage.setItem('vega-theme', next) } catch { /* ignore */ }
      return next
    })
  }

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

  const flash = (text: string, kind: 'ok' | 'info' | 'err', durationMs = 3000) => {
    setMsg({ text, kind })
    setTimeout(() => setMsg(null), durationMs)
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
      if (res.ok && d.config) { setCfg(d.config); flash('Settings saved', 'ok') }
      else flash(d.error ?? 'Save failed', 'err')
    } catch { flash('Network error', 'err') }
    finally { setSaving(false) }
  }

  const runNow = async () => {
    setRunning(true)
    try {
      const res = await fetch('/api/autonomous-agent/run', { method: 'POST' })
      const d   = await res.json()
      if (res.ok) {
        const acted = (d.entries ?? 0) > 0 || (d.exits ?? 0) > 0
        const summary = `${d.entries ?? 0} entered · ${d.exits ?? 0} exited`
        // When Vega placed nothing, the run API explains why (no qualifying
        // markets, edge too thin, daily cap, circuit breaker…). Surface it so a
        // quiet run reads as "working, nothing to do" rather than "broken".
        flash(
          d.note ? `${summary} — ${d.note}` : summary,
          acted ? 'ok' : 'info',
          d.note ? 6000 : 3000,
        )
        // Bring whatever Vega just did into view: jump to the Activity tab, scroll
        // it to top, and flash the newest row so the user never has to hunt for it.
        const before = new Set(activity.map(a => a.id))
        const updated = await fetch('/api/autonomous-agent/activity').then(r => r.json()).catch(() => null)
        if (updated && Array.isArray(updated.activity)) {
          setActivity(updated.activity)
          const fresh = (updated.activity as ActivityRow[]).find(a => !before.has(a.id))
          setTab('activity')
          requestAnimationFrame(() => {
            scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
            if (fresh) {
              setFlashId(fresh.id)
              setTimeout(() => setFlashId(null), 1700)
            }
          })
        }
        fetch('/api/autonomous-agent').then(r => r.json()).then(x => { if (x.config) setCfg(x.config) }).catch(() => {})
      } else flash(d.error ?? 'Run failed', 'err')
    } catch { flash('Network error', 'err') }
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

  const rootStyle = { ...PALETTES[theme], backgroundColor: 'var(--vp-bg)' } as React.CSSProperties

  if (loading) return (
    <div style={{ ...rootStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--vp-faint)', fontSize: 13 }}>
      <style>{CSS}</style>
      Loading Vega…
    </div>
  )
  if (!cfg) return (
    <div style={{ ...rootStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#F87171', fontSize: 13 }}>
      <style>{CSS}</style>
      Could not load config.
    </div>
  )

  const pct     = cfg.budget_cap_inr > 0 ? Math.min(100, (cfg.total_deployed / cfg.budget_cap_inr) * 100) : 0
  const pnlPos  = cfg.total_pnl >= 0
  const canRun  = cfg.is_active && !running

  return (
    <div style={{ ...rootStyle, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <style>{CSS}</style>

      {/* ── FIXED TOP ─────────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, padding: '14px 14px 12px' }}>

        {/* Hero card */}
        <div style={{
          borderRadius: 14,
          background: cfg.is_active
            ? `linear-gradient(135deg, ${ACCENT}14 0%, var(--vp-surface) 60%)`
            : 'var(--vp-surface)',
          border: `1px solid ${cfg.is_active ? ACCENT + '28' : 'var(--vp-border)'}`,
          padding: '14px 16px 16px',
          transition: 'background .3s, border-color .3s',
        }}>

          {/* Name row + theme + toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Icon */}
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                backgroundColor: cfg.is_active ? ACCENT + '1A' : 'var(--vp-surface)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background-color .3s',
              }}>
                <svg
                  width="18" height="18" viewBox="0 0 18 18" fill="none"
                  className={running ? 'vega-star-running' : cfg.is_active ? 'vega-star-active' : ''}
                  style={{ color: cfg.is_active ? ACCENT : 'var(--vp-faint)', transition: 'color .3s' }}
                >
                  <path d="M9 1L11 6.5L16.5 7L12.5 11L13.5 16.5L9 13.5L4.5 16.5L5.5 11L1.5 7L7 6.5L9 1Z"
                    stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"
                    fill={cfg.is_active ? ACCENT + '28' : 'none'}
                  />
                </svg>
              </div>
              <div>
                <div style={{ color: 'var(--vp-strong)', fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>Vega</div>
                <div style={{
                  fontSize: 11, fontWeight: 600, marginTop: 1,
                  color: cfg.is_active ? 'var(--vp-accent-text)' : 'var(--vp-faint)',
                  transition: 'color .3s',
                }}>
                  {running ? 'Running scan…' : cfg.is_active ? 'Active · trading autonomously' : 'Paused'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
              <Toggle on={cfg.is_active} onChange={() => save({ is_active: !cfg.is_active })} disabled={saving} />
            </div>
          </div>

          {/* Stats row */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
            gap: 1, backgroundColor: 'var(--vp-border)', borderRadius: 10, overflow: 'hidden',
          }}>
            {/* Deployed */}
            <div style={{ backgroundColor: 'var(--vp-bg)', padding: '10px 12px' }}>
              <div style={{ color: 'var(--vp-faint)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                Deployed
              </div>
              <div style={{ color: 'var(--vp-strong)', fontSize: 15, fontWeight: 700, fontFamily: 'monospace' }}>
                {cfg.total_deployed.toLocaleString()}
              </div>
              <div style={{ marginTop: 6, height: 3, borderRadius: 2, backgroundColor: 'var(--vp-border)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  width: `${pct}%`,
                  backgroundColor: pct > 80 ? '#F59E0B' : ACCENT,
                  transition: 'width .4s ease',
                }}/>
              </div>
              <div style={{ color: 'var(--vp-fainter)', fontSize: 9, marginTop: 3 }}>
                of {cfg.budget_cap_inr.toLocaleString()} cap
              </div>
            </div>

            {/* P&L */}
            <div style={{ backgroundColor: 'var(--vp-bg)', padding: '10px 12px' }}>
              <div style={{ color: 'var(--vp-faint)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                P&amp;L
              </div>
              <div style={{ color: pnlPos ? 'var(--vp-accent-text)' : '#F87171', fontSize: 15, fontWeight: 700, fontFamily: 'monospace' }}>
                {pnlPos ? '+' : ''}{cfg.total_pnl.toLocaleString()}
              </div>
              <div style={{ marginTop: 6, height: 3, borderRadius: 2, backgroundColor: 'var(--vp-border)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 2, width: '100%',
                  backgroundColor: pnlPos ? ACCENT + '44' : '#F8717144',
                }}/>
              </div>
              <div style={{ color: 'var(--vp-fainter)', fontSize: 9, marginTop: 3 }}>
                {pnlPos ? 'in profit' : 'in loss'}
              </div>
            </div>

            {/* Last run */}
            <div style={{ backgroundColor: 'var(--vp-bg)', padding: '10px 12px' }}>
              <div style={{ color: 'var(--vp-faint)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                Last run
              </div>
              {cfg.last_run_at ? (
                <>
                  <div style={{ color: 'var(--vp-text)', fontSize: 12, fontWeight: 700 }}>
                    {new Date(cfg.last_run_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div style={{ color: 'var(--vp-fainter)', fontSize: 9, marginTop: 2 }}>
                    {new Date(cfg.last_run_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </div>
                </>
              ) : (
                <div style={{ color: 'var(--vp-fainter)', fontSize: 12, fontWeight: 700, marginTop: 2 }}>—</div>
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
              backgroundColor: canRun ? ACCENT : 'var(--vp-surface)',
              border: `1px solid ${canRun ? ACCENT : 'var(--vp-border)'}`,
              color: canRun ? '#000' : 'var(--vp-fainter)',
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
              color: 'var(--vp-accent-text)',
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
        {msg && (() => {
          const tone = msg.kind === 'ok'
            ? { bg: ACCENT + '12', bd: ACCENT + '30', fg: 'var(--vp-accent-text)', icon: '✓ ' }
            : msg.kind === 'info'
            ? { bg: 'var(--vp-surface)', bd: 'var(--vp-border)', fg: 'var(--vp-text)', icon: 'ⓘ ' }
            : { bg: 'rgba(248,113,113,0.1)', bd: 'rgba(248,113,113,0.25)', fg: '#F87171', icon: '✕ ' }
          return (
            <div className="vega-msg" style={{
              marginTop: 8, padding: '7px 12px', borderRadius: 8, textAlign: 'center',
              backgroundColor: tone.bg, border: `1px solid ${tone.bd}`,
              color: tone.fg, fontSize: 12, fontWeight: 600, lineHeight: 1.45,
            }}>
              {tone.icon}{msg.text}
            </div>
          )
        })()}

        {/* Tab switcher */}
        <div style={{ marginTop: 12 }}>
          <Segmented tab={tab} activityCount={activity.length} onChange={setTab} />
        </div>
      </div>

      {/* ── SCROLLABLE BODY ────────────────────────────────────────────────────── */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '0 14px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {tab === 'settings' && (
            <>
              {/* Risk limits group */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <SectionLabel>Risk limits</SectionLabel>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Budget cap" hint="total">
                    <NumInput value={cfg.budget_cap_inr} onChange={v => setCfg({ ...cfg, budget_cap_inr: v })} min={50} max={50000} step={50} />
                  </Field>
                  <Field label="Max position size" hint="per trade">
                    <NumInput value={cfg.max_position_size} onChange={v => setCfg({ ...cfg, max_position_size: v })} min={10} max={cfg.budget_cap_inr} step={10} />
                  </Field>
                </div>

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
                      color: 'var(--vp-accent-text)', fontSize: 12, fontWeight: 700, fontFamily: 'monospace',
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
                          backgroundColor: on ? ACCENT + '18' : 'var(--vp-surface)',
                          border: `1px solid ${on ? ACCENT + '40' : 'var(--vp-border)'}`,
                          color: on ? 'var(--vp-accent-text)' : 'var(--vp-dim)',
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
                          backgroundColor: on ? ACCENT + '18' : 'var(--vp-surface)',
                          border: `1px solid ${on ? ACCENT + '40' : 'var(--vp-border)'}`,
                          color: on ? 'var(--vp-accent-text)' : 'var(--vp-dim)',
                        }}>
                          {s.label}
                        </button>
                      )
                    })}
                  </div>
                </Field>
              </div>

              <p style={{ color: 'var(--vp-fainter)', fontSize: 10, lineHeight: 1.5, margin: 0, textAlign: 'center' }}>
                Vega is an automated trading agent. This is not financial advice.
                You are responsible for funds deployed within your configured limits.
              </p>
            </>
          )}

          {tab === 'activity' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 14 }}>
              {activity.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '24px 0',
                  color: 'var(--vp-fainter)', fontSize: 12,
                  backgroundColor: 'var(--vp-surface)', borderRadius: 10,
                  border: `1px solid var(--vp-border)`,
                }}>
                  No activity yet — activate Vega and run to see trades here.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {activity.slice(0, 20).map(a => {
                    const meta = ACTION_META[a.action] ?? { label: a.action.toUpperCase(), color: 'var(--vp-dim)' }
                    return (
                      <div key={a.id} className={flashId === a.id ? 'vega-flash' : ''} style={{
                        backgroundColor: 'var(--vp-surface)', border: `1px solid var(--vp-border)`,
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
                                backgroundColor: 'var(--vp-border)',
                                borderRadius: 4, padding: '1px 6px',
                                color: 'var(--vp-dim)', fontSize: 10, fontFamily: 'monospace',
                              }}>
                                {a.amount.toFixed(0)}
                              </span>
                            )}
                            {a.realized_pnl != null && (
                              <span style={{
                                color: a.realized_pnl >= 0 ? 'var(--vp-accent-text)' : '#F87171',
                                fontSize: 10, fontFamily: 'monospace', fontWeight: 700,
                              }}>
                                {a.realized_pnl >= 0 ? '+' : ''}{a.realized_pnl.toFixed(0)}
                              </span>
                            )}
                          </div>
                          <span style={{ color: 'var(--vp-fainter)', fontSize: 10, whiteSpace: 'nowrap' }}>
                            {new Date(a.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        {a.rationale && (
                          <p style={{ color: 'var(--vp-dim)', fontSize: 11, lineHeight: 1.45, margin: 0 }}>{a.rationale}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
