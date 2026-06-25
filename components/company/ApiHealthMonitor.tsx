'use client'

import { ApiSource } from '@/lib/types'

interface AiStats {
  calls_today:    number
  avg_latency_ms: number | null
  cost_today_usd: number
  cache_hit_rate: number
  last_error:     string | null
}

interface Props {
  sources:  ApiSource[]
  callsToday: Record<string, number>  // api_name → call_count total for today
  aiStats:  AiStats
}

const LICENSE_LABELS: Record<string, { label: string; color: string }> = {
  free_unrestricted:    { label: 'free',        color: '#00C853' },
  free_demo_only:       { label: 'demo only',   color: '#E05C20' },
  metered:              { label: 'metered',     color: '#6C3FC5' },
  paid_required_at_scale: { label: 'paid at scale', color: '#9CA3AF' },
}

export function ApiHealthMonitor({ sources, callsToday, aiStats }: Props) {
  const externalSources = sources.filter(s => s.category !== 'ai')
  const aiSource        = sources.find(s => s.category === 'ai')

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: '#161B22',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Header */}
      <div
        className="px-5 py-4 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.08)' }}
      >
        <h2
          className="text-xs font-bold uppercase tracking-widest"
          style={{ color: '#6B7280', letterSpacing: '0.08em' }}
        >
          API Health
        </h2>
      </div>

      <div className="px-5 py-4 space-y-5">

        {/* External Data Sources */}
        <section className="space-y-2">
          <p className="text-xs font-bold uppercase" style={{ color: '#374151' }}>
            External Data Sources
          </p>
          <div className="space-y-2">
            {externalSources.map(src => {
              const meta  = LICENSE_LABELS[src.license_tier] ?? { label: src.license_tier, color: '#6B7280' }
              const count = callsToday[src.name] ?? 0
              const atCap = src.rate_limit_per_minute != null
                && count >= src.rate_limit_per_minute * 1440

              return (
                <div
                  key={src.id}
                  className="flex items-start justify-between gap-3 py-2 border-b last:border-0"
                  style={{ borderColor: 'rgba(255,255,255,0.04)' }}
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: atCap ? '#DC2626' : meta.color }}
                      />
                      <span className="text-sm font-medium" style={{ color: '#D1D5DB' }}>
                        {src.name}
                      </span>
                      <span
                        className="text-xs px-1.5 py-0.5 rounded font-bold"
                        style={{ backgroundColor: meta.color + '18', color: meta.color }}
                      >
                        {meta.label}
                      </span>
                    </div>
                    {src.commercial_note && (
                      <p className="text-xs pl-3.5 leading-snug" style={{ color: '#4B5563' }}>
                        {src.commercial_note}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="font-mono text-xs" style={{ color: '#6B7280' }}>
                      {count.toLocaleString()} calls today
                    </span>
                    {src.rate_limit_per_minute != null && (
                      <p className="text-xs" style={{ color: '#4B5563' }}>
                        {src.rate_limit_per_minute}/min cap
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
            {externalSources.length === 0 && (
              <p className="text-xs" style={{ color: '#374151' }}>No external sources registered.</p>
            )}
          </div>
        </section>

        {/* AI / LLM */}
        <section className="space-y-2">
          <p className="text-xs font-bold uppercase" style={{ color: '#374151' }}>
            AI / LLM
          </p>
          <div
            className="rounded-xl p-4 space-y-3"
            style={{ backgroundColor: '#0D1117', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: aiStats.last_error ? '#DC2626' : '#00C853' }}
                />
                <span className="text-sm font-medium" style={{ color: '#D1D5DB' }}>
                  {aiSource?.name ?? 'Claude (Haiku 4.5)'}
                </span>
              </div>
              <span
                className="text-xs font-bold"
                style={{ color: aiStats.last_error ? '#DC2626' : '#00C853' }}
              >
                {aiStats.last_error ? 'degraded' : 'operational'}
              </span>
            </div>

            <div
              className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs"
              style={{ color: '#6B7280' }}
            >
              <span>Calls today</span>
              <span className="font-mono text-right" style={{ color: '#D1D5DB' }}>
                {aiStats.calls_today}
              </span>

              <span>Avg latency</span>
              <span className="font-mono text-right" style={{ color: '#D1D5DB' }}>
                {aiStats.avg_latency_ms != null
                  ? `${aiStats.avg_latency_ms.toFixed(0)} ms`
                  : '—'}
              </span>

              <span>Est. cost today</span>
              <span className="font-mono text-right" style={{ color: '#D1D5DB' }}>
                ${aiStats.cost_today_usd.toFixed(4)}
              </span>

              <span>Cache hit rate</span>
              <span className="font-mono text-right" style={{ color: '#D1D5DB' }}>
                {(aiStats.cache_hit_rate * 100).toFixed(0)}%
              </span>
            </div>

            {aiStats.last_error && (
              <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: '#DC262618', color: '#FCA5A5' }}>
                Last error: {aiStats.last_error}
              </p>
            )}

            {/* Honest uptime note per §4.1 */}
            <p className="text-xs" style={{ color: '#374151' }}>
              Uptime shown is % of our own calls that succeeded — not Anthropic infrastructure status.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
