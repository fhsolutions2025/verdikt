import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// GET /api/company/marketing/v2/activity?campaign_id=&limit=
export async function GET(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const campaignId = url.searchParams.get('campaign_id')
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)

  const svc = await createServiceClient()
  let q = svc.from('mkt_activity').select('*').order('created_at', { ascending: false }).limit(limit)
  if (campaignId) q = q.eq('campaign_id', campaignId)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}
