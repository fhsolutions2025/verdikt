'use client'

import { useState, useEffect } from 'react'

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
}

interface EvalStats {
  total:       number
  thumbsUp:    number
  thumbsDown:  number
  avgLatencyMs: number | null
}

const AGENT_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  player:   { label: 'Player Assistant',  color: '#00C853', desc: 'Visible to all players as a floating chat widget' },
  company:  { label: 'Ops Assistant',     color: '#6366F1', desc: 'Available on the Company dashboard' },
  mm_desk:  { label: 'MM Desk Assistant', color: '#F59E0B', desc: 'Available on the MM Desk' },
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

function Slider({
  label, min, max, step = 1, value, unit = '', onChange,
}: {
  label: string; min: number; max: number; step?: number
  value: number; unit?: string; onChange: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 500 }}>{label}</span>
        <span style={{ color: '#E6EDF3', fontSize: 12, fontWeight: 700, fontFamily: 'monospace' }}>
          {value}{unit}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#6366F1', cursor: 'pointer' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: '#4B5563', fontSize: 10 }}>{min}{unit}</span>
        <span style={{ color: '#4B5563', fontSize: 10 }}>{max}{unit}</span>
      </div>
    </div>
  )
}

function EvalBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: '#9CA3AF', fontSize: 11 }}>{label}</span>
        <span style={{ color: '#E6EDF3', fontSize: 11, fontWeight: 700 }}>{value}/{max}</span>
      </div>
      <div style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: color, borderRadius: 2, transition: 'width 0.4s' }} />
      </div>
    </div>
  )
}

