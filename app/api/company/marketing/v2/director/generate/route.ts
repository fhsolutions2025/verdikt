import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { generateImage, type BrandCtx } from '@/lib/marketing/agents'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type Svc = Awaited<ReturnType<typeof createServiceClient>>

// Insert an artifact + immutable v1, point latest_version_id at it. Returns id.
async function createArtifact(svc: Svc, a: {
  campaign_id: string; type: string; channel: string | null; title: string
  content: Record<string, unknown>; asset_url?: string
}): Promise<string | null> {
  const { data: art } = await svc.from('mkt_artifacts').insert({
    campaign_id: a.campaign_id, type: a.type, channel: a.channel, title: a.title,
    status: 'needs_review', created_by_agent: 'Campaign Director',
  }).select('id').single()
  if (!art) return null
  const { data: ver } = await svc.from('mkt_artifact_versions').insert({
    artifact_id: art.id, version: 1, content: a.content, asset_url: a.asset_url ?? null, source: 'agent',
  }).select('id').single()
  if (ver) await svc.from('mkt_artifacts').update({ latest_version_id: ver.id }).eq('id', art.id)
  return art.id as string
}

// POST /api/company/marketing/v2/director/generate  { run_id }
// Generates every PENDING non-video asset task for the run (images/carousels/copy),
// flipping each task pending→running→succeeded so the polling grid streams updates.
export async function POST(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { run_id } = await req.json().catch(() => ({})) as { run_id?: string }
  if (!run_id) return NextResponse.json({ error: 'run_id is required' }, { status: 400 })

  const svc = await createServiceClient()
  const { data: run } = await svc.from('mkt_agent_runs').select('id,campaign_id').eq('id', run_id).maybeSingle()
  if (!run) return NextResponse.json({ error: 'run not found' }, { status: 404 })
  const campaignId = run.campaign_id as string

  const { data: campaign } = await svc.from('mkt_campaigns').select('brand_id,region,goal,plan').eq('id', campaignId).single()
  if (!campaign) return NextResponse.json({ error: 'campaign not found' }, { status: 404 })
  const { data: brand } = await svc.from('mkt_brands').select('name,voice,regions').eq('id', campaign.brand_id).single()
  const region = campaign.region ?? brand?.regions?.[0] ?? ''
  const bctx: BrandCtx = { name: brand?.name ?? 'Verdikt', voice: brand?.voice ?? {}, region }

  // Campaign context for context-aware image generation (vertical/audience/headline/colors).
  const plan = (campaign.plan ?? {}) as { brief?: { vertical?: string; audience?: string }; copy?: { headline_hooks?: string[] } }
  const { data: brandKit } = await svc.from('brand_settings').select('colors').eq('id', 'default').maybeSingle()
  const brandColors = Array.isArray(brandKit?.colors)
    ? (brandKit!.colors as { hex?: string }[]).map(c => c?.hex).filter((h): h is string => !!h)
    : []
  const imageContext = {
    vertical: plan.brief?.vertical, audience: plan.brief?.audience, region,
    headline: plan.copy?.headline_hooks?.[0], brandColors,
  }

  // Pending non-video asset tasks.
  const { data: tasks } = await svc.from('mkt_agent_tasks')
    .select('id,type,inputs,status').eq('run_id', run_id).in('type', ['asset.image', 'asset.carousel', 'asset.copy']).eq('status', 'pending')

  let made = 0, errors = 0
  for (const t of tasks ?? []) {
    const spec = (t.inputs ?? {}) as { type?: string; channel?: string | null; label?: string; prompt?: string; text?: string }
    await svc.from('mkt_agent_tasks').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', t.id)
    try {
      if (t.type === 'asset.copy') {
        const text = spec.text || campaign.goal || ''
        const artId = await createArtifact(svc, { campaign_id: campaignId, type: 'social', channel: spec.channel ?? null, title: spec.label ?? 'Copy', content: { body: text } })
        await svc.from('mkt_agent_tasks').update({ status: 'succeeded', outputs: { text, artifact_id: artId }, finished_at: new Date().toISOString() }).eq('id', t.id)
      } else {
        const img = await generateImage(bctx, spec.prompt || campaign.goal || 'on-brand marketing visual', campaignId, { prompt: spec.prompt, context: imageContext })
        const artId = await createArtifact(svc, { campaign_id: campaignId, type: t.type === 'asset.carousel' ? 'carousel' : 'image', channel: spec.channel ?? null, title: spec.label ?? 'Image', content: { prompt: img.prompt, alt_text: img.alt_text }, asset_url: img.url })
        await svc.from('mkt_agent_tasks').update({ status: 'succeeded', outputs: { url: img.url, artifact_id: artId }, finished_at: new Date().toISOString() }).eq('id', t.id)
      }
      made++
    } catch (err) {
      errors++
      await svc.from('mkt_agent_tasks').update({ status: 'failed', error: (err as Error).message.slice(0, 200), finished_at: new Date().toISOString() }).eq('id', t.id)
    }
  }

  // Reflect completion on the run/campaign once non-video work is done.
  await svc.from('mkt_campaigns').update({ status: 'IN_REVIEW' }).eq('id', campaignId)
  await svc.from('mkt_agent_runs').update({ status: errors === 0 ? 'completed' : made > 0 ? 'partial' : 'failed' }).eq('id', run_id)

  return NextResponse.json({ generated: made, errors }, { status: 200 })
}
