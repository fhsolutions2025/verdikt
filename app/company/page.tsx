import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { KpiCard } from '@/components/company/KpiCard'
import { MmToggle } from '@/components/company/MmToggle'
import { AuditFeed } from '@/components/company/AuditFeed'
import { MarketRiskMonitor } from '@/components/company/MarketRiskMonitor'
import { OperatorTable } from '@/components/company/OperatorTable'
import { formatVolume } from '@/lib/calculations'
import type { PlatformTotals, MmConfig, AuditLogEntry, Market, OperatorRevenue } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function CompanyPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch everything in parallel — re-query on Realtime events client-side (TECH_SPEC §5)
  const [
    totalsRes,
    mmConfigRes,
    auditLogRes,
    liveMarketsRes,
    operatorsRes,
    allMarketsRes,
  ] = await Promise.all([
    supabase.from('v_platform_totals').select('*').single(),
    supabase.from('mm_config').select('*').eq('id', '20000000-0000-0000-0000-000000000001').single(),
    supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(30),
    supabase.from('markets').select('*').eq('status', 'live'),
    supabase.from('v_operator_revenue').select('*'),
    supabase.from('markets').select('*').in('status', ['live', 'ai_ready', 'pending_mm_review']),
  ])

  const totals      = totalsRes.data      as PlatformTotals | null
  const mmConfig    = mmConfigRes.data    as MmConfig | null
  const auditLog    = auditLogRes.data    as AuditLogEntry[] | null
  const liveMarkets = liveMarketsRes.data as Market[] | null
  const operators   = operatorsRes.data   as OperatorRevenue[] | null
  const allMarkets  = allMarketsRes.data  as Market[] | null

  const totalVolume     = totals?.total_volume       ?? 0
  const totalFees       = totals?.total_platform_fees ?? 0
  const totalRebates    = totals?.total_maker_rebates ?? 0
  const activeMarkets   = allMarkets?.length          ?? 0
  const liveCount       = liveMarkets?.length         ?? 0

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
          <MarketRiskMonitor initial={liveMarkets ?? []} />
        </div>

        {/* Audit feed */}
        <AuditFeed initial={auditLog ?? []} />
      </div>
    </main>
  )
}
