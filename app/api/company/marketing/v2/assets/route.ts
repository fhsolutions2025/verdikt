import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { deriveQualityScore, type AssetIntelligence } from '@/lib/marketing/assetIntelligence'

export const dynamic = 'force-dynamic'

// GET /api/company/marketing/v2/assets?brand_id=&campaign_id=
// Asset Library / Intelligence — every artifact with derived metadata (status,
// version, owner agent, quality score, approval) grouped into campaign collections.
export async function GET(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const brandId = url.searchParams.get('brand_id')
  const campaignId = url.searchParams.get('campaign_id')

  const svc = await createServiceClient()

  // Resolve the candidate campaigns (filter scope) and a name lookup for collections.
  let campQ = svc.from('mkt_campaigns').select('id,name,brand_id')
  if (campaignId) campQ = campQ.eq('id', campaignId)
  else if (brandId) campQ = campQ.eq('brand_id', brandId)
  const { data: campaigns } = await campQ
  const campIds = (campaigns ?? []).map(c => c.id as string)
  const campName = new Map((campaigns ?? []).map(c => [c.id as string, c.name as string]))
  if (!campIds.length) return NextResponse.json({ assets: [], collections: [] })

  const { data: arts } = await svc.from('mkt_artifacts')
    .select('id,campaign_id,type,channel,status,title,created_by_agent,created_at,latest_version_id')
    .in('campaign_id', campIds).order('created_at', { ascending: false }).limit(500)

  const versionIds = (arts ?? []).map(a => a.latest_version_id).filter((x): x is string => !!x)
  const { data: versions } = versionIds.length
    ? await svc.from('mkt_artifact_versions').select('id,version,content,asset_url').in('id', versionIds)
    : { data: [] }
  const verById = new Map((versions ?? []).map(v => [v.id as string, v]))

  const assets: AssetIntelligence[] = (arts ?? []).map(a => {
    const v = a.latest_version_id ? verById.get(a.latest_version_id as string) : undefined
    return {
      id: a.id as string,
      type: a.type as string,
      channel: (a.channel as string | null) ?? null,
      title: (a.title as string) ?? 'Asset',
      status: (a.status as string) ?? 'draft',
      version: v ? Number(v.version ?? 1) : 1,
      agent: (a.created_by_agent as string | null) ?? null,
      quality_score: v ? deriveQualityScore(v.content) : null,
      asset_url: (v?.asset_url as string | null) ?? null,
      campaign_id: (a.campaign_id as string | null) ?? null,
      campaign_name: a.campaign_id ? campName.get(a.campaign_id as string) ?? null : null,
      updated_at: (a.created_at as string) ?? new Date().toISOString(),
    }
  })

  // Collections = campaigns that have at least one asset.
  const collections = (campaigns ?? [])
    .map(c => ({ id: c.id as string, name: c.name as string, count: assets.filter(a => a.campaign_id === c.id).length }))
    .filter(c => c.count > 0)

  return NextResponse.json({ assets, collections })
}
