import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { KpiCard } from '@/components/company/KpiCard'
import { MmToggle } from '@/components/company/MmToggle'
import { AuditFeed } from '@/components/company/AuditFeed'
import { MarketRiskMonitor } from '@/components/company/MarketRiskMonitor'
import { OperatorTable } from '@/components/company/OperatorTable'
import { ApiHealthMonitor } from '@/components/company/ApiHealthMonitor'
import { formatVolume } from '@/lib/calculations'
import type {
  PlatformTotals, MmConfig, AuditLogEntry,
  RiskMarket, OperatorRevenue, ApiSource,
} from '@/lib/types'

export const dynamic = 'force-dynamic'

// Haiku 4.5 token pricing (USD per million tokens, as of 2025)
const HAIKU_INPUT_PRICE_PER_M  = 0.80
const HAIKU_OUTPUT_PRICE_PER_M = 4.00

export default async function CompanyPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayISO = today.toISOString()

  const [
    totalsRes,
    mmConfigRes,
    auditLogRes,
    riskMarketsRes,
    operatorsRes,
    allMarketsRes,
    apiSourcesRes,
    aiCallsRes,
    rateLimitsRes,
  ] = await Promise.all([
    supabase.from('v_platform_totals').select('*').single(),
    supabase.from('mm_config').select('*').eq('id', '20000000-0000-0000-0000-000000000001').single(),
    supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(30),
    // §4.2 — read from view; is_imbalanced and risk_tier come pre-computed
    supabase.from('v_market_risk_status').select('*'),
    supabase.from('v_operator_revenue').select('*'),
    supabase.from('markets').select('*').in('status', ['live', 'ai_ready', 'pending_mm_review']),
    supabase.from('api_sources').select('*').order('category'),
    // ai_call_log aggregates for today — project only used columns
    supabase.from('ai_call_log')
      .select('success, from_cache, error_message, latency_ms, input_tokens, output_tokens, created_at')
      .gte('created_at', todayISO),
    // api_rate_limits — call counts per external source for today's windows
    supabase.from('api_rate_limits').select('api_name, call_count').gte('window_start', todayISO),
  ])

  const totals      = totalsRes.data      as PlatformTotals | null
  const mmConfig    = mmConfigRes.data    as MmConfig | null
  const auditLog    = auditLogRes.data    as AuditLogEntry[] | null
  const riskMarkets = (riskMarketsRes.data ?? []) as RiskMarket[]
  const operators   = operatorsRes.data   as OperatorRevenue[] | null
  const allMarkets  = allMarketsRes.data  ?? []
  const apiSources  = (apiSourcesRes.data ?? []) as ApiSource[]
  const aiCalls       = aiCallsRes.data     ?? []
  const rateLimitRows = (rateLimitsRes.data  ?? []) as { api_name: string; call_count: number }[]

  const totalVolume   = totals?.total_volume        ?? 0
  const totalFees     = totals?.total_platform_fees  ?? 0
  const totalRebates  = totals?.total_maker_rebates  ?? 0
  const activeMarkets = allMarkets.length
  const liveCount     = riskMarkets.length

  // §6 — AI stats computed from ai_call_log
  type AiRow = {
    success: boolean; from_cache: boolean; error_message: string | null
    latency_ms: number | null; input_tokens: number | null
    output_tokens: number | null; created_at: string
  }
  const rows = aiCalls as AiRow[]

  let sumLatency = 0, latencyCount = 0
  let totalInputTokens = 0, totalOutputTokens = 0
  let cachedCount = 0
  let lastError: string | null = null
  let lastErrorAt = ''

  for (const c of rows) {
    if (c.from_cache) { cachedCount++; continue }
    if (c.success) {
      if (c.latency_ms != null) { sumLatency += c.latency_ms; latencyCount++ }
    } else if (c.error_message) {
      if (!lastErrorAt || c.created_at > lastErrorAt) {
        lastError = c.error_message; lastErrorAt = c.created_at
      }
    }
    totalInputTokens  += c.input_tokens  ?? 0
    totalOutputTokens += c.output_tokens ?? 0
  }

  const avgLatency = latencyCount > 0 ? sumLatency / latencyCount : null
  const costToday  = (totalInputTokens  / 1_000_000) * HAIKU_INPUT_PRICE_PER_M
                   + (totalOutputTokens / 1_000_000) * HAIKU_OUTPUT_PRICE_PER_M

  // Aggregate call counts per api_name across all minute windows today
  const callsToday = rateLimitRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.api_name] = (acc[row.api_name] ?? 0) + row.call_count
    return acc
  }, {})

  const aiStats = {
    calls_today:    rows.length,
    avg_latency_ms: avgLatency,
    cost_today_usd: costToday,
    cache_hit_rate: rows.length > 0 ? cachedCount / rows.length : 0,
    last_error:     lastError,
  }

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: '#0D1117' }}
    >
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* VC Banner */}
        <div
          className="rounded-2xl px-5 py-4"
          style={{ backgroundColor: '#00A84420', border: '1px solid #00C85330' }}
        >
          <p className="text-sm font-bold" style={{ color: '#00E676' }}>
            Platform-fee-only revenue today:{' '}
            <span className="font-mono text-lg">{totalFees.toFixed(2)}</span>
            {mmConfig?.is_verdikt_acting_as_mm && (
              <>
                {' '}&nbsp;→{' '}
                <span className="font-mono text-lg" style={{ color: '#00C853' }}>
                  {(totalFees + totalRebates).toFixed(2)}
                </span>
                {' '}as platform + MM
              </>
            )}
          </p>
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="Total Volume (today)"
            value={formatVolume(totalVolume)}
            sub="cumulative traded"
          />
          <KpiCard
            label="Platform Fees (today)"
            value={totalFees.toFixed(2)}
            sub="75% Verdikt share"
            accent="#00C853"
          />
          <KpiCard
            label="Active Markets"
            value={activeMarkets}
            sub={`${liveCount} live`}
          />
          <KpiCard
            label="Maker Rebates (today)"
            value={totalRebates.toFixed(2)}
            sub="25% share, rebated"
            accent="#6C3FC5"
          />
        </div>

        {/* MM Toggle */}
        {mmConfig && (
          <MmToggle
            initial={mmConfig.is_verdikt_acting_as_mm}
            platformFees={totalFees}
            makerRebates={totalRebates}
          />
        )}

        {/* Operator table + Risk monitor */}
        <div className="grid md:grid-cols-2 gap-4">
          <OperatorTable operators={operators ?? []} />
          <MarketRiskMonitor initial={riskMarkets} />
        </div>

        {/* API Health */}
        <ApiHealthMonitor
          sources={apiSources}
          callsToday={callsToday}
          aiStats={aiStats}
        />

        {/* Audit feed */}
        <AuditFeed initial={auditLog ?? []} />
      </div>
    </main>
  )
}
