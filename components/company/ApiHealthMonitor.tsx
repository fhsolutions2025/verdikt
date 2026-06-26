'use client'

import { useState } from 'react'
import { ApiSource } from '@/lib/types'
import { Tooltip } from '@/components/shared/Tooltip'

interface AiStats {
  calls_today:         number
  cached_calls_today?: number
  avg_latency_ms:      number | null
  cost_today_usd:      number
  cost_30d_usd?:       number
  input_tokens_today?:  number
  output_tokens_today?: number
  cache_hit_rate:      number
  last_error:          string | null
}

interface DailyCost {
  date:  string
  cost:  number
  calls: number
}

interface IdeogramStats {
  spendToday:  number
  spend30d:    number
  imagesTotal: number
  spendTotal:  number
  daily:       { date: string; count: number; cost: number }[]
}

function fmtCost(usd: number): string {
  if (usd <= 0)   return '$0.00'
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  if (usd < 1)    return `$${usd.toFixed(3)}`
  return `$${usd.toFixed(2)}`
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// 7-bar sparkline — pure CSS, no library
function Sparkline({ days }: { days: DailyCost[] }) {
  const max = Math.max(...days.map(d => d.cost), 0.000001)
  const todayStr = new Date().toISOString().slice(0, 10)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 36, width: '100%' }}>
      {days.map(d => {
        const pct = Math.max((d.cost / max) * 100, d.cost > 0 ? 8 : 2)
        const isToday = d.date === todayStr
        return (
          <Tooltip
            key={d.date}
            content={`${fmtDate(d.date)}: ${fmtCost(d.cost)} · ${d.calls} call${d.calls !== 1 ? 's' : ''}`}
            position="top"
          >
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: 'default', height: '100%', justifyContent: 'flex-end' }}>
              <div
                style={{
                  width: '100%',
                  height: `${pct}%`,
                  backgroundColor: isToday ? '#9B6FF5' : '#6C3FC560',
                  borderRadius: 3,
                  transition: 'height 0.2s ease',
                }}
              />
            </div>
          </Tooltip>
        )
      })}
    </div>
  )
}

const LICENSE_LABELS: Record<string, { label: string; color: string; tooltip: string }> = {
  free_unrestricted:      { label: 'free',          color: '#00C853', tooltip: 'No API key required. No meaningful rate limits for our usage.' },
  free_demo_only:         { label: 'demo only',     color: '#E05C20', tooltip: 'Free tier with strict daily caps. Must upgrade for production volume.' },
  metered:                { label: 'metered',       color: '#6C3FC5', tooltip: 'Charged per API call. Monitor usage closely to control costs.' },
  paid_required_at_scale: { label: 'paid at scale', color: 'var(--text-muted)', tooltip: 'Free tier available, but production volumes require a paid plan.' },
}

interface Props {
  sources:       ApiSource[]
  callsToday:    Record<string, number>
  aiStats:       AiStats
  aiDaily7d:     DailyCost[]
  ideogramStats: IdeogramStats
  defaultOpen?:  boolean
}

