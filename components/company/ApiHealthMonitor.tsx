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

interface OpenAiStats {
  text_calls_today:  number
  text_cost_today:   number
  images_today:      number
  image_spend_today: number
  last_error:        string | null
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
              <div style={{ width: '100%', height: `${pct}%`, backgroundColor: isToday ? '#9B6FF5' : '#6C3FC560', borderRadius: 3, transition: 'height 0.2s ease' }} />
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

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
      <path d={open ? 'M2 8L6 4L10 8' : 'M2 4L6 8L10 4'} stroke="var(--text-faint)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Compact, expandable model (engine) card ─────────────────────────────────────
function ModelCard({
  name, statusLabel, statusColor, headline, headlineLabel, defaultOpen = false, children,
}: {
  name: string
  statusLabel: string
  statusColor: string
  headline: string
  headlineLabel: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl" style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-soft)', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3.5 py-3"
        style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: statusColor }} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold truncate" style={{ color: 'var(--text)', margin: 0 }}>{name}</p>
          <p className="text-xs" style={{ color: 'var(--text-faint)', margin: '1px 0 0' }}>{headlineLabel}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-mono font-bold" style={{ color: '#9B6FF5', fontSize: 15, margin: 0 }}>{headline}</p>
          <p className="text-xs font-bold" style={{ color: statusColor, margin: '1px 0 0' }}>{statusLabel}</p>
        </div>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 pt-1 space-y-3" style={{ borderTop: '1px solid var(--border-faint)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ── Compact, expandable external-source row ─────────────────────────────────────
function SourceRow({ src, count }: { src: ApiSource; count: number }) {
  const [open, setOpen] = useState(false)
  const meta  = LICENSE_LABELS[src.license_tier] ?? { label: src.license_tier, color: 'var(--text-dim)', tooltip: '' }
  const atCap = src.rate_limit_per_minute != null && count >= src.rate_limit_per_minute * 1440
  return (
    <div className="rounded-lg" style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border-soft)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5"
        style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: atCap ? '#DC2626' : meta.color }} />
        <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{src.name}</span>
        <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: meta.color + '18', color: meta.color }}>{meta.label}</span>
        <span className="font-mono text-xs ml-auto" style={{ color: 'var(--text-dim)' }}>{count.toLocaleString()} calls today</span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="px-3 pb-3 pt-0.5 space-y-1" style={{ borderTop: '1px solid var(--border-faint)' }}>
          {src.commercial_note && (
            <p className="text-xs leading-snug" style={{ color: 'var(--text-faint)', margin: '6px 0 0' }}>{src.commercial_note}</p>
          )}
          <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-dim)' }}>
            <Tooltip content={meta.tooltip} position="bottom"><span style={{ cursor: 'default' }}>{meta.label}</span></Tooltip>
            {src.rate_limit_per_minute != null && <span className="font-mono">{src.rate_limit_per_minute}/min cap</span>}
          </div>
        </div>
      )}
    </div>
  )
}

interface Props {
  sources:       ApiSource[]
  callsToday:    Record<string, number>
  aiStats:       AiStats
  aiDaily7d:     DailyCost[]
  ideogramStats: IdeogramStats
  openaiStats?:  OpenAiStats
  defaultOpen?:  boolean
}

