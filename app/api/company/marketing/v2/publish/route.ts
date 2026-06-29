import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { channelDescriptor } from '@/lib/marketing/publishers'

export const dynamic = 'force-dynamic'

// GET /api/company/marketing/v2/publish?artifact_id=  → publication records for an asset
export async function GET(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const artifactId = new URL(req.url).searchParams.get('artifact_id')
  if (!artifactId) return NextResponse.json({ error: 'artifact_id is required' }, { status: 400 })
  const svc = await createServiceClient()
  const { data } = await svc.from('mkt_publications').select('id,channel,status,url,published_at').eq('artifact_id', artifactId).order('published_at', { ascending: false })
  return NextResponse.json({ publications: data ?? [] })
}

// POST /api/company/marketing/v2/publish  { artifact_id, channel }
// Publishes an APPROVED asset. 'home_carousel' writes a live promo_banners row shown
// on the player home; any other channel records an export (no live social API yet).
export async function POST(req: Request) {
  const { user, role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { artifact_id, channel } = await req.json().catch(() => ({})) as { artifact_id?: string; channel?: string }
  if (!artifact_id || !channel) return NextResponse.json({ error: 'artifact_id and channel are required' }, { status: 400 })

  const svc = await createServiceClient()
  const { data: artifact } = await svc.from('mkt_artifacts').select('id,campaign_id,type,title,status,latest_version_id').eq('id', artifact_id).maybeSingle()
  if (!artifact) return NextResponse.json({ error: 'artifact not found' }, { status: 404 })
  if (artifact.status !== 'approved') return NextResponse.json({ error: 'Only approved assets can be published' }, { status: 422 })

  const desc = channelDescriptor(channel)
  if (!desc) return NextResponse.json({ error: `Unknown channel "${channel}"` }, { status: 400 })

  // Resolve the asset url from the latest version.
  let url: string | null = null
  if (artifact.latest_version_id) {
    const { data: ver } = await svc.from('mkt_artifact_versions').select('asset_url').eq('id', artifact.latest_version_id).maybeSingle()
    url = (ver?.asset_url as string | null) ?? null
  }

  let status = 'exported'
  let target: string | null = null

  if (channel === 'home_carousel') {
    if (!url) return NextResponse.json({ error: 'Asset has no image to publish' }, { status: 422 })
    const { data: maxRow } = await svc.from('promo_banners').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
    const nextOrder = (Number(maxRow?.sort_order ?? 0) || 0) + 1
    const { data: banner, error } = await svc.from('promo_banners').insert({
      image_url: url, headline: null, subtext: null, cta_label: 'Explore markets →', cta_href: '/player',
      sort_order: nextOrder, is_active: true,
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    status = 'published'
    target = banner?.id as string
  }

  const { data: pub } = await svc.from('mkt_publications').insert({
    artifact_id, campaign_id: artifact.campaign_id, channel, target, status, url, published_by: user?.id ?? null,
  }).select('id').single()

  await svc.from('mkt_activity').insert({
    campaign_id: artifact.campaign_id, type: 'publish', actor: 'Operator',
    text: `${status === 'published' ? 'Published' : 'Exported'} ${artifact.title ?? 'asset'} → ${channel}`.slice(0, 200),
    target_ref: artifact_id,
  })

  return NextResponse.json({ ok: true, status, channel, publication_id: pub?.id ?? null, url })
}
