'use client'

import { useState, useEffect } from 'react'

interface AgentPermissions {
  read:     boolean
  write:    boolean
  generate: boolean
  publish:  boolean
}

interface AgentRetryPolicy {
  max_attempts:    number
  backoff_seconds: number[]
}

interface AgentConfig {
  id:                   string
  agent_type:           string
  system_prompt:        string
  temperature:          number
  max_tokens:           number
  rate_limit_per_minute: number
  rate_limit_per_day:   number
  tools_enabled:        string[]
  is_active:            boolean
  version:              number
  updated_at:           string
  // ── §23 full registry attributes (optional-safe) ──────────────────────────
  mission?:               string
  responsibilities?:      string[]
  capabilities?:          string[]
  restrictions?:          string[]
  memory_sources?:        string[]
  provider?:              'anthropic' | 'openai' | null
  model?:                 string | null
  streaming?:             boolean
  timeout_seconds?:       number
  retry_policy?:          AgentRetryPolicy | null
  permissions?:           AgentPermissions | null
  output_schema?:         Record<string, unknown> | null
  escalation_target?:     string | null
  execution_priority?:    number
  supported_asset_types?: string[]
  supported_languages?:   string[]
}

const DEFAULT_PERMISSIONS: AgentPermissions = { read: true, write: true, generate: false, publish: false }
const DEFAULT_RETRY: AgentRetryPolicy = { max_attempts: 3, backoff_seconds: [1, 2, 4] }

// ── §23 helpers: defaults + array/text bridges ────────────────────────────────
const linesToArray = (s: string): string[] => s.split('\n').map(x => x.trim()).filter(Boolean)
const arrayToLines = (a?: string[] | null): string => (a ?? []).join('\n')
const csvToArray   = (s: string): string[] => s.split(',').map(x => x.trim()).filter(Boolean)
const arrayToCsv   = (a?: string[] | null): string => (a ?? []).join(', ')

function getPermissions(cfg: AgentConfig): AgentPermissions {
  return cfg.permissions ?? DEFAULT_PERMISSIONS
}
function getRetry(cfg: AgentConfig): AgentRetryPolicy {
  return cfg.retry_policy ?? DEFAULT_RETRY
}

interface EvalStats {
  total:       number
  thumbsUp:    number
  thumbsDown:  number
  avgLatencyMs: number | null
}