export function ApiHealthMonitor({ sources, callsToday, aiStats, aiDaily7d, ideogramStats, openaiStats, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen)

  const externalSources = sources.filter(s => s.category !== 'ai' && s.category !== 'creative_ai')
  const aiSource        = sources.find(s => s.category === 'ai')
  const aiStatus        = aiStats.last_error ? 'degraded' : 'operational'

  const HAIKU_INPUT_PRICE_PER_M  = 0.80
  const HAIKU_OUTPUT_PRICE_PER_M = 4.00
  const inputCostToday  = ((aiStats.input_tokens_today  ?? 0) / 1_000_000) * HAIKU_INPUT_PRICE_PER_M
  const outputCostToday = ((aiStats.output_tokens_today ?? 0) / 1_000_000) * HAIKU_OUTPUT_PRICE_PER_M
  const cachedCalls     = aiStats.cached_calls_today ?? 0

  return (
    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      {/* Collapsible header */}
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-5 py-4" style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-dim)', letterSpacing: '0.08em' }}>API Health</h2>
          <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
            — {externalSources.length} sources · Claude{' '}
            <span style={{ color: aiStats.last_error ? '#DC2626' : '#00C853' }}>{aiStatus}</span>
          </span>
        </div>
        <Chevron open={open} />
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5">

          {/* ── Models (engines) — compact bento row ── */}
          <section className="space-y-2">
            <p className="text-xs font-bold uppercase" style={{ color: 'var(--text-faintest)', letterSpacing: '0.06em' }}>Models &amp; engines</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>

              {/* Claude */}
              <ModelCard
                name={aiSource?.name ?? 'Claude (Haiku / Opus)'}
                statusLabel={aiStats.last_error ? 'degraded' : 'operational'}
                statusColor={aiStats.last_error ? '#DC2626' : '#00C853'}
                headline={fmtCost(aiStats.cost_today_usd)}
                headlineLabel="LLM · cost today"
                defaultOpen
              >
                <div className="flex gap-2 pt-2">
                  <Stat label="Est. cost today" value={fmtCost(aiStats.cost_today_usd)} accent />
                  <Stat label="Cost (30d)" value={fmtCost(aiStats.cost_30d_usd ?? 0)} />
                </div>
                <div className="rounded-lg px-3 py-2 space-y-1" style={{ backgroundColor: '#00000018', border: '1px solid var(--border-faint)' }}>
                  <Line l={`Input · ${(aiStats.input_tokens_today ?? 0).toLocaleString()} tok × $0.80/M`} r={fmtCost(inputCostToday)} />
                  <Line l={`Output · ${(aiStats.output_tokens_today ?? 0).toLocaleString()} tok × $4.00/M`} r={fmtCost(outputCostToday)} />
                  {cachedCalls > 0 && <p className="text-xs" style={{ color: '#00C853', margin: '2px 0 0' }}>{cachedCalls} served from cache — not billed</p>}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs" style={{ color: 'var(--text-faintest)' }}>Cost — last 7 days</p>
                    <p className="text-xs font-mono" style={{ color: 'var(--text-faint)' }}>max {fmtCost(Math.max(...aiDaily7d.map(d => d.cost)))}</p>
                  </div>
                  <Sparkline days={aiDaily7d} />
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs" style={{ color: 'var(--text-dim)' }}>
                  <span>Calls today (API)</span><span className="font-mono text-right" style={{ color: 'var(--text)' }}>{aiStats.calls_today - cachedCalls}</span>
                  <span>Cache hits</span><span className="font-mono text-right" style={{ color: cachedCalls > 0 ? '#00C853' : 'var(--text)' }}>{cachedCalls} ({(aiStats.cache_hit_rate * 100).toFixed(0)}%)</span>
                  <span>Avg latency</span><span className="font-mono text-right" style={{ color: 'var(--text)' }}>{aiStats.avg_latency_ms != null ? `${aiStats.avg_latency_ms.toFixed(0)} ms` : '—'}</span>
                </div>
                {aiStats.last_error && <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: '#DC262618', color: '#FCA5A5' }}>Last error: {aiStats.last_error}</p>}
              </ModelCard>

              {/* OpenAI */}
              {openaiStats && (
                <ModelCard
                  name="OpenAI (GPT-4o · gpt-image-1)"
                  statusLabel={openaiStats.last_error ? 'degraded' : 'metered'}
                  statusColor={openaiStats.last_error ? '#DC2626' : '#00C853'}
                  headline={fmtCost(openaiStats.text_cost_today + openaiStats.image_spend_today)}
                  headlineLabel="LLM + image · today"
                >
                  <div className="flex gap-2 pt-2">
                    <Stat label="Text cost today" value={fmtCost(openaiStats.text_cost_today)} accent />
                    <Stat label="Image spend today" value={fmtCost(openaiStats.image_spend_today)} />
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs" style={{ color: 'var(--text-dim)' }}>
                    <span>Text calls today</span><span className="font-mono text-right" style={{ color: 'var(--text)' }}>{openaiStats.text_calls_today.toLocaleString()}</span>
                    <span>Images today</span><span className="font-mono text-right" style={{ color: 'var(--text)' }}>{openaiStats.images_today.toLocaleString()}</span>
                    <span>Image rate</span><span className="font-mono text-right" style={{ color: 'var(--text)' }}>~$0.04 / image</span>
                  </div>
                  {openaiStats.last_error && <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: '#DC262618', color: '#FCA5A5' }}>Last error: {openaiStats.last_error}</p>}
                  <p className="text-xs" style={{ color: 'var(--text-faintest)' }}>Via openai-proxy / openai-image-proxy. GPT-4o $2.50/$10 per 1M, mini $0.15/$0.60.</p>
                </ModelCard>
              )}

              {/* Ideogram */}
              <ModelCard
                name="Ideogram V_2"
                statusLabel="metered"
                statusColor="#00C853"
                headline={fmtCost(ideogramStats.spendToday)}
                headlineLabel="image · spend today"
              >
                <div className="flex gap-2 pt-2">
                  <Stat label="Spend today" value={fmtCost(ideogramStats.spendToday)} accent />
                  <Stat label="Spend (30d)" value={fmtCost(ideogramStats.spend30d)} />
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs" style={{ color: 'var(--text-dim)' }}>
                  <span>Images (all time)</span><span className="font-mono text-right" style={{ color: 'var(--text)' }}>{ideogramStats.imagesTotal.toLocaleString()}</span>
                  <span>Rate</span><span className="font-mono text-right" style={{ color: 'var(--text)' }}>$0.08 / image</span>
                  <span>Total spend</span><span className="font-mono text-right" style={{ color: 'var(--text)' }}>{fmtCost(ideogramStats.spendTotal)}</span>
                </div>
                {ideogramStats.daily.length > 0 && (
                  <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                    {ideogramStats.daily.slice(0, 10).map(d => (
                      <div key={d.date} className="flex items-center justify-between text-xs py-1 border-b last:border-0" style={{ borderColor: 'var(--border-faint)' }}>
                        <span style={{ color: 'var(--text-dim)' }}>{fmtDate(d.date)}</span>
                        <span style={{ color: 'var(--text-faint)' }}>{d.count} img</span>
                        <span className="font-mono" style={{ color: 'var(--text)' }}>{fmtCost(d.cost)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </ModelCard>
            </div>
          </section>

          {/* ── External data sources — stacked expandable rows ── */}
          <section className="space-y-2">
            <p className="text-xs font-bold uppercase" style={{ color: 'var(--text-faintest)', letterSpacing: '0.06em' }}>External data sources</p>
            <div className="space-y-2">
              {externalSources.map(src => (
                <SourceRow key={src.id} src={src} count={callsToday[src.name] ?? 0} />
              ))}
              {externalSources.length === 0 && <p className="text-xs" style={{ color: 'var(--text-dim)' }}>No external sources registered.</p>}
            </div>
          </section>

        </div>
      )}
    </div>
  )
}

// Small helpers used inside model cards
function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex-1 rounded-lg px-3 py-2" style={{ backgroundColor: accent ? '#6C3FC512' : 'var(--bg-surface)', border: `1px solid ${accent ? '#6C3FC528' : 'var(--border-soft)'}` }}>
      <p className="text-xs" style={{ color: 'var(--text-dim)', margin: 0 }}>{label}</p>
      <p className="font-mono font-bold" style={{ color: accent ? '#9B6FF5' : 'var(--text)', fontSize: 16, margin: '2px 0 0' }}>{value}</p>
    </div>
  )
}

function Line({ l, r }: { l: string; r: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span style={{ color: 'var(--text-dim)' }}>{l}</span>
      <span className="font-mono" style={{ color: 'var(--text)' }}>{r}</span>
    </div>
  )
}
