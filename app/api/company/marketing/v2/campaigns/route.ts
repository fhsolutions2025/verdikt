import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// GET /api/company/marketing/v2/campaigns?status=&brand_id=
export async function GET(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const brandId = url.searchParams.get('brand_id')

  const svc = await createServiceClient()
  let q = svc.from('mkt_campaigns').select('*').order('created_at', { ascending: false })
  if (status) q = q.eq('status', status)
  if (brandId) q = q.eq('brand_id', brandId)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// POST /api/company/marketing/v2/campaigns — create a campaign + brief
export async function POST(req: Request) {
  const { user, role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { brand_id, name, brief } = body
  if (!brand_id) return NextResponse.json({ error: 'brand_id is required', code: 'needs_input' }, { status: 400 })
  if (!name?.trim()) return NextResponse.json({ error: 'name is required', code: 'needs_input' }, { status: 400 })

  const svc = await createServiceClient()

  // Resolve region (brief.region or brand's first region).
  const { data: brand } = await svc.from('mkt_brands').select('regions').eq('id', brand_id).single()
  if (!brand) return NextResponse.json({ error: 'brand not found' }, { status: 404 })
  const region = brief?.region ?? brand.regions?.[0]
  if (!region) return NextResponse.json({ error: 'region required', code: 'needs_input', details: { needs: ['region'] } }, { status: 400 })

  // Block campaigns in blocked regions up front.
  const { data: regRow } = await svc.from('mkt_compliance_regions').select('framing').eq('region', region).eq('enabled', true).maybeSingle()
  if (!regRow) return NextResponse.json({ error: `Region ${region} is not configured for compliance`, code: 'region_unconfigured' }, { status: 422 })
  if (regRow.framing === 'blocked') return NextResponse.json({ error: `Marketing is blocked in region ${region}`, code: 'region_blocked' }, { status: 422 })

  const { data: campaign, error } = await svc.from('mkt_campaigns').insert({
    brand_id, name, goal: brief?.goal ?? null, status: 'DRAFT', region,
    start_date: brief?.start_date ?? null, end_date: brief?.end_date ?? null,
    budget_usd: brief?.budget_usd ?? 0, created_by: user?.id ?? null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (brief) {
    await svc.from('mkt_campaign_briefs').insert({
      campaign_id: campaign.id, goal: brief.goal ?? null, audience: brief.audience ?? null,
      channels: brief.channels ?? [], region, start_date: brief.start_date ?? null,
      end_date: brief.end_date ?? null, budget_usd: brief.budget_usd ?? 0,
      constraints: brief.constraints ?? {}, raw_input: brief.raw_input ?? null,
    })
  }

  await svc.from('mkt_activity').insert({
    campaign_id: campaign.id, type: 'agent.step', actor: 'Operator', text: `Campaign "${name}" created`,
  })

  return NextResponse.json({ campaign }, { status: 201 })
}