export function AgentsTab() {
  const [configs, setConfigs]     = useState<AgentConfig[]>([])
  const [selected, setSelected]   = useState<string>('player')
  const [editing, setEditing]     = useState<AgentConfig | null>(null)
  const [saving, setSaving]       = useState(false)
  const [saveMsg, setSaveMsg]     = useState<string | null>(null)
  const [evalStats, setEvalStats] = useState<Record<string, EvalStats>>({})

  useEffect(() => {
    fetch('/api/agents/configs')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d.configs)) {
          setConfigs(d.configs)
          const first = d.configs.find((c: AgentConfig) => c.agent_type === 'player') ?? d.configs[0]
          if (first) setEditing(JSON.parse(JSON.stringify(first)))
        }
      })
      .catch(() => {})

    fetch('/api/agents/evals')
      .then(r => r.json())
      .then(d => { if (d.stats) setEvalStats(d.stats) })
      .catch(() => {})
  }, [])

  const selectAgent = (type: string) => {
    setSelected(type)
    const cfg = configs.find(c => c.agent_type === type)
    if (cfg) setEditing(JSON.parse(JSON.stringify(cfg)))
    setSaveMsg(null)
  }

  const save = async () => {
    if (!editing) return
    setSaving(true)
    setSaveMsg(null)
    try {
      const res = await fetch('/api/agents/configs', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(editing),
      })
      const d = await res.json()
      if (res.ok) {
        setConfigs(prev => prev.map(c => c.agent_type === editing.agent_type ? editing : c))
        setSaveMsg('Saved successfully.')
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

  return (
    <div style={{ display: 'flex', gap: 0, height: '100%' }}>

      {/* ── Agent selector sidebar ────────────────────────────────────────── */}
      <div style={{
        width: 200,
        flexShrink: 0,
        borderRight: '1px solid rgba(255,255,255,0.08)',
        paddingRight: 0,
      }}>
        <p style={{ color: '#4B5563', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
          Agents
        </p>
        {Object.entries(AGENT_LABELS).map(([type, m]) => (
          <button
            key={type}
            onClick={() => selectAgent(type)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '9px 12px',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              backgroundColor: selected === type ? m.color + '12' : 'transparent',
              borderLeft: `2px solid ${selected === type ? m.color : 'transparent'}`,
              color: selected === type ? m.color : '#6B7280',
              borderRadius: 0,
            }}
          >
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              backgroundColor: configs.find(c => c.agent_type === type)?.is_active ? m.color : '#374151',
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 13, fontWeight: selected === type ? 700 : 500 }}>{m.label}</span>
          </button>
        ))}
      </div>

      {/* ── Config panel ─────────────────────────────────────────────────── */}
      {cfg && meta && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 0 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Agent header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ color: '#E6EDF3', fontSize: 15, fontWeight: 700 }}>{meta.label}</div>
              <div style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>{meta.desc}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Active toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                <div
                  onClick={() => setEditing({ ...cfg, is_active: !cfg.is_active })}
                  style={{
                    width: 36, height: 20, borderRadius: 10,
                    backgroundColor: cfg.is_active ? meta.color : '#374151',
                    position: 'relative', cursor: 'pointer', transition: 'background-color 0.2s',
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 3, left: cfg.is_active ? 19 : 3,
                    width: 14, height: 14, borderRadius: '50%',
                    backgroundColor: '#fff', transition: 'left 0.2s',
                  }} />
                </div>
                <span style={{ color: '#9CA3AF', fontSize: 12 }}>{cfg.is_active ? 'Active' : 'Inactive'}</span>
              </label>
              <button
                onClick={save}
                disabled={saving}
                style={{
                  padding: '7px 18px',
                  borderRadius: 8,
                  backgroundColor: meta.color,
                  border: 'none',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Saving…' : 'Save Config'}
              </button>
            </div>
          </div>

          {saveMsg && (
            <div style={{
              padding: '8px 12px',
              borderRadius: 8,
              backgroundColor: saveMsg.startsWith('Error') ? '#DC262615' : '#00C85315',
              border: `1px solid ${saveMsg.startsWith('Error') ? '#DC262630' : '#00C85330'}`,
              color: saveMsg.startsWith('Error') ? '#F87171' : '#4ADE80',
              fontSize: 12,
            }}>
              {saveMsg}
            </div>
          )}

          {/* Eval stats */}
          {stats && (
            <div style={{
              backgroundColor: '#161B22',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              padding: '16px 20px',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 20,
            }}>
              <div>
                <p style={{ color: '#6B7280', fontSize: 11, fontWeight: 600, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Feedback (all time)
                </p>
                <EvalBar label="Thumbs up"   value={stats.thumbsUp}   max={stats.total} color="#00C853" />
                <div style={{ marginTop: 8 }}>
                  <EvalBar label="Thumbs down" value={stats.thumbsDown} max={stats.total} color="#DC2626" />
                </div>
              </div>
              <div>
                <p style={{ color: '#6B7280', fontSize: 11, fontWeight: 600, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Performance
                </p>
                <div style={{ color: '#9CA3AF', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Total messages</span>
                    <span style={{ color: '#E6EDF3', fontWeight: 700, fontFamily: 'monospace' }}>{stats.total}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Avg latency</span>
                    <span style={{ color: '#E6EDF3', fontWeight: 700, fontFamily: 'monospace' }}>
                      {stats.avgLatencyMs != null ? `${Math.round(stats.avgLatencyMs)}ms` : '—'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Satisfaction</span>
                    <span style={{ color: meta.color, fontWeight: 700, fontFamily: 'monospace' }}>
                      {stats.total > 0 ? `${Math.round((stats.thumbsUp / (stats.thumbsUp + stats.thumbsDown || 1)) * 100)}%` : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* System prompt */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                System Prompt
              </span>
              <span style={{ color: '#4B5563', fontSize: 11 }}>v{cfg.version}</span>
            </div>
            <textarea
              value={cfg.system_prompt}
              onChange={e => setEditing({ ...cfg, system_prompt: e.target.value })}
              rows={12}
              style={{
                width: '100%',
                backgroundColor: '#0D1117',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10,
                padding: '12px 14px',
                color: '#D1D5DB',
                fontSize: 12,
                fontFamily: 'monospace',
                lineHeight: 1.6,
                resize: 'vertical',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = meta.color + '50' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
            />
          </div>

          {/* Parameters */}
          <div style={{
            backgroundColor: '#161B22',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}>
            <p style={{ color: '#6B7280', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
              Parameters
            </p>
            <Slider label="Temperature" min={0} max={1} step={0.05} value={cfg.temperature} onChange={v => setEditing({ ...cfg, temperature: v })} />
            <Slider label="Max tokens" min={256} max={4096} step={128} value={cfg.max_tokens} onChange={v => setEditing({ ...cfg, max_tokens: v })} />
            <Slider label="Rate limit / minute" min={1} max={60} value={cfg.rate_limit_per_minute} onChange={v => setEditing({ ...cfg, rate_limit_per_minute: v })} />
            <Slider label="Rate limit / day" min={10} max={5000} step={10} value={cfg.rate_limit_per_day} onChange={v => setEditing({ ...cfg, rate_limit_per_day: v })} />
          </div>

          {/* Tools */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ color: '#6B7280', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
              Tools
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ALL_TOOLS.filter(t => t.agents.includes(selected)).map(tool => {
                const active = cfg.tools_enabled.includes(tool.id)
                return (
                  <label
                    key={tool.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px',
                      backgroundColor: active ? meta.color + '08' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${active ? meta.color + '30' : 'rgba(255,255,255,0.07)'}`,
                      borderRadius: 8,
                      cursor: 'pointer',
                      transition: 'all 0.12s',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => toggleTool(tool.id)}
                      style={{ accentColor: meta.color, cursor: 'pointer' }}
                    />
                    <span style={{ color: active ? '#E6EDF3' : '#6B7280', fontSize: 13, fontWeight: 500, flex: 1 }}>
                      {tool.label}
                    </span>
                    <span style={{
                      fontSize: 10, fontFamily: 'monospace',
                      color: '#4B5563',
                    }}>
                      {tool.id}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Guardrails info */}
          <div style={{
            backgroundColor: '#161B22',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: '16px 20px',
          }}>
            <p style={{ color: '#6B7280', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
              Guardrails (code-enforced)
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { rule: 'Prompt injection detection', status: 'active', desc: 'Blocks jailbreak / role-switch attempts' },
                { rule: 'PII stripping', status: 'active', desc: 'Strips card numbers, Aadhaar, PAN before model sees input' },
                { rule: 'Input length cap', status: 'active', desc: '2,000 characters max per message' },
                { rule: 'Financial disclaimer', status: selected === 'player' ? 'active' : 'n/a', desc: 'Auto-appended on trading recommendations' },
                { rule: 'Context window cap', status: 'active', desc: 'Last 20 turns only — prevents context stuffing' },
                { rule: 'Tool call loop cap', status: 'active', desc: 'Max 3 agentic rounds per request' },
                { rule: 'Rate limiting', status: 'active', desc: `${cfg.rate_limit_per_minute}/min · ${cfg.rate_limit_per_day}/day (configurable above)` },
              ].map(g => (
                <div key={g.rule} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{
                    flexShrink: 0, marginTop: 1,
                    width: 6, height: 6, borderRadius: '50%',
                    backgroundColor: g.status === 'active' ? '#00C853' : '#374151',
                  }} />
                  <div>
                    <span style={{ color: '#D1D5DB', fontSize: 12, fontWeight: 500 }}>{g.rule}</span>
                    <span style={{ color: '#4B5563', fontSize: 11, marginLeft: 8 }}>{g.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