// ── Agent metadata + icons ───────────────────────────────────────────────────
function AgentGlyph({ type, size = 18 }: { type: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 18 18', fill: 'none' as const }
  if (type === 'player') {
    return (
      <svg {...common}>
        <circle cx="9" cy="5.5" r="3" stroke="currentColor" strokeWidth="1.4" />
        <path d="M3 15.5c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    )
  }
  if (type === 'company') {
    return (
      <svg {...common}>
        <rect x="2.5" y="2.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
        <rect x="10.5" y="2.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
        <rect x="2.5" y="10.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
        <rect x="10.5" y="10.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    )
  }
  if (type === 'mm_desk') {
    // candlestick / book
    return (
      <svg {...common}>
        <path d="M5 2.5v13M13 2.5v13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <rect x="3" y="6" width="4" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
        <rect x="11" y="4" width="4" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    )
  }
  if (type === 'campaign_director_agent') {
    // clapperboard — the Director
    return (
      <svg {...common}>
        <rect x="2.5" y="6" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M2.5 6l2-3 3 2 3-2 3 2" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    )
  }
  // marketing sub-agents (copywriter / prompt-optimizer / router) — a spark
  return (
    <svg {...common}>
      <path d="M9 2.5l1.6 4.9H15l-3.7 2.7 1.4 4.4L9 11.8 5.3 14.5l1.4-4.4L3 7.4h4.4L9 2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

const AGENT_LABELS: Record<string, { label: string; color: string; desc: string; tag: string }> = {
  player:   { label: 'Player Assistant',  color: '#00C853', desc: 'Visible to all players as a floating chat widget', tag: 'Verdikt AI' },
  company:  { label: 'Ops Assistant',     color: '#6366F1', desc: 'Platform metrics & risk analysis on the Company dashboard', tag: 'Ops AI' },
  mm_desk:  { label: 'MM Desk Assistant', color: '#F59E0B', desc: 'Repricing & book analysis on the MM Desk', tag: 'MM AI' },
  campaign_director_agent: { label: 'Campaign Director', color: '#9B6FF5', desc: 'Marketing workspace — interviews you, then orchestrates the sub-agents', tag: 'Marketing AI' },
  mkt_copywriter:          { label: 'Copywriter',        color: '#00C853', desc: 'Marketing sub-agent — headline hooks + copy variants', tag: 'Marketing AI' },
  mkt_prompt_optimizer:    { label: 'Prompt Optimizer',  color: '#E0A020', desc: 'Marketing sub-agent — cinematic, localized image/video prompts', tag: 'Marketing AI' },
  mkt_router:              { label: 'Router',             color: '#E05C20', desc: 'Marketing sub-agent — picks the optimal model + channel per asset', tag: 'Marketing AI' },
  mkt_brand_guardian:      { label: 'Brand Guardian',     color: '#9B6FF5', desc: 'Approval gate — approves or rejects content on brand alignment', tag: 'Marketing AI' },
  mkt_compliance:          { label: 'Compliance',         color: '#DC2626', desc: 'Regulatory gate — screens content against regional iGaming rules', tag: 'Marketing AI' },
  mkt_seo:                 { label: 'SEO Specialist',     color: '#00C853', desc: 'Optimizes content for search — keywords, meta tags, recommendations', tag: 'Marketing AI' },
  mkt_reviewer:            { label: 'Reviewer / QA',      color: '#E0A020', desc: 'Final quality gate — scores content and decides pass or regenerate', tag: 'Marketing AI' },
}

const ALL_TOOLS = [
  { id: 'get_player_portfolio',  label: 'Player Portfolio',   agents: ['player'] },
  { id: 'get_market_detail',     label: 'Market Detail',      agents: ['player', 'mm_desk'] },
  { id: 'get_live_markets',      label: 'Live Markets',       agents: ['player', 'company', 'mm_desk'] },
  { id: 'get_platform_metrics',  label: 'Platform Metrics',   agents: ['company'] },
  { id: 'get_risk_markets',      label: 'Risk Markets',       agents: ['company', 'mm_desk'] },
  { id: 'get_ai_stats',          label: 'AI Stats',           agents: ['company'] },
  { id: 'get_open_book',         label: 'Open Book (MM)',     agents: ['mm_desk'] },
  { id: 'get_market_risk',       label: 'Market Risk (MM)',   agents: ['mm_desk'] },
]

const CARD_BG = 'var(--bg-surface-2)'
const CARD_BORDER = 'var(--border)'

// ── Section header with accent icon ──────────────────────────────────────────
function SectionLabel({ children, accent }: { children: React.ReactNode; accent: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
      <span style={{ width: 3, height: 12, borderRadius: 2, backgroundColor: accent }} />
      <span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {children}
      </span>
    </div>
  )
}

// ── Slider ───────────────────────────────────────────────────────────────────
function Slider({
  label, min, max, step = 1, value, unit = '', onChange, accent,
}: {
  label: string; min: number; max: number; step?: number
  value: number; unit?: string; onChange: (v: number) => void; accent: string
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 500 }}>{label}</span>
        <span style={{
          color: accent, fontSize: 12.5, fontWeight: 700, fontFamily: 'monospace',
          backgroundColor: accent + '14', padding: '1px 8px', borderRadius: 6,
        }}>
          {value}{unit}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          width: '100%', cursor: 'pointer', height: 4, borderRadius: 3, appearance: 'none', WebkitAppearance: 'none',
          background: `linear-gradient(90deg, ${accent} ${pct}%, var(--border) ${pct}%)`,
          accentColor: accent,
        }}
      />
    </div>
  )
}

// ── Satisfaction ring ────────────────────────────────────────────────────────
function SatisfactionRing({ pct, color }: { pct: number | null; color: string }) {
  const r = 26
  const circ = 2 * Math.PI * r
  const dash = pct != null ? (pct / 100) * circ : 0
  return (
    <div style={{ position: 'relative', width: 68, height: 68 }}>
      <svg width="68" height="68" viewBox="0 0 68 68" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="34" cy="34" r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
        {pct != null && (
          <circle
            cx="34" cy="34" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`} style={{ transition: 'stroke-dasharray 0.5s' }}
          />
        )}
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ color: 'var(--text-strong)', fontSize: 16, fontWeight: 800, fontFamily: 'monospace' }}>
          {pct != null ? `${Math.round(pct)}%` : '—'}
        </span>
      </div>
    </div>
  )
}

interface VegaPerformance {
  total_deployed:              number
  total_pnl:                   number
  trades:                      number
  resolved_count:              number
  win_rate:                    number | null
  brier:                       number | null
  avg_edge_pp:                 number | null
  open_positions:              number
  active_agents:               number
  calibration_label:           string
  circuit_breaker_hits_today:  number
}

interface AutonomousOverview {
  agents_enabled: boolean
  paused_reason:  string | null
  active_count:   number
  total_count:    number
  total_deployed: number
  total_pnl:      number
  entries_today:  number
  exits_today:    number
  errors_today:   number
}

export function AgentsTab() {
  const [configs, setConfigs]     = useState<AgentConfig[]>([])
  const [selected, setSelected]   = useState<string>('player')
  const [editing, setEditing]     = useState<AgentConfig | null>(null)
  const [saving, setSaving]       = useState(false)
  const [saveMsg, setSaveMsg]     = useState<string | null>(null)
  const [evalStats, setEvalStats] = useState<Record<string, EvalStats>>({})
  const [auto, setAuto]           = useState<AutonomousOverview | null>(null)
  const [vega, setVega]           = useState<VegaPerformance | null>(null)
  const [togglingKill, setTogglingKill] = useState(false)
  const [toolsOpen, setToolsOpen] = useState<string | null>(null)
  // §23 — output_schema is edited as raw JSON text; parsed on change.
  const [schemaText, setSchemaText] = useState<string>('')
  const [schemaErr, setSchemaErr]   = useState<string | null>(null)

  const loadAutonomous = () => {
    fetch('/api/agents/autonomous')
      .then(r => r.json())
      .then(d => { if (typeof d.agents_enabled === 'boolean') setAuto(d) })
      .catch(() => {})
  }

  useEffect(() => {
    fetch('/api/agents/configs')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d.configs)) {
          setConfigs(d.configs)
          const first = d.configs.find((c: AgentConfig) => c.agent_type === 'player') ?? d.configs[0]
          if (first) {
            setEditing(JSON.parse(JSON.stringify(first)))
            setSchemaText(first.output_schema ? JSON.stringify(first.output_schema, null, 2) : '')
            setSchemaErr(null)
          }
        }
      })
      .catch(() => {})

    fetch('/api/agents/evals')
      .then(r => r.json())
      .then(d => { if (d.stats) setEvalStats(d.stats) })
      .catch(() => {})

    loadAutonomous()

    fetch('/api/agents/vega-performance')
      .then(r => r.json())
      .then(d => { if (typeof d.trades === 'number') setVega(d) })
      .catch(() => {})
  }, [])

  const toggleKillSwitch = async () => {
    if (!auto) return
    const next = !auto.agents_enabled
    setTogglingKill(true)
    try {
      const res = await fetch('/api/agents/autonomous', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ agents_enabled: next, paused_reason: next ? null : 'Paused by Ops from dashboard' }),
      })
      if (res.ok) setAuto({ ...auto, agents_enabled: next })
    } catch { /* ignore */ }
    finally { setTogglingKill(false) }
  }

  const selectAgent = (type: string) => {
    setSelected(type)
    const cfg = configs.find(c => c.agent_type === type)
    if (cfg) {
      setEditing(JSON.parse(JSON.stringify(cfg)))
      setSchemaText(cfg.output_schema ? JSON.stringify(cfg.output_schema, null, 2) : '')
    }
    setSchemaErr(null)
    setSaveMsg(null)
  }

  const save = async () => {
    if (!editing) return

    // §23 — resolve output_schema from the raw JSON textarea.
    let outputSchema: Record<string, unknown> | null = null
    const trimmed = schemaText.trim()
    if (trimmed) {
      try {
        const parsed = JSON.parse(trimmed)
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          setSchemaErr('Output schema must be a JSON object.')
          return
        }
        outputSchema = parsed as Record<string, unknown>
      } catch {
        setSchemaErr('Invalid JSON.')
        return
      }
    }
    setSchemaErr(null)

    const payload: AgentConfig = { ...editing, output_schema: outputSchema }

    setSaving(true)
    setSaveMsg(null)
    try {
      const res = await fetch('/api/agents/configs', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const d = await res.json()
      if (res.ok) {
        setConfigs(prev => prev.map(c => c.agent_type === editing.agent_type ? payload : c))
        setSaveMsg('Saved successfully.')
        setTimeout(() => setSaveMsg(null), 2500)
      } else {
        setSaveMsg(`Error: ${d.error ?? 'Unknown'}`)
      }
    } catch {
      setSaveMsg('Network error.')
    } finally {
      setSaving(false)
    }
  }

  const toggleTool = (toolId: string) => {
    if (!editing) return
    const enabled = editing.tools_enabled.includes(toolId)
    setEditing({
      ...editing,
      tools_enabled: enabled
        ? editing.tools_enabled.filter(t => t !== toolId)
        : [...editing.tools_enabled, toolId],
    })
  }

  const cfg = editing
  const meta = AGENT_LABELS[selected]
  const stats = evalStats[selected]
  const satisfaction = stats && (stats.thumbsUp + stats.thumbsDown) > 0
    ? (stats.thumbsUp / (stats.thumbsUp + stats.thumbsDown)) * 100
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, height: '100%' }}>

      {/* ── Vega Performance — headline calibration & P&L panel ─────────────── */}
      {vega && (
        <div style={{
          backgroundColor: CARD_BG,
          border: `1px solid ${CARD_BORDER}`,
          borderRadius: 14,
          padding: '18px 22px',
        }}>
          <SectionLabel accent="#9B72E8">Vega Performance · all time</SectionLabel>

          {vega.trades === 0 ? (
            <div style={{
              marginTop: 16, padding: '22px 18px',
              backgroundColor: 'var(--bg-inset)',
              border: `1px dashed ${CARD_BORDER}`,
              borderRadius: 11, textAlign: 'center',
            }}>
              <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>
                No Vega trades yet
              </div>
              <div style={{ color: 'var(--text-faint)', fontSize: 12, marginTop: 5, lineHeight: 1.5 }}>
                Performance &amp; calibration will populate once Vega starts trading.
              </div>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))',
              gap: 1,
              marginTop: 14,
              backgroundColor: 'var(--border)',
              border: `1px solid ${CARD_BORDER}`,
              borderRadius: 12,
              overflow: 'hidden',
            }}>
              <VegaMetric
                label="Total P&L"
                value={`${vega.total_pnl >= 0 ? '+' : ''}${vega.total_pnl.toLocaleString()}`}
                color={vega.total_pnl >= 0 ? '#00C853' : '#DC2626'}
              />
              <VegaMetric label="Deployed" value={vega.total_deployed.toLocaleString()} />
              <VegaMetric
                label="Win Rate"
                value={vega.win_rate != null ? `${(vega.win_rate * 100).toFixed(0)}%` : '—'}
              />
              <VegaMetric
                label="Brier"
                value={vega.brier != null ? vega.brier.toFixed(3) : '—'}
                sub={vega.calibration_label}
              />
              <VegaMetric
                label="Avg Edge"
                value={vega.avg_edge_pp != null ? `${vega.avg_edge_pp.toFixed(1)} pp` : '—'}
              />
              <VegaMetric label="Trades" value={String(vega.trades)} />
              <VegaMetric label="Open Positions" value={String(vega.open_positions)} />
              <VegaMetric label="Active Agents" value={String(vega.active_agents)} />
              <VegaMetric
                label="CB Hits Today"
                value={String(vega.circuit_breaker_hits_today ?? 0)}
                color={(vega.circuit_breaker_hits_today ?? 0) > 0 ? '#F59E0B' : undefined}
                sub={(vega.circuit_breaker_hits_today ?? 0) > 0 ? 'breaker triggered' : 'all clear'}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Vega autonomous overview — gradient hero + kill-switch ──────────── */}
      {auto && (
        <div style={{
          position: 'relative',
          overflow: 'hidden',
          background: auto.agents_enabled
            ? 'linear-gradient(135deg, var(--bg-surface-2) 0%, rgba(0,200,83,0.10) 100%)'
            : 'linear-gradient(135deg, rgba(220,38,38,0.08) 0%, rgba(220,38,38,0.12) 100%)',
          border: `1px solid ${auto.agents_enabled ? '#00C85328' : '#DC262640'}`,
          borderRadius: 14,
          padding: '18px 22px',
        }}>
          {/* glow accent */}
          <div style={{
            position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%',
            background: auto.agents_enabled ? '#00C85318' : '#DC262618', filter: 'blur(40px)', pointerEvents: 'none',
          }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              <div style={{
                width: 42, height: 42, borderRadius: 11,
                backgroundColor: auto.agents_enabled ? '#00C85320' : '#DC262620',
                color: auto.agents_enabled ? '#00C853' : '#F87171',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: auto.agents_enabled ? '0 0 16px #00C85330' : 'none',
              }}>
                <svg width="22" height="22" viewBox="0 0 18 18" fill="none">
                  <path d="M9 1L11 6.5L16.5 7L12.5 11L13.5 16.5L9 13.5L4.5 16.5L5.5 11L1.5 7L7 6.5L9 1Z"
                    stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"
                    fill={auto.agents_enabled ? '#00C85330' : 'none'} />
                </svg>
              </div>
              <div>
                <div style={{ color: 'var(--text-strong)', fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em' }}>
                  Vega — Autonomous Trading
                </div>
                <div style={{ color: auto.agents_enabled ? 'var(--text-faint)' : '#F87171', fontSize: 12, marginTop: 3, fontWeight: 500 }}>
                  {auto.agents_enabled
                    ? `${auto.active_count} of ${auto.total_count} player agent${auto.total_count !== 1 ? 's' : ''} active`
                    : 'GLOBALLY PAUSED — no autonomous trades will execute'}
                </div>
              </div>
            </div>

            <button
              onClick={toggleKillSwitch}
              disabled={togglingKill}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 18px',
                borderRadius: 10,
                border: `1px solid ${auto.agents_enabled ? '#DC262650' : '#00C85350'}`,
                backgroundColor: auto.agents_enabled ? '#DC262618' : '#00C85318',
                color: auto.agents_enabled ? '#F87171' : '#00C853',
                fontSize: 12.5, fontWeight: 700,
                cursor: togglingKill ? 'wait' : 'pointer',
                opacity: togglingKill ? 0.6 : 1,
                whiteSpace: 'nowrap',
                transition: 'all 0.15s',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                {auto.agents_enabled
                  ? <path d="M7 1.5v6M3.5 3.2a5 5 0 107 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  : <path d="M4 2.5l7 4.5-7 4.5z" fill="currentColor" />}
              </svg>
              {togglingKill ? 'Working…' : auto.agents_enabled ? 'Pause all agents' : 'Resume all agents'}
            </button>
          </div>

          {/* Aggregate stat strip */}
          <div style={{
            position: 'relative',
            display: 'flex', gap: 0, marginTop: 18,
            backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '12px 4px',
            flexWrap: 'wrap',
          }}>
            {[
              { label: 'Capital deployed', value: auto.total_deployed.toLocaleString(), color: 'var(--text-strong)' },
              { label: 'Aggregate P&L', value: `${auto.total_pnl >= 0 ? '+' : ''}${auto.total_pnl.toLocaleString()}`, color: auto.total_pnl >= 0 ? '#00C853' : '#F87171' },
              { label: 'Entries today', value: String(auto.entries_today), color: 'var(--text-strong)' },
              { label: 'Exits today', value: String(auto.exits_today), color: '#F59E0B' },
              { label: 'Errors today', value: String(auto.errors_today), color: auto.errors_today > 0 ? '#F87171' : 'var(--text-dim)' },
            ].map((s, i) => (
              <div key={s.label} style={{
                flex: 1, minWidth: 110, padding: '0 16px',
                borderLeft: i === 0 ? 'none' : '1px solid var(--border-soft)',
              }}>
                <div style={{ color: 'var(--text-dim)', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                <div style={{ color: s.color, fontSize: 18, fontWeight: 800, fontFamily: 'monospace', marginTop: 3 }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Config row ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 24, flex: 1, minHeight: 0 }}>

        {/* ── Agent selector ────────────────────────────────────────────────── */}
        <div style={{ width: 214, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ color: 'var(--text-faint)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 2px 2px' }}>
            Assistants
          </p>
          {Object.entries(AGENT_LABELS).map(([type, m]) => {
            const isSel = selected === type
            const agentCfg = configs.find(c => c.agent_type === type)
            const active = agentCfg?.is_active
            // Tools this agent has deployed = enabled tools available to its type
            const deployed = ALL_TOOLS.filter(t =>
              t.agents.includes(type) && (agentCfg?.tools_enabled?.includes(t.id) ?? false)
            )
            const isToolsOpen = toolsOpen === type
            return (
              <div
                key={type}
                onClick={() => selectAgent(type)}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 9,
                  width: '100%', padding: '11px 13px',
                  cursor: 'pointer', textAlign: 'left',
                  background: isSel ? `linear-gradient(135deg, ${m.color}1A, ${m.color}08)` : CARD_BG,
                  border: `1px solid ${isSel ? m.color + '50' : CARD_BORDER}`,
                  borderRadius: 11,
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                    backgroundColor: m.color + (isSel ? '22' : '12'),
                    color: isSel ? m.color : 'var(--text-faint)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <AgentGlyph type={type} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: isSel ? 'var(--text-strong)' : 'var(--text-muted)', fontSize: 13, fontWeight: isSel ? 700 : 600 }}>
                      {m.label}
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        backgroundColor: active ? m.color : 'var(--text-faintest)',
                        boxShadow: active ? `0 0 6px ${m.color}` : 'none',
                      }} />
                      <span style={{ color: active ? m.color : 'var(--text-faint)', fontSize: 10, fontWeight: 600 }}>
                        {active ? 'Live' : 'Off'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tools affordance */}
                <div
                  onClick={e => { e.stopPropagation(); setToolsOpen(isToolsOpen ? null : type) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 8px', borderRadius: 8,
                    backgroundColor: isToolsOpen ? m.color + '14' : 'var(--fill-subtle)',
                    border: `1px solid ${isToolsOpen ? m.color + '40' : 'var(--fill-soft)'}`,
                    cursor: 'pointer',
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M7.5 1.5C8.5 1.5 9.5 2.5 9.5 3.5C9.5 4 9.3 4.4 9 4.8L10.5 6.3L9 7.8L7.5 6.3C7.1 6.6 6.7 6.8 6.2 6.8C5.2 6.8 4.2 5.8 4.2 4.8L1.8 7.2L2.5 7.9L1.5 8.9L3.1 10.5L4.1 9.5L4.8 10.2L7.2 7.8" stroke={isToolsOpen ? m.color : 'var(--text-faint)'} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span style={{ flex: 1, color: isToolsOpen ? m.color : 'var(--text-faint)', fontSize: 10.5, fontWeight: 600 }}>
                    Tools
                  </span>
                  <span style={{
                    fontSize: 9.5, fontWeight: 700, fontFamily: 'monospace',
                    color: m.color, backgroundColor: m.color + '1A',
                    padding: '1px 6px', borderRadius: 999,
                  }}>
                    {deployed.length}
                  </span>
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{ transform: isToolsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                    <path d="M2 3.5L4.5 6L7 3.5" stroke={isToolsOpen ? m.color : 'var(--text-faint)'} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>

                {/* Tools list */}
                {isToolsOpen && (
                  <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 2 }}>
                    {deployed.length === 0 ? (
                      <span style={{ color: 'var(--text-faint)', fontSize: 11, padding: '4px 6px' }}>No tools deployed.</span>
                    ) : deployed.map(t => (
                      <div key={t.id} style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        padding: '5px 8px', borderRadius: 7,
                        backgroundColor: 'var(--fill-subtle)',
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: m.color, flexShrink: 0 }} />
                        <span style={{ color: 'var(--text)', fontSize: 11, fontWeight: 500, flex: 1 }}>{t.label}</span>
                        <span style={{ color: 'var(--text-faint)', fontSize: 9, fontFamily: 'monospace' }}>{t.id}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Config panel ──────────────────────────────────────────────────── */}
        {cfg && meta && (
          <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Agent header card */}
            <div style={{
              background: `linear-gradient(135deg, ${meta.color}12, ${CARD_BG})`,
              border: `1px solid ${meta.color}28`,
              borderRadius: 13,
              padding: '16px 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 11,
                  backgroundColor: meta.color + '20', color: meta.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <AgentGlyph type={selected} size={20} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'var(--text-strong)', fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em' }}>{meta.label}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: meta.color,
                      backgroundColor: meta.color + '18', padding: '2px 7px', borderRadius: 5,
                    }}>{meta.tag}</span>
                    <span style={{ color: 'var(--text-faint)', fontSize: 10.5, fontFamily: 'monospace' }}>v{cfg.version}</span>
                  </div>
                  <div style={{ color: 'var(--text-faint)', fontSize: 12, marginTop: 3 }}>{meta.desc}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <div
                    onClick={() => setEditing({ ...cfg, is_active: !cfg.is_active })}
                    style={{
                      width: 38, height: 21, borderRadius: 11,
                      backgroundColor: cfg.is_active ? meta.color : 'var(--text-faintest)',
                      position: 'relative', cursor: 'pointer', transition: 'background-color 0.2s',
                    }}
                  >
                    <div style={{
                      position: 'absolute', top: 3, left: cfg.is_active ? 20 : 3,
                      width: 15, height: 15, borderRadius: '50%',
                      backgroundColor: '#fff', transition: 'left 0.2s',
                    }} />
                  </div>
                  <span style={{ color: cfg.is_active ? 'var(--text-strong)' : 'var(--text-dim)', fontSize: 12, fontWeight: 600 }}>
                    {cfg.is_active ? 'Active' : 'Inactive'}
                  </span>
                </label>
                <button
                  onClick={save}
                  disabled={saving}
                  style={{
                    padding: '8px 20px', borderRadius: 9,
                    backgroundColor: meta.color, border: 'none', color: '#fff',
                    fontSize: 12.5, fontWeight: 700,
                    cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
                    boxShadow: `0 2px 12px ${meta.color}40`,
                  }}
                >
                  {saving ? 'Saving…' : 'Save Config'}
                </button>
              </div>
            </div>

            {saveMsg && (
              <div style={{
                padding: '9px 14px', borderRadius: 9,
                backgroundColor: saveMsg.startsWith('Error') ? '#DC262615' : '#00C85315',
                border: `1px solid ${saveMsg.startsWith('Error') ? '#DC262630' : '#00C85330'}`,
                color: saveMsg.startsWith('Error') ? '#F87171' : '#4ADE80',
                fontSize: 12.5, fontWeight: 600,
              }}>
                {saveMsg}
              </div>
            )}

            {/* Eval stats */}
            {stats && (
              <div style={{
                backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}`,
                borderRadius: 13, padding: '18px 20px',
              }}>
                <SectionLabel accent={meta.color}>Evaluations · all time</SectionLabel>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: 24, marginTop: 14, alignItems: 'center' }}>
                  {/* Satisfaction ring */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <SatisfactionRing pct={satisfaction} color={meta.color} />
                    <span style={{ color: 'var(--text-dim)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Satisfaction</span>
                  </div>
                  {/* Feedback bars */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <FeedbackRow label="Thumbs up"   value={stats.thumbsUp}   total={stats.total} color="#00C853" />
                    <FeedbackRow label="Thumbs down" value={stats.thumbsDown} total={stats.total} color="#DC2626" />
                  </div>
                  {/* Numbers */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderLeft: '1px solid var(--border-soft)', paddingLeft: 24 }}>
                    <Stat label="Total messages" value={String(stats.total)} />
                    <Stat label="Avg latency" value={stats.avgLatencyMs != null ? `${Math.round(stats.avgLatencyMs)}ms` : '—'} />
                  </div>
                </div>
              </div>
            )}

            {/* System prompt */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <SectionLabel accent={meta.color}>System Prompt</SectionLabel>
              <textarea
                value={cfg.system_prompt}
                onChange={e => setEditing({ ...cfg, system_prompt: e.target.value })}
                rows={12}
                spellCheck={false}
                style={{
                  width: '100%', backgroundColor: 'var(--bg-inset)',
                  border: `1px solid ${CARD_BORDER}`, borderRadius: 11,
                  padding: '14px 16px', color: 'var(--text)', fontSize: 12,
                  fontFamily: 'ui-monospace, SFMono-Regular, monospace', lineHeight: 1.65,
                  resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = meta.color + '60' }}
                onBlur={e => { e.currentTarget.style.borderColor = CARD_BORDER }}
              />
            </div>

            {/* Parameters */}
            <div style={{
              backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}`,
              borderRadius: 13, padding: '18px 20px',
              display: 'flex', flexDirection: 'column', gap: 18,
            }}>
              <SectionLabel accent={meta.color}>Rate Limits</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 28px' }}>
                <Slider accent={meta.color} label="Rate limit / minute" min={1} max={60} value={cfg.rate_limit_per_minute} onChange={v => setEditing({ ...cfg, rate_limit_per_minute: v })} />
                <Slider accent={meta.color} label="Rate limit / day" min={10} max={5000} step={10} value={cfg.rate_limit_per_day} onChange={v => setEditing({ ...cfg, rate_limit_per_day: v })} />
              </div>
            </div>

            {/* ── §23 Identity ──────────────────────────────────────────────── */}
            <div style={{
              backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}`,
              borderRadius: 13, padding: '18px 20px',
              display: 'flex', flexDirection: 'column', gap: 16,
            }}>
              <SectionLabel accent={meta.color}>Identity</SectionLabel>
              <FieldLabel>Mission</FieldLabel>
              <ConfigTextarea
                accent={meta.color} rows={3} value={cfg.mission ?? ''}
                placeholder="One-sentence mandate for this agent…"
                onChange={v => setEditing({ ...cfg, mission: v })}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <FieldLabel>Responsibilities <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(one per line)</span></FieldLabel>
                  <ConfigTextarea
                    accent={meta.color} rows={5} value={arrayToLines(cfg.responsibilities)}
                    placeholder={'Draft daily market briefs\nMonitor open positions'}
                    onChange={v => setEditing({ ...cfg, responsibilities: linesToArray(v) })}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <FieldLabel>Restrictions <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(one per line)</span></FieldLabel>
                  <ConfigTextarea
                    accent={meta.color} rows={5} value={arrayToLines(cfg.restrictions)}
                    placeholder={'Never give financial advice\nNo PII in outputs'}
                    onChange={v => setEditing({ ...cfg, restrictions: linesToArray(v) })}
                  />
                </div>
              </div>
            </div>

            {/* ── §23 Model ─────────────────────────────────────────────────── */}
            <div style={{
              backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}`,
              borderRadius: 13, padding: '18px 20px',
              display: 'flex', flexDirection: 'column', gap: 16,
            }}>
              <SectionLabel accent={meta.color}>Model</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <FieldLabel>Provider</FieldLabel>
                  <ConfigSelect
                    accent={meta.color}
                    value={cfg.provider ?? ''}
                    options={[
                      { value: '', label: 'Auto (task router)' },
                      { value: 'anthropic', label: 'anthropic' },
                      { value: 'openai', label: 'openai' },
                    ]}
                    onChange={v => setEditing({ ...cfg, provider: v === '' ? null : (v as 'anthropic' | 'openai') })}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <FieldLabel>Model</FieldLabel>
                  <ConfigInput
                    accent={meta.color}
                    value={cfg.model ?? ''}
                    placeholder="default by task router"
                    onChange={v => setEditing({ ...cfg, model: v.trim() === '' ? null : v })}
                  />
                </div>
              </div>
            </div>

            {/* ── §23 Runtime ───────────────────────────────────────────────── */}
            <div style={{
              backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}`,
              borderRadius: 13, padding: '18px 20px',
              display: 'flex', flexDirection: 'column', gap: 18,
            }}>
              <SectionLabel accent={meta.color}>Runtime</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 28px' }}>
                <Slider accent={meta.color} label="Temperature" min={0} max={1} step={0.05} value={cfg.temperature} onChange={v => setEditing({ ...cfg, temperature: v })} />
                <Slider accent={meta.color} label="Max tokens" min={256} max={4096} step={128} value={cfg.max_tokens} onChange={v => setEditing({ ...cfg, max_tokens: v })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px 20px', alignItems: 'end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <FieldLabel>Timeout (seconds)</FieldLabel>
                  <ConfigInput
                    accent={meta.color} type="number"
                    value={String(cfg.timeout_seconds ?? 60)}
                    onChange={v => setEditing({ ...cfg, timeout_seconds: Math.max(1, Math.round(Number(v) || 0)) })}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <FieldLabel>Retry — max attempts</FieldLabel>
                  <ConfigInput
                    accent={meta.color} type="number"
                    value={String(getRetry(cfg).max_attempts)}
                    onChange={v => setEditing({
                      ...cfg,
                      retry_policy: { ...getRetry(cfg), max_attempts: Math.max(1, Math.round(Number(v) || 0)) },
                    })}
                  />
                </div>
                <Toggle
                  accent={meta.color} label="Streaming"
                  on={cfg.streaming !== false}
                  onToggle={() => setEditing({ ...cfg, streaming: !(cfg.streaming !== false) })}
                />
              </div>
            </div>

            {/* ── §23 Permissions matrix ────────────────────────────────────── */}
            <div style={{
              backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}`,
              borderRadius: 13, padding: '18px 20px',
              display: 'flex', flexDirection: 'column', gap: 14,
            }}>
              <SectionLabel accent={meta.color}>Permissions</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                {(['read', 'write', 'generate', 'publish'] as const).map(cap => (
                  <Toggle
                    key={cap} accent={meta.color}
                    label={cap.charAt(0).toUpperCase() + cap.slice(1)}
                    on={getPermissions(cfg)[cap]}
                    onToggle={() => setEditing({
                      ...cfg,
                      permissions: { ...getPermissions(cfg), [cap]: !getPermissions(cfg)[cap] },
                    })}
                  />
                ))}
              </div>
            </div>

            {/* ── §23 Output schema ─────────────────────────────────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <SectionLabel accent={meta.color}>Output Schema · JSON</SectionLabel>
              <textarea
                value={schemaText}
                onChange={e => { setSchemaText(e.target.value); if (schemaErr) setSchemaErr(null) }}
                rows={8}
                spellCheck={false}
                placeholder={'{\n  "type": "object",\n  "properties": {}\n}'}
                style={{
                  width: '100%', backgroundColor: 'var(--bg-inset)',
                  border: `1px solid ${schemaErr ? '#DC262660' : CARD_BORDER}`, borderRadius: 11,
                  padding: '14px 16px', color: 'var(--text)', fontSize: 12,
                  fontFamily: 'ui-monospace, SFMono-Regular, monospace', lineHeight: 1.6,
                  resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                }}
                onFocus={e => { if (!schemaErr) e.currentTarget.style.borderColor = meta.color + '60' }}
                onBlur={e => { if (!schemaErr) e.currentTarget.style.borderColor = CARD_BORDER }}
              />
              {schemaErr && (
                <span style={{ color: '#F87171', fontSize: 11.5, fontWeight: 600 }}>{schemaErr}</span>
              )}
            </div>

            {/* ── §23 Governance ────────────────────────────────────────────── */}
            <div style={{
              backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}`,
              borderRadius: 13, padding: '18px 20px',
              display: 'flex', flexDirection: 'column', gap: 16,
            }}>
              <SectionLabel accent={meta.color}>Governance</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <FieldLabel>Escalation target</FieldLabel>
                  <ConfigInput
                    accent={meta.color}
                    value={cfg.escalation_target ?? ''}
                    placeholder="e.g. campaign_director_agent"
                    onChange={v => setEditing({ ...cfg, escalation_target: v.trim() === '' ? null : v })}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <FieldLabel>Execution priority</FieldLabel>
                  <ConfigInput
                    accent={meta.color} type="number"
                    value={String(cfg.execution_priority ?? 100)}
                    onChange={v => setEditing({ ...cfg, execution_priority: Math.max(0, Math.round(Number(v) || 0)) })}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <FieldLabel>Supported asset types <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(comma-separated)</span></FieldLabel>
                  <ConfigInput
                    accent={meta.color}
                    value={arrayToCsv(cfg.supported_asset_types)}
                    placeholder="image, video, copy"
                    onChange={v => setEditing({ ...cfg, supported_asset_types: csvToArray(v) })}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <FieldLabel>Supported languages <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(comma-separated)</span></FieldLabel>
                  <ConfigInput
                    accent={meta.color}
                    value={arrayToCsv(cfg.supported_languages)}
                    placeholder="en, es, fr"
                    onChange={v => setEditing({ ...cfg, supported_languages: csvToArray(v) })}
                  />
                </div>
              </div>
            </div>

            {/* Tools */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SectionLabel accent={meta.color}>Tools</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {ALL_TOOLS.filter(t => t.agents.includes(selected)).map(tool => {
                  const active = cfg.tools_enabled.includes(tool.id)
                  return (
                    <label
                      key={tool.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '11px 14px',
                        backgroundColor: active ? meta.color + '0E' : 'var(--fill-subtle)',
                        border: `1px solid ${active ? meta.color + '38' : CARD_BORDER}`,
                        borderRadius: 10, cursor: 'pointer', transition: 'all 0.12s',
                      }}
                    >
                      <span style={{
                        width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                        backgroundColor: active ? meta.color : 'transparent',
                        border: `1.5px solid ${active ? meta.color : 'var(--text-faint)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.12s',
                      }}>
                        {active && (
                          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                            <path d="M2.5 6.5l2.5 2.5 4.5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      <input type="checkbox" checked={active} onChange={() => toggleTool(tool.id)} style={{ display: 'none' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: active ? 'var(--text-strong)' : 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>{tool.label}</div>
                        <div style={{ color: 'var(--text-faint)', fontSize: 10, fontFamily: 'monospace', marginTop: 1 }}>{tool.id}</div>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Guardrails */}
            <div style={{
              backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}`,
              borderRadius: 13, padding: '18px 20px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <SectionLabel accent={meta.color}>Guardrails · code-enforced</SectionLabel>
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 10, fontWeight: 700, color: '#00C853',
                  backgroundColor: '#00C85314', padding: '3px 9px', borderRadius: 6,
                }}>
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                    <path d="M6 1l4 1.5v3C10 8 8.2 10 6 11 3.8 10 2 8 2 5.5v-3L6 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                    <path d="M4.3 6l1.2 1.2L8 4.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Always on
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { rule: 'Prompt injection detection', status: 'active', desc: 'Blocks jailbreak & role-switch attempts' },
                  { rule: 'PII stripping', status: 'active', desc: 'Redacts cards, emails, IBANs, phone numbers & national IDs before the model sees input' },
                  { rule: 'Currency / locale', status: 'active', desc: 'Forbids ₹/INR & India-specific framing — output is sanitised before display' },
                  { rule: 'Input length cap', status: 'active', desc: '2,000 characters max per message' },
                  { rule: 'Financial disclaimer', status: selected === 'player' ? 'active' : 'n/a', desc: 'Auto-appended on trading recommendations' },
                  { rule: 'Context window cap', status: 'active', desc: 'Last 20 turns only — prevents context stuffing' },
                  { rule: 'Tool call loop cap', status: 'active', desc: 'Max 3 agentic rounds per request' },
                  { rule: 'Rate limiting', status: 'active', desc: `${cfg.rate_limit_per_minute}/min · ${cfg.rate_limit_per_day}/day` },
                ].map(g => {
                  const on = g.status === 'active'
                  return (
                    <div key={g.rule} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '11px 13px', borderRadius: 9,
                      backgroundColor: on ? 'rgba(0,200,83,0.04)' : 'var(--fill-subtle)',
                      border: `1px solid ${on ? '#00C85320' : CARD_BORDER}`,
                    }}>
                      <span style={{
                        flexShrink: 0, marginTop: 2, width: 7, height: 7, borderRadius: '50%',
                        backgroundColor: on ? '#00C853' : 'var(--text-faint)',
                        boxShadow: on ? '0 0 6px #00C85380' : 'none',
                      }} />
                      <div>
                        <div style={{ color: on ? 'var(--text)' : 'var(--text-dim)', fontSize: 12, fontWeight: 600 }}>
                          {g.rule}
                          {!on && <span style={{ color: 'var(--text-faint)', fontSize: 10, marginLeft: 6, fontWeight: 500 }}>n/a for this agent</span>}
                        </div>
                        <div style={{ color: 'var(--text-dim)', fontSize: 10.5, marginTop: 2, lineHeight: 1.45 }}>{g.desc}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}

// ── §23 form controls (match the file's input/label styling) ─────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      color: 'var(--text-muted)', fontSize: 11, fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.06em',
    }}>
      {children}
    </span>
  )
}

const FIELD_BASE: React.CSSProperties = {
  width: '100%', backgroundColor: 'var(--bg-inset)',
  border: '1px solid var(--border)', borderRadius: 10,
  padding: '10px 12px', color: 'var(--text)', fontSize: 12.5,
  outline: 'none', boxSizing: 'border-box',
}

function ConfigInput({
  value, onChange, placeholder, accent, type = 'text',
}: { value: string; onChange: (v: string) => void; placeholder?: string; accent: string; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      style={FIELD_BASE}
      onFocus={e => { e.currentTarget.style.borderColor = accent + '60' }}
      onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
    />
  )
}

function ConfigTextarea({
  value, onChange, placeholder, accent, rows = 4,
}: { value: string; onChange: (v: string) => void; placeholder?: string; accent: string; rows?: number }) {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      rows={rows}
      spellCheck={false}
      onChange={e => onChange(e.target.value)}
      style={{ ...FIELD_BASE, lineHeight: 1.55, resize: 'vertical' }}
      onFocus={e => { e.currentTarget.style.borderColor = accent + '60' }}
      onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
    />
  )
}

