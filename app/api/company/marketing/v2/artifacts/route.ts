import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// GET /api/company/marketing/v2/artifacts?campaign_id=&type=&with_versions=1
export async function GET(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const campaignId = url.searchParams.get('campaign_id')
  const type = url.searchParams.get('type')
  const withVersions = url.searchParams.get('with_versions') === '1'

  const svc = await createServiceClient()
  let q = svc.from('mkt_artifacts').select('*').order('created_at', { ascending: false })
  if (campaignId) q = q.eq('campaign_id', campaignId)
  if (type) q = q.eq('type', type)
  const { data: artifacts, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!withVersions || !artifacts?.length) return NextResponse.json({ data: artifacts ?? [] })

  // Attach latest version content for the canvas.
  const ids = artifacts.map(a => a.latest_version_id).filter(Boolean)
  const { data: versions } = await svc.from('mkt_artifact_versions').select('*').in('id', ids)
  const vById = new Map((versions ?? []).map(v => [v.id, v]))
  const enriched = artifacts.map(a => ({ ...a, latest_version: a.latest_version_id ? vById.get(a.latest_version_id) ?? null : null }))
  return NextResponse.json({ data: enriched })
}
