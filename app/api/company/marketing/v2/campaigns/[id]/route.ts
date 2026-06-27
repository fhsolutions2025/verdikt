import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// GET /api/company/marketing/v2/campaigns/[id] — campaign + artifacts summary + latest run
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  const svc = await createServiceClient()
  const { data: campaign, error } = await svc.from('mkt_campaigns').select('*').eq('id', id).single()
  if (error || !campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [{ data: artifacts }, { data: runs }, { data: brand }] = await Promise.all([
    svc.from('mkt_artifacts').select('*').eq('campaign_id', id).order('created_at', { ascending: false }),
    svc.from('mkt_agent_runs').select('*').eq('campaign_id', id).order('created_at', { ascending: false }).limit(1),
    svc.from('mkt_brands').select('id,name,voice,regions').eq('id', campaign.brand_id).single(),
  ])

  return NextResponse.json({
    campaign, brand: brand ?? null,
    artifacts: artifacts ?? [], latest_run: runs?.[0] ?? null,
  })
}
