import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CompanyDashboard } from '@/components/company/CompanyDashboard'
import type {
  PlatformTotals, MmConfig, AuditLogEntry,
  RiskMarket, ApiSource, Market,
} from '@/lib/types'

export const dynamic = 'force-dynamic'

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
    allMarketsRes,
    pendingReviewRes,
    apiSourcesRes,
    aiCallsRes,
    rateLimitsRes,
    spreadRes,
    aiCalls30dRes,
  ] = await Promise.all([
    supabase.from('v_platform_totals').select('*').single(),
    supabase.from('mm_config').select('*').eq('id', '20000000-0000-0000-0000-000000000001').single(),
    supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(30),
    supabase.from('v_market_risk_status').select('*'),
    supabase.from('markets').select('*').in('status', ['live', 'ai_ready', 'pending_mm_review']),
    supabase.from('markets').select('*').eq('status', 'ai_ready').eq('creator_type', 'player_mm').order('created_at', { ascending: false }),
    supabase.from('api_sources').select('*').order('category'),
    supabase.from('ai_call_log')
      .select('success, from_cache, error_message, latency_ms, input_tokens, output_tokens, created_at')
      .gte('created_at', todayISO),
    supabase.from('api_rate_limits').select('api_name, call_count').gte('window_start', todayISO),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc('get_realized_spread_income'),
    supabase.from('ai_call_log')
      .select('input_tokens, output_tokens')
      .gte('created_at', new Date(Date.now() - 30 * 86_400_000).toISOString()),
  ])

  const totals      = totalsRes.data      as PlatformTotals | null
  const mmConfig    = mmConfigRes.data    as MmConfig | null
  const auditLog    = (auditLogRes.data   ?? []) as AuditLogEntry[]
  const riskMarkets = (riskMarketsRes.data ?? []) as RiskMarket[]
  const allMarkets  = (allMarketsRes.data  ?? []) as Market[]
  const pendingReview = (pendingReviewRes.data ?? []) as Market[]
  const apiSources  = (apiSourcesRes.data ?? []) as ApiSource[]
  const aiCalls     = aiCallsRes.data     ?? []
  const rateLimitRows = (rateLimitsRes.data ?? []) as { api_name: string; call_count: number }[]
  const spreadIncome  = (spreadRes.data as number | null) ?? 0

  // AI stats from call log
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

  // 30-day cumulative cost
  const rows30 = (aiCalls30dRes.data ?? []) as { input_tokens: number | null; output_tokens: number | null }[]
  let in30 = 0, out30 = 0
  for (const r of rows30) { in30 += r.input_tokens ?? 0; out30 += r.output_tokens ?? 0 }
  const cost30d = (in30 / 1_000_000) * HAIKU_INPUT_PRICE_PER_M
                + (out30 / 1_000_000) * HAIKU_OUTPUT_PRICE_PER_M

  const callsToday = rateLimitRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.api_name] = (acc[row.api_name] ?? 0) + row.call_count
    return acc
  }, {})

  const aiStats = {
    calls_today:    rows.length,
    avg_latency_ms: avgLatency,
    cost_today_usd: costToday,
    cost_30d_usd:   cost30d,
    input_tokens_today:  totalInputTokens,
    output_tokens_today: totalOutputTokens,
    cache_hit_rate: rows.length > 0 ? cachedCount / rows.length : 0,
    last_error:     lastError,
  }

  return (
    <CompanyDashboard
      totals={totals}
      mmConfig={mmConfig}
      auditLog={auditLog}
      riskMarkets={riskMarkets}
      allMarkets={allMarkets}
      pendingReview={pendingReview}
      apiSources={apiSources}
      aiStats={aiStats}
      callsToday={callsToday}
      spreadIncome={spreadIncome}
    />
  )
}
