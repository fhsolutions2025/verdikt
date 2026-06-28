import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { deriveQualityScore } from '@/lib/marketing/assetIntelligence'
import { computeHealth, type CampaignHealth } from '@/lib/marketing/analytics'

export const dynamic = 'force-dynamic'

interface CampaignAnalytics {
  campaign_id: string
  name: string
  total: number
  approved: number
  published: number
  avg_quality: number | null
  health: CampaignHealth
}

// GET /api/company/marketing/v2/analytics?brand_id=
// Per-campaign analytics + continuously-computed Campaign Health Score for a brand.
export async function GET(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const brandId = new URL(req.url).searchParams.get('brand_id')
  if (!brandId) return NextResponse.json({ error: 'brand_id is required' }, { status: 400 })

  const svc = await createServiceClient()
  const { data: campaigns } = await svc.from('mkt_campaigns')
    .select('id,name').eq('brand_id', brandId).order('created_at', { ascending: false }).limit(20)
  if (!campaigns?.length) return NextResponse.json({ campaigns: [], totals: null })

  const out: CampaignAnalytics[] = []
  for (const c of campaigns) {
    const cid = c.id as string
    const [{ data: arts }, { data: runs }, { data: pubs }] = await Promise.all([
      svc.from('mkt_artifacts').select('id,status,latest_version_id').eq('campaign_id', cid),
      svc.from('mkt_agent_runs').select('id').eq('campaign_id', cid),
      svc.from('mkt_publications').select('id').eq('campaign_id', cid),
    ])
    const artifacts = arts ?? []
    const total = artifacts.length
    const approved = artifacts.filter(a => a.status === 'approved').length

    // Quality + compliance from latest versions.
    const verIds = artifacts.map(a => a.latest_version_id).filter((x): x is string => !!x)
    const { data: versions } = verIds.length
      ? await svc.from('mkt_artifact_versions').select('id,content').in('id', verIds)
      : { data: [] }
    const scores: number[] = []
    let complianceFlags = 0
    for (const v of versions ?? []) {
      const q = deriveQualityScore(v.content)
      if (q != null) scores.push(q)
      const content = (v.content ?? {}) as { review?: { compliance?: { verdict?: string }; qa?: { blocked_from_publish?: boolean } } }
      const cv = content.review?.compliance?.verdict
      if (cv === 'block' || cv === 'warn' || content.review?.qa?.blocked_from_publish) complianceFlags++
    }
    const avgQuality = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null

    // Coverage from asset tasks across the campaign's runs.
    const runIds = (runs ?? []).map(r => r.id as string)
    let coveragePlanned = total, coverageDone = total
    if (runIds.length) {
      const { data: tasks } = await svc.from('mkt_agent_tasks').select('status,type').in('run_id', runIds).like('type', 'asset.%')
      const at = tasks ?? []
      coveragePlanned = at.length || total
      coverageDone = at.filter(t => t.status === 'succeeded').length
    }

    const health = computeHealth({
      total, approved, published: (pubs ?? []).length, avgQuality, complianceFlags, coveragePlanned, coverageDone,
    })
    out.push({ campaign_id: cid, name: c.name as string, total, approved, published: (pubs ?? []).length, avg_quality: avgQuality, health })
  }

  const totals = {
    campaigns: out.length,
    assets: out.reduce((s, c) => s + c.total, 0),
    approved: out.reduce((s, c) => s + c.approved, 0),
    published: out.reduce((s, c) => s + c.published, 0),
    avg_health: out.length ? Math.round(out.reduce((s, c) => s + c.health.score, 0) / out.length) : 0,
  }
  return NextResponse.json({ campaigns: out, totals })
}
