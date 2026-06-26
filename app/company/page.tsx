import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
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
  // Service client bypasses RLS for internal observability tables
  // (ai_call_log, api_rate_limits, marketing_assets)
  const service = await createServiceClient()

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
    ideogramAssetsRes,
  ] = await Promise.all([
    supabase.from('v_platform_totals').select('*').single(),
    supabase.from('mm_config').select('*').eq('id', '20000000-0000-0000-0000-000000000001').single(),
    supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(30),
    supabase.from('v_market_risk_status').select('*'),
    supabase.from('markets').select('*').in('status', ['live', 'ai_ready', 'pending_mm_review']),
    supabase.from('markets').select('*').eq('status', 'ai_ready').eq('creator_type', 'player_mm').order('created_at', { ascending: false }),
    supabase.from('api_sources').select('*').order('category'),
    // Use service client for observability tables — bypasses RLS that could
    // silently return 0 rows if the admin-read policy wasn't applied.
    service.from('ai_call_log')
      .select('success, from_cache, error_message, latency_ms, input_tokens, output_tokens, created_at')
      .gte('created_at', todayISO),
    service.from('api_rate_limits').select('api_name, call_count').gte('window_start', todayISO),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc('get_realized_spread_income'),
    service.from('ai_call_log')
      .select('input_tokens, output_tokens, created_at')
      .gte('created_at', new Date(Date.now() - 30 * 86_400_000).toISOString()),
    // Ideogram spend from saved assets
    service.from('marketing_assets').select('cost_usd, created_at'),
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

  // 30-day cumulative cost + 7-day daily breakdown
  type Row30 = { input_tokens: number | null; output_tokens: number | null; created_at: string }
  const rows30 = (aiCalls30dRes.data ?? []) as Row30[]
  let in30 = 0, out30 = 0
  const dailyMap = new Map<string, { cost: number; calls: number }>()
  const sevenDaysAgoDate = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10)
  for (const r of rows30) {
    in30 += r.input_tokens ?? 0
    out30 += r.output_tokens ?? 0
    const date = r.created_at.slice(0, 10)
    if (date >= sevenDaysAgoDate) {
      const cur = dailyMap.get(date) ?? { cost: 0, calls: 0 }
      const rowCost = ((r.input_tokens ?? 0) / 1_000_000) * HAIKU_INPUT_PRICE_PER_M
                    + ((r.output_tokens ?? 0) / 1_000_000) * HAIKU_OUTPUT_PRICE_PER_M
      dailyMap.set(date, { cost: cur.cost + rowCost, calls: cur.calls + 1 })
    }
  }
  const cost30d = (in30 / 1_000_000) * HAIKU_INPUT_PRICE_PER_M
                + (out30 / 1_000_000) * HAIKU_OUTPUT_PRICE_PER_M
  // Build a full 7-entry array (oldest → today), filling zeros for days with no calls
  const aiDaily7d = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86_400_000).toISOString().slice(0, 10)
    return { date: d, ...(dailyMap.get(d) ?? { cost: 0, calls: 0 }) }
  })

  const callsToday = rateLimitRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.api_name] = (acc[row.api_name] ?? 0) + row.call_count
    return acc
  }, {})

  // Ideogram spend from saved marketing assets
  const allAssets = (ideogramAssetsRes.data ?? []) as { cost_usd: number | null; created_at: string }[]
  const ago30ISO = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const ideogramSpendToday  = allAssets
    .filter(a => a.created_at >= todayISO)
    .reduce((s, a) => s + Number(a.cost_usd ?? 0), 0)
  const ideogramSpend30d    = allAssets
    .filter(a => a.created_at >= ago30ISO)
    .reduce((s, a) => s + Number(a.cost_usd ?? 0), 0)
  const ideogramImagesTotal = allAssets.length
  const ideogramSpendTotal  = allAssets.reduce((s, a) => s + Number(a.cost_usd ?? 0), 0)

  // Group Ideogram assets by day (most recent first, all-time)
  const ideogramDailyMap = new Map<string, { count: number; cost: number }>()
  for (const a of allAssets) {
    const date = a.created_at.slice(0, 10)
    const cur = ideogramDailyMap.get(date) ?? { count: 0, cost: 0 }
    ideogramDailyMap.set(date, { count: cur.count + 1, cost: cur.cost + Number(a.cost_usd ?? 0) })
  }
  const ideogramDaily = Array.from(ideogramDailyMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => b.date.localeCompare(a.date))

  const ideogramStats = {
    spendToday:   ideogramSpendToday,
    spend30d:     ideogramSpend30d,
    imagesTotal:  ideogramImagesTotal,
    spendTotal:   ideogramSpendTotal,
    daily:        ideogramDaily,
  }

  const aiStats = {
    calls_today:         rows.length,
    cached_calls_today:  cachedCount,
    avg_latency_ms:      avgLatency,
    cost_today_usd:      costToday,
    cost_30d_usd:        cost30d,
    input_tokens_today:  totalInputTokens,
    output_tokens_today: totalOutputTokens,
    cache_hit_rate:      rows.length > 0 ? cachedCount / rows.length : 0,
    last_error:          lastError,
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
      aiDaily7d={aiDaily7d}
      ideogramStats={ideogramStats}
      callsToday={callsToday}
      spreadIncome={spreadIncome}
    />
  )
}
