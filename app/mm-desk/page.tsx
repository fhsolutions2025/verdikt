import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { MmDeskClient } from '@/components/mm-desk/MmDeskClient'
import type { Market, PlatformTotals } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function MmDeskPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [liveRes, aiRes, totalsRes] = await Promise.all([
    supabase.from('markets').select('*').eq('status', 'live').order('volume', { ascending: false }),
    supabase.from('markets').select('*').in('status', ['ai_ready', 'pending_mm_review']).order('ai_confidence', { ascending: false }),
    supabase.from('v_platform_totals').select('*').single(),
  ])

  const liveMarkets = liveRes.data   as Market[] | null
  const aiMarkets   = aiRes.data     as Market[] | null
  const totals      = totalsRes.data as PlatformTotals | null

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
            label="Spread Income"
            value={0}
            sub="Volume-based"
          />
          <RevenueItem
            label="Fee Rebate"
            value={totals?.total_maker_rebates ?? 0}
            sub="25% of maker-side fees"
          />
          <RevenueItem
            label="Combined Revenue"
            value={totals?.total_maker_rebates ?? 0}
            sub="Today"
            accent="#00A844"
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
  label, value, sub, accent,
}: {
  label: string; value: number; sub: string; accent?: string
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#6B7280', letterSpacing: '0.07em' }}>
        {label}
      </p>
      <p className="font-mono font-bold text-2xl" style={{ color: accent ?? '#111A11' }}>
        {value.toFixed(2)}
      </p>
      <p className="text-xs" style={{ color: '#9CA3AF' }}>{sub}</p>
    </div>
  )
}
