import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { generateImage, type BrandCtx } from '@/lib/marketing/agents'
import { generateImageVariations } from '@/lib/marketing/imageEngines'
import { runBrandGuardian, runComplianceReviewer } from '@/lib/marketing/specialists'
import { runQa, type QaResult } from '@/lib/marketing/qa'
import { runChannelCopy } from '@/lib/marketing/copyPipeline'
import { retrieveKnowledge, formatKnowledgeContext } from '@/lib/marketing/knowledge'
import type { CampaignBrief } from '@/lib/marketing/directorInterview'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type Svc = Awaited<ReturnType<typeof createServiceClient>>

// §23/§25 quality + governance gates over a generated asset. Runs the QA inspector
// on every asset, plus Brand Guardian (and Compliance for text-bearing assets), and
// folds the verdicts into a single review block stored on the artifact + task. The
// artifact stays in 'needs_review' so the human approval gate sees these findings;
// a hard compliance block or critical QA failure is flagged as blocking.
interface AssetReview {
  qa: QaResult
  brand: { verdict: 'approve' | 'reject'; score: number; issues: string[] }
  compliance: { verdict: 'pass' | 'warn' | 'block'; risks: string[]; required_disclosures: string[] } | null
  blocked: boolean
}

async function reviewAsset(
  bctx: BrandCtx, region: string, vertical: string,
  assetType: string, content: string, brief: string,
  opts: { compliance: boolean },
): Promise<AssetReview> {
  const [qa, brand, compliance] = await Promise.all([
    runQa({ asset_type: assetType, content, brief, brand: `${bctx.name} (region ${region})` }),
    runBrandGuardian(bctx, assetType, content),
    opts.compliance ? runComplianceReviewer(region, vertical, content) : Promise.resolve(null),
  ])
  const blocked =
    qa.blocked_from_publish ||
    qa.severity === 'critical' ||
    brand.verdict === 'reject' ||
    compliance?.verdict === 'block'
  return { qa, brand, compliance, blocked }
}

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
  const plan = (campaign.plan ?? {}) as { brief?: Partial<CampaignBrief>; copy?: { headline_hooks?: string[] } }
  const vertical = plan.brief?.vertical ?? ''
  const briefText = campaign.goal ?? ''
  // Full brief + retrieved knowledge drive the channel-adapted copy pipeline (M3).
  const brief: CampaignBrief = {
    brand_id: campaign.brand_id as string,
    vertical, goal: campaign.goal ?? plan.brief?.goal ?? '',
    audience: plan.brief?.audience ?? '', region,
    channels: plan.brief?.channels ?? [], tone: plan.brief?.tone ?? '', notes: plan.brief?.notes ?? '',
  }
  const kbHits = await retrieveKnowledge(svc, {
    brandId: campaign.brand_id as string, query: `${brief.goal} ${brief.vertical} ${brief.audience}`.trim(), k: 4,
  })
  const knowledge = formatKnowledgeContext(kbHits)
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
    const spec = (t.inputs ?? {}) as { type?: string; channel?: string | null; label?: string; prompt?: string; text?: string; model?: string }
    await svc.from('mkt_agent_tasks').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', t.id)
    try {
      if (t.type === 'asset.copy') {
        // M3 copy pipeline: channel-adapted draft → multi-dimension score → self-heal.
        const channel = spec.channel || 'instagram'
        const scored = await runChannelCopy(bctx, brief, channel, knowledge)
        const text = `${scored.copy.headline}\n\n${scored.copy.body}\n\nCTA: ${scored.copy.cta}${scored.copy.hashtags.length ? `\n${scored.copy.hashtags.join(' ')}` : ''}`
        // §25 QA + §23 Brand/Compliance gates over the final copy.
        const review = await reviewAsset(bctx, region, vertical, 'copy', text, briefText, { compliance: true })
        const content = { body: text, copy: scored.copy, score: scored.score, attempts: scored.attempts, review }
        const artId = await createArtifact(svc, { campaign_id: campaignId, type: 'social', channel, title: spec.label ?? `${channel} copy`, content })
        await svc.from('mkt_agent_tasks').update({ status: 'succeeded', outputs: { text, artifact_id: artId, score: scored.score, review }, finished_at: new Date().toISOString() }).eq('id', t.id)
      } else {
        // M4: route to the best engine (router model / typography → Ideogram, else fal)
        // and generate multiple style concepts to compare. Primary = first variation.
        const basePrompt = spec.prompt || campaign.goal || 'on-brand marketing visual'
        const altText = (imageContext.headline || briefText).slice(0, 80)
        const variations = await generateImageVariations(svc, bctx, basePrompt, {
          campaignId, requestedModel: spec.model ?? null, context: imageContext, altText,
        })
        if (!variations.length) {
          // Fallback to the single-image path so a render still lands.
          const img = await generateImage(bctx, basePrompt, campaignId, { prompt: spec.prompt, context: imageContext })
          variations.push({ style: 'default', label: 'Default', url: img.url, engine: 'ideogram' })
        }
        const primary = variations[0]
        const kind = t.type === 'asset.carousel' ? 'carousel' : 'image'
        // QA + Brand gate over the visual concept; compliance is copy-oriented, skip for pure imagery.
        const review = await reviewAsset(bctx, region, vertical, kind, `${basePrompt}\n${altText}`, briefText, { compliance: false })
        const artId = await createArtifact(svc, {
          campaign_id: campaignId, type: kind, channel: spec.channel ?? null, title: spec.label ?? 'Image',
          content: { prompt: basePrompt, alt_text: altText, engine: primary.engine, variations, review }, asset_url: primary.url,
        })
        await svc.from('mkt_agent_tasks').update({ status: 'succeeded', outputs: { url: primary.url, artifact_id: artId, engine: primary.engine, variations, review }, finished_at: new Date().toISOString() }).eq('id', t.id)
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
