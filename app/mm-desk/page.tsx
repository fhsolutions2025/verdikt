import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { MmDeskClient } from '@/components/mm-desk/MmDeskClient'
import { Tooltip, InfoIcon } from '@/components/shared/Tooltip'
import type { Market, PlatformTotals } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function MmDeskPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [liveRes, aiRes, totalsRes, spreadRes] = await Promise.all([
    supabase.from('markets').select('*').eq('status', 'live').order('volume', { ascending: false }),
    supabase.from('markets').select('*').in('status', ['ai_ready', 'pending_mm_review']).order('ai_confidence', { ascending: false }),
    supabase.from('v_platform_totals').select('*').single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc('get_realized_spread_income'),
  ])

  const liveMarkets   = liveRes.data   as Market[] | null
  const aiMarkets     = aiRes.data     as Market[] | null
  const totals        = totalsRes.data as PlatformTotals | null
  const spreadIncome  = (spreadRes.data as number | null) ?? 0

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: '#F6F8F6' }}
    >
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* Revenue header */}
        <div
          className="rounded-2xl p-5 grid grid-cols-3 gap-4"
          style={{ backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB' }}
        >
          <RevenueItem
            label="Fee Rebate"
            value={totals?.total_maker_rebates ?? 0}
            sub="25% of maker-side fees"
            tooltip="25% of taker fees on all trades routed back to the market maker. Verdikt takes the other 75%."
          />
          <RevenueItem
            label="Spread Income"
            value={spreadIncome}
            sub="Volume-based"
            tooltip="Half the bid-ask spread earned per share traded. Grows linearly with volume."
          />
          <RevenueItem
            label="Combined Revenue"
            value={(totals?.total_maker_rebates ?? 0) + spreadIncome}
            sub="Today"
            accent="#00A844"
            tooltip="Fee rebate + spread income. Total MM earnings accumulated today."
          />
        </div>

        <MmDeskClient
          initialLiveMarkets={liveMarkets ?? []}
          initialAiMarkets={aiMarkets ?? []}
          mmId={user.id}
        />
      </div>
    </main>
  )
}

function RevenueItem({
  label, value, sub, accent, tooltip,
}: {
  label: string; value: number; sub: string; accent?: string; tooltip?: string
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-bold uppercase tracking-widest flex items-center gap-1" style={{ color: '#6B7280', letterSpacing: '0.07em' }}>
        {label}
        {tooltip && (
          <Tooltip content={tooltip} position="bottom">
            <InfoIcon />
          </Tooltip>
        )}
      </p>
      <p className="font-mono font-bold text-2xl" style={{ color: accent ?? '#111A11' }}>
        {value.toFixed(2)}
      </p>
      <p className="text-xs" style={{ color: '#9CA3AF' }}>{sub}</p>
    </div>
  )
}
