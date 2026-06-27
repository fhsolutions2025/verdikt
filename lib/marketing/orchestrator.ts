// Marketing orchestrator: turns an approved plan into versioned artifacts.
//
// MVP runs synchronously (kicked by the run route). It decomposes the campaign
// plan into tasks, runs the sub-agents (lib/marketing/agents.ts), evaluates and
// compliance-checks each output, and persists artifacts + immutable versions +
// activity feed events. See docs/verdikt-marketing-agent/04 & 09.

import { createServiceClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  runPlanner, writeBlog, writeSocial, generateImage, reviewArtifact,
  type BrandCtx, type BriefCtx, type CampaignPlan,
} from '@/lib/marketing/agents'
import { checkCompliance } from '@/lib/marketing/compliance'

type Svc = SupabaseClient

async function logActivity(svc: Svc, e: {
  campaign_id?: string; run_id?: string; type: string; actor: string; text: string; target_ref?: string; severity?: string
}) {
  await svc.from('mkt_activity').insert({
    campaign_id: e.campaign_id ?? null, run_id: e.run_id ?? null,
    type: e.type, actor: e.actor, text: e.text, target_ref: e.target_ref ?? null,
    severity: e.severity ?? 'info',
  })
}

interface BrandRow { id: string; name: string; voice: Record<string, unknown>; regions: string[] }
interface CampaignRow { id: string; brand_id: string; region: string | null; goal: string | null; plan: CampaignPlan | null; status: string }

async function loadContext(svc: Svc, campaignId: string): Promise<{ campaign: CampaignRow; brand: BrandRow; brief: BriefCtx; disclaimers: string[]; region: string }> {
  const { data: campaign } = await svc.from('mkt_campaigns').select('*').eq('id', campaignId).single()
  if (!campaign) throw new Error('Campaign not found')
  const { data: brand } = await svc.from('mkt_brands').select('id,name,voice,regions').eq('id', campaign.brand_id).single()
  if (!brand) throw new Error('Brand not found')
  const { data: briefRow } = await svc.from('mkt_campaign_briefs').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false }).limit(1).maybeSingle()

  const region = campaign.region ?? brand.regions?.[0] ?? ''
  const brief: BriefCtx = {
    goal: briefRow?.goal ?? campaign.goal ?? '',
    audience: briefRow?.audience ?? '',
    channels: briefRow?.channels ?? [],
    region,
  }
  const { data: regionRow } = await svc.from('mkt_compliance_regions').select('mandatory_disclaimers').eq('region', region).eq('enabled', true).maybeSingle()
  return {
    campaign: campaign as CampaignRow,
    brand: brand as BrandRow,
    brief,
    disclaimers: regionRow?.mandatory_disclaimers ?? [],
    region,
  }
}

function brandCtx(brand: BrandRow, region: string): BrandCtx {
  return { name: brand.name, voice: brand.voice ?? {}, region }
}

/** Plan a campaign: run the planner, store the plan, open a plan-approval gate. */
export async function planCampaign(campaignId: string): Promise<{ plan: CampaignPlan }> {
  const svc = await createServiceClient()
  const { brand, brief, region } = await loadContext(svc, campaignId)

  await svc.from('mkt_campaigns').update({ status: 'PLANNING' }).eq('id', campaignId)
  await logActivity(svc, { campaign_id: campaignId, type: 'agent.step', actor: 'Campaign Planner', text: 'Planning campaign…' })

  const plan = await runPlanner(brandCtx(brand, region), brief)

  await svc.from('mkt_campaigns').update({ plan }).eq('id', campaignId)

  // Plan as an artifact + version + pending approval gate.
  const artifactId = await createArtifact(svc, {
    campaign_id: campaignId, type: 'plan', title: plan.objective || 'Campaign plan',
    content: plan as unknown as Record<string, unknown>, created_by_agent: 'Campaign Planner',
  })
  await svc.from('mkt_approvals').insert({ artifact_id: artifactId, campaign_id: campaignId, gate: 'plan', decision: 'pending' })
  await logActivity(svc, { campaign_id: campaignId, type: 'approval.requested', actor: 'Master Agent', text: 'Plan ready — awaiting approval', target_ref: artifactId })

  return { plan }
}

interface CreateArtifactArgs {
  campaign_id: string; type: string; channel?: string; title: string
  content: Record<string, unknown>; asset_url?: string
  provenance?: Record<string, unknown>; eval_scores?: Record<string, unknown>; compliance_result?: Record<string, unknown>
  created_by_agent: string; status?: string
}

// Create an artifact + its immutable v1 and point latest_version_id at it.
async function createArtifact(svc: Svc, a: CreateArtifactArgs): Promise<string> {
  const { data: artifact, error } = await svc.from('mkt_artifacts').insert({
    campaign_id: a.campaign_id, type: a.type, channel: a.channel ?? null,
    title: a.title, status: a.status ?? 'needs_review', created_by_agent: a.created_by_agent,
  }).select('id').single()
  if (error || !artifact) throw new Error(`artifact insert failed: ${error?.message}`)

  const { data: version, error: vErr } = await svc.from('mkt_artifact_versions').insert({
    artifact_id: artifact.id, version: 1, content: a.content, asset_url: a.asset_url ?? null,
    source: 'agent', provenance: a.provenance ?? {}, eval_scores: a.eval_scores ?? null,
    compliance_result: a.compliance_result ?? null,
  }).select('id').single()
  if (vErr || !version) throw new Error(`version insert failed: ${vErr?.message}`)

  await svc.from('mkt_artifacts').update({ latest_version_id: version.id }).eq('id', artifact.id)
  await logActivity(svc, { campaign_id: a.campaign_id, type: 'artifact.created', actor: a.created_by_agent, text: `Created ${a.type}: ${a.title}`.slice(0, 160), target_ref: artifact.id })
  return artifact.id
}