export function ApiHealthMonitor({ sources, callsToday, aiStats, aiDaily7d, ideogramStats, defaultOpen = false }: Props) {
  const [open, setOpen]               = useState(defaultOpen)
  const [showAiBreakdown, setShowAiBreakdown]           = useState(false)
  const [showIdeogramHistory, setShowIdeogramHistory]   = useState(false)

  const externalSources = sources.filter(s => s.category !== 'ai' && s.category !== 'creative_ai')
  const aiSource        = sources.find(s => s.category === 'ai')
  const aiStatus        = aiStats.last_error ? 'degraded' : 'operational'
  const sourceSummary   = `${externalSources.length} sources active`

  const HAIKU_INPUT_PRICE_PER_M  = 0.80
  const HAIKU_OUTPUT_PRICE_PER_M = 4.00
  const inputCostToday  = ((aiStats.input_tokens_today  ?? 0) / 1_000_000) * HAIKU_INPUT_PRICE_PER_M
  const outputCostToday = ((aiStats.output_tokens_today ?? 0) / 1_000_000) * HAIKU_OUTPUT_PRICE_PER_M
  const cachedCalls     = aiStats.cached_calls_today ?? 0

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      {/* Collapsible header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4"
        style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
            API Health
          </h2>
          <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
            — {sourceSummary} · Claude{' '}
            <span style={{ color: aiStats.last_error ? '#DC2626' : '#00C853' }}>{aiStatus}</span>
          </span>
        </div>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
          <path d={open ? 'M2 8L6 4L10 8' : 'M2 4L6 8L10 4'} stroke="var(--text-faint)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, alignItems: 'start' }}>

          {/* ── External Data Sources ── */}
          <section className="space-y-2">
            <p className="text-xs font-bold uppercase" style={{ color: 'var(--text-faintest)' }}>External Data Sources</p>
            <div className="space-y-2">
              {externalSources.map(src => {
                const meta  = LICENSE_LABELS[src.license_tier] ?? { label: src.license_tier, color: 'var(--text-dim)', tooltip: '' }
                const count = callsToday[src.name] ?? 0
                const atCap = src.rate_limit_per_minute != null && count >= src.rate_limit_per_minute * 1440
                return (
                  <div key={src.id} className="flex items-start justify-between gap-3 py-2 border-b last:border-0" style={{ borderColor: 'var(--border-faint)' }}>
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: atCap ? '#DC2626' : meta.color }} />
                        <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{src.name}</span>
                        <Tooltip content={meta.tooltip} position="bottom">
                          <span className="text-xs px-1.5 py-0.5 rounded font-bold cursor-default" style={{ backgroundColor: meta.color + '18', color: meta.color }}>
                            {meta.label}
                          </span>
                        </Tooltip>
                      </div>
                      {src.commercial_note && (
                        <p className="text-xs pl-3.5 leading-snug" style={{ color: 'var(--text-faint)' }}>{src.commercial_note}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="font-mono text-xs" style={{ color: 'var(--text-dim)' }}>{count.toLocaleString()} calls today</span>
                      {src.rate_limit_per_minute != null && (
                        <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{src.rate_limit_per_minute}/min cap</p>
                      )}
                    </div>
                  </div>
                )
              })}
              {externalSources.length === 0 && (
                <p className="text-xs" style={{ color: 'var(--text-dim)' }}>No external sources registered.</p>
              )}
            </div>
          </section>

          {/* ── Creative AI — Ideogram ── */}
          <section className="space-y-2">
            <p className="text-xs font-bold uppercase" style={{ color: 'var(--text-faintest)' }}>Creative AI</p>
            <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-soft)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#00C853' }} />
                  <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>Ideogram V_2</span>
                </div>
                <span className="text-xs font-bold" style={{ color: '#6C3FC5' }}>metered</span>
              </div>

              {/* Cost cards */}
              <div className="flex gap-2">
                <div className="flex-1 rounded-lg px-3 py-2.5" style={{ backgroundColor: '#6C3FC512', border: '1px solid #6C3FC528' }}>
                  <p className="text-xs" style={{ color: 'var(--text-dim)', margin: 0 }}>Spend today</p>
                  <p className="font-mono font-bold" style={{ color: '#9B6FF5', fontSize: 18, margin: '2px 0 0' }}>
                    {fmtCost(ideogramStats.spendToday)}
                  </p>
                </div>
                <div className="flex-1 rounded-lg px-3 py-2.5" style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-soft)' }}>
                  <p className="text-xs" style={{ color: 'var(--text-dim)', margin: 0 }}>Spend (30d)</p>
                  <p className="font-mono font-bold" style={{ color: 'var(--text)', fontSize: 18, margin: '2px 0 0' }}>
                    {fmtCost(ideogramStats.spend30d)}
                  </p>
                </div>
              </div>

              {/* Summary row */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs" style={{ color: 'var(--text-dim)' }}>
                <span>Images generated (all time)</span>
                <span className="font-mono text-right" style={{ color: 'var(--text)' }}>{ideogramStats.imagesTotal.toLocaleString()}</span>
                <span>Rate</span>
                <span className="font-mono text-right" style={{ color: 'var(--text)' }}>$0.08 / image</span>
                <span>Total spend (all time)</span>
                <span className="font-mono text-right" style={{ color: 'var(--text)' }}>{fmtCost(ideogramStats.spendTotal)}</span>
              </div>

              {/* Daily history toggle */}
              {ideogramStats.daily.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowIdeogramHistory(h => !h)}
                    className="text-xs flex items-center gap-1"
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-faint)' }}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d={showIdeogramHistory ? 'M2 7L5 3L8 7' : 'M2 3L5 7L8 3'} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {showIdeogramHistory ? 'Hide' : 'Show'} image history
                  </button>
                  {showIdeogramHistory && (
                    <div className="mt-2 space-y-1 max-h-40 overflow-y-auto pr-1">
                      {ideogramStats.daily.map(d => (
                        <div key={d.date} className="flex items-center justify-between text-xs py-1 border-b last:border-0" style={{ borderColor: 'var(--border-faint)' }}>
                          <span style={{ color: 'var(--text-dim)' }}>{fmtDate(d.date)}</span>
                          <span style={{ color: 'var(--text-faint)' }}>{d.count} image{d.count !== 1 ? 's' : ''}</span>
                          <span className="font-mono" style={{ color: 'var(--text)' }}>{fmtCost(d.cost)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <p className="text-xs" style={{ color: 'var(--text-faintest)' }}>
                API key stored in Supabase secrets. Calls via ideogram-proxy Edge Function.
              </p>
            </div>
          </section>

          {/* ── AI / LLM ── */}
          <section className="space-y-2">
            <p className="text-xs font-bold uppercase" style={{ color: 'var(--text-faintest)' }}>AI / LLM</p>
            <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-soft)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: aiStats.last_error ? '#DC2626' : '#00C853' }} />
                  <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{aiSource?.name ?? 'Claude (Haiku 4.5)'}</span>
                </div>
                <span className="text-xs font-bold" style={{ color: aiStats.last_error ? '#DC2626' : '#00C853' }}>
                  {aiStats.last_error ? 'degraded' : 'operational'}
                </span>
              </div>

              {/* Cost cards */}
              <div className="flex gap-2">
                <div className="flex-1 rounded-lg px-3 py-2.5" style={{ backgroundColor: '#6C3FC512', border: '1px solid #6C3FC528' }}>
                  <p className="text-xs" style={{ color: 'var(--text-dim)', margin: 0 }}>Est. cost today</p>
                  <p className="font-mono font-bold" style={{ color: '#9B6FF5', fontSize: 18, margin: '2px 0 0' }}>
                    {fmtCost(aiStats.cost_today_usd)}
                  </p>
                </div>
                <div className="flex-1 rounded-lg px-3 py-2.5" style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-soft)' }}>
                  <p className="text-xs" style={{ color: 'var(--text-dim)', margin: 0 }}>Cost (30d)</p>
                  <p className="font-mono font-bold" style={{ color: 'var(--text)', fontSize: 18, margin: '2px 0 0' }}>
                    {fmtCost(aiStats.cost_30d_usd ?? 0)}
                  </p>
                </div>
              </div>

              {/* Breakdown toggle */}
              <div>
                <button
                  onClick={() => setShowAiBreakdown(b => !b)}
                  className="text-xs flex items-center gap-1"
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-faint)' }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d={showAiBreakdown ? 'M2 7L5 3L8 7' : 'M2 3L5 7L8 3'} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {showAiBreakdown ? 'Hide' : 'Show'} cost breakdown
                </button>

                {showAiBreakdown && (
                  <div className="mt-2 rounded-lg px-3 py-2 space-y-1" style={{ backgroundColor: '#00000018', border: '1px solid var(--border-faint)' }}>
                    <p className="text-xs font-bold uppercase mb-2" style={{ color: 'var(--text-faintest)', letterSpacing: '0.06em' }}>Today&apos;s cost breakdown</p>
                    <div className="flex justify-between text-xs">
                      <span style={{ color: 'var(--text-dim)' }}>
                        Input &nbsp;
                        <span className="font-mono" style={{ color: 'var(--text-faint)' }}>
                          {(aiStats.input_tokens_today ?? 0).toLocaleString()} tok × $0.80/M
                        </span>
                      </span>
                      <span className="font-mono" style={{ color: 'var(--text)' }}>{fmtCost(inputCostToday)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span style={{ color: 'var(--text-dim)' }}>
                        Output &nbsp;
                        <span className="font-mono" style={{ color: 'var(--text-faint)' }}>
                          {(aiStats.output_tokens_today ?? 0).toLocaleString()} tok × $4.00/M
                        </span>
                      </span>
                      <span className="font-mono" style={{ color: 'var(--text)' }}>{fmtCost(outputCostToday)}</span>
                    </div>
                    <div className="flex justify-between text-xs pt-1" style={{ borderTop: '1px solid var(--border-faint)', marginTop: 4 }}>
                      <span style={{ color: 'var(--text-dim)' }}>Total today</span>
                      <span className="font-mono font-bold" style={{ color: '#9B6FF5' }}>{fmtCost(aiStats.cost_today_usd)}</span>
                    </div>
                    {cachedCalls > 0 && (
                      <p className="text-xs pt-1" style={{ color: '#00C853' }}>
                        {cachedCalls} call{cachedCalls !== 1 ? 's' : ''} served from cache — not billed
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* 7-day sparkline */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs" style={{ color: 'var(--text-faintest)' }}>Cost — last 7 days</p>
                  <p className="text-xs font-mono" style={{ color: 'var(--text-faint)' }}>
                    max {fmtCost(Math.max(...aiDaily7d.map(d => d.cost)))}
                  </p>
                </div>
                <Sparkline days={aiDaily7d} />
                <div className="flex justify-between mt-1">
                  <span className="text-xs" style={{ color: 'var(--text-faintest)' }}>{fmtDate(aiDaily7d[0]?.date ?? '')}</span>
                  <span className="text-xs" style={{ color: 'var(--text-faintest)' }}>today</span>
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs" style={{ color: 'var(--text-dim)' }}>
                <span>Calls today (API)</span>
                <span className="font-mono text-right" style={{ color: 'var(--text)' }}>
                  {aiStats.calls_today - cachedCalls}
                </span>

                <span>Cache hits</span>
                <span className="font-mono text-right" style={{ color: cachedCalls > 0 ? '#00C853' : 'var(--text)' }}>
                  {cachedCalls} ({(aiStats.cache_hit_rate * 100).toFixed(0)}%)
                </span>

                <span>Avg latency</span>
                <span className="font-mono text-right" style={{ color: 'var(--text)' }}>
                  {aiStats.avg_latency_ms != null ? `${aiStats.avg_latency_ms.toFixed(0)} ms` : '—'}
                </span>

                <Tooltip content="Haiku 4.5 pricing: $0.80 / 1M input tokens, $4.00 / 1M output tokens." position="top">
                  <span style={{ cursor: 'default' }}>Tokens today (in / out)</span>
                </Tooltip>
                <span className="font-mono text-right" style={{ color: 'var(--text)' }}>
                  {(aiStats.input_tokens_today ?? 0).toLocaleString()} / {(aiStats.output_tokens_today ?? 0).toLocaleString()}
                </span>
              </div>

              {aiStats.last_error && (
                <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: '#DC262618', color: '#FCA5A5' }}>
                  Last error: {aiStats.last_error}
                </p>
              )}

              <p className="text-xs" style={{ color: 'var(--text-faintest)' }}>
                Uptime shown is % of our own calls that succeeded — not Anthropic infrastructure status.
              </p>
            </div>
          </section>

        </div>
      )}
    </div>
  )
}
