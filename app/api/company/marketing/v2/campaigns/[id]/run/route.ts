import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { planCampaign, executeCampaign } from '@/lib/marketing/orchestrator'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// POST /api/company/marketing/v2/campaigns/[id]/run  { mode: "plan" | "execute" }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const { mode } = await req.json().catch(() => ({ mode: 'plan' }))

  try {
    if (mode === 'execute') {
      // Require an approved plan gate.
      const svc = await createServiceClient()
      const { data: approval } = await svc.from('mkt_approvals')
        .select('id').eq('campaign_id', id).eq('gate', 'plan').eq('decision', 'approved').limit(1).maybeSingle()
      if (!approval) {
        return NextResponse.json({ error: 'Plan not approved', code: 'not_approved' }, { status: 409 })
      }
      const result = await executeCampaign(id)
      return NextResponse.json({ result }, { status: 202 })
    }

    // default: plan
    const { plan } = await planCampaign(id)
    return NextResponse.json({ plan }, { status: 202 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