function ConfigSelect({
  value, onChange, options, accent,
}: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; accent: string }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ ...FIELD_BASE, cursor: 'pointer', appearance: 'none' }}
      onFocus={e => { e.currentTarget.style.borderColor = accent + '60' }}
      onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function Toggle({ label, on, onToggle, accent }: { label: string; on: boolean; onToggle: () => void; accent: string }) {
  return (
    <label
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 13px', borderRadius: 10, cursor: 'pointer',
        backgroundColor: on ? accent + '0E' : 'var(--fill-subtle)',
        border: `1px solid ${on ? accent + '38' : 'var(--border)'}`,
        transition: 'all 0.12s',
      }}
    >
      <div style={{
        width: 36, height: 20, borderRadius: 10, flexShrink: 0,
        backgroundColor: on ? accent : 'var(--text-faintest)',
        position: 'relative', transition: 'background-color 0.2s',
      }}>
        <div style={{
          position: 'absolute', top: 3, left: on ? 19 : 3,
          width: 14, height: 14, borderRadius: '50%',
          backgroundColor: '#fff', transition: 'left 0.2s',
        }} />
      </div>
      <span style={{ color: on ? 'var(--text-strong)' : 'var(--text-dim)', fontSize: 12.5, fontWeight: 600 }}>
        {label}
      </span>
    </label>
  )
}

// ── Small helpers ────────────────────────────────────────────────────────────
function FeedbackRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>{label}</span>
        <span style={{ color: 'var(--text-strong)', fontSize: 11.5, fontWeight: 700, fontFamily: 'monospace' }}>{value}</span>
      </div>
      <div style={{ height: 5, backgroundColor: 'var(--border-soft)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: color, borderRadius: 3, transition: 'width 0.5s' }} />
      </div>
    </div>
  )
}

function VegaMetric({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div style={{ backgroundColor: CARD_BG, padding: '13px 15px' }}>
      <div style={{ color: 'var(--text-dim)', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
      <div style={{ color: color ?? 'var(--text-strong)', fontSize: 19, fontWeight: 800, fontFamily: 'monospace', marginTop: 4 }}>
        {value}
      </div>
      {sub && (
        <div style={{ color: 'var(--text-faint)', fontSize: 10, fontWeight: 600, marginTop: 3 }}>
          {sub}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span style={{ color: 'var(--text-faint)', fontSize: 11.5 }}>{label}</span>
      <span style={{ color: 'var(--text-strong)', fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>{value}</span>
    </div>
  )
}