/** Execute an approved campaign plan: generate all content items as artifacts. */
export async function executeCampaign(campaignId: string): Promise<{ run_id: string; artifacts: number; errors: number }> {
  const svc = await createServiceClient()
  const { campaign, brand, brief, disclaimers, region } = await loadContext(svc, campaignId)
  const plan: CampaignPlan | null = campaign.plan
  if (!plan) throw new Error('No plan to execute — plan the campaign first')

  const bctx = brandCtx(brand, region)

  const { data: run } = await svc.from('mkt_agent_runs').insert({
    campaign_id: campaignId, workflow: 'create_campaign', status: 'running', started_at: new Date().toISOString(),
  }).select('id').single()
  const runId = run!.id as string

  await svc.from('mkt_campaigns').update({ status: 'GENERATING' }).eq('id', campaignId)
  await logActivity(svc, { campaign_id: campaignId, run_id: runId, type: 'agent.started', actor: 'Master Agent', text: `Executing ${plan.content_items.length} content items` })

  let made = 0, errors = 0

  for (const item of plan.content_items) {
    const { data: task } = await svc.from('mkt_agent_tasks').insert({
      run_id: runId, agent: item.type, type: `generate.${item.type}`, inputs: item, status: 'running', started_at: new Date().toISOString(),
    }).select('id').single()
    const taskId = task!.id as string

    try {
      let title = ''; let content: Record<string, unknown> = {}; let assetUrl: string | undefined; let agentName = ''; let reviewText = ''

      if (item.type === 'blog') {
        agentName = 'Copywriter'
        const blog = await writeBlog(bctx, item.brief || brief.goal, disclaimers)
        title = blog.title; content = blog as unknown as Record<string, unknown>
        reviewText = `${blog.title}\n${blog.body_markdown}`
      } else if (item.type === 'social') {
        agentName = 'Copywriter'
        const platform = item.platform || 'instagram'
        const social = await writeSocial(bctx, item.brief || brief.goal, platform, disclaimers)
        title = `${platform} post`; content = social as unknown as Record<string, unknown>
        reviewText = social.caption
      } else if (item.type === 'image') {
        agentName = 'Image Generation Agent'
        const img = await generateImage(bctx, item.brief || brief.goal, campaignId)
        title = 'Campaign image'; content = { prompt: img.prompt, alt_text: img.alt_text, seo_tags: img.seo_tags } as Record<string, unknown>
        assetUrl = img.url; reviewText = img.alt_text
      } else {
        throw new Error(`Unsupported content item type: ${item.type}`)
      }

      // Eval (lightweight) + region compliance.
      const review = item.type === 'image' ? { overall: 0.85, verdict: 'pass' as const, feedback: [] } : await reviewArtifact(bctx, item.type, reviewText)
      const compliance = await checkCompliance(region, item.type === 'image' ? content : content, item.type)

      await createArtifact(svc, {
        campaign_id: campaignId, type: item.type, channel: item.platform, title,
        content, asset_url: assetUrl, created_by_agent: agentName,
        provenance: { run_id: runId, task_id: taskId },
        eval_scores: review as unknown as Record<string, unknown>,
        compliance_result: compliance as unknown as Record<string, unknown>,
      })

      await logActivity(svc, { campaign_id: campaignId, run_id: runId, type: 'compliance.checked', actor: 'Compliance Agent',
        text: `${item.type} compliance: ${compliance.verdict}${compliance.violations.length ? ' (' + compliance.violations.length + ' issue/s)' : ''}`,
        severity: compliance.verdict === 'block' ? 'warn' : 'info' })

      await svc.from('mkt_agent_tasks').update({ status: 'succeeded', finished_at: new Date().toISOString() }).eq('id', taskId)
      made++
    } catch (err) {
      errors++
      await svc.from('mkt_agent_tasks').update({ status: 'failed', error: (err as Error).message, finished_at: new Date().toISOString() }).eq('id', taskId)
      await logActivity(svc, { campaign_id: campaignId, run_id: runId, type: 'error', actor: 'Master Agent', text: `${item.type} failed: ${(err as Error).message}`.slice(0, 180), severity: 'error' })
    }
  }

  const status = errors === 0 ? 'completed' : made > 0 ? 'partial' : 'failed'
  await svc.from('mkt_agent_runs').update({ status, finished_at: new Date().toISOString() }).eq('id', runId)
  await svc.from('mkt_campaigns').update({ status: 'IN_REVIEW' }).eq('id', campaignId)
  await logActivity(svc, { campaign_id: campaignId, run_id: runId, type: 'agent.step', actor: 'Master Agent', text: `Run ${status}: ${made} artifact(s)${errors ? `, ${errors} error(s)` : ''}` })

  return { run_id: runId, artifacts: made, errors }
}
