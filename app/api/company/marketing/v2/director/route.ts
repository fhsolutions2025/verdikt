import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import {
  runCopywriter, runPromptOptimizer, runRouter,
  type BrandCtx,
} from '@/lib/marketing/agents'
import { buildBrief, isComplete, type InterviewAnswers } from '@/lib/marketing/directorInterview'
import { derivePlannedAssets } from '@/lib/marketing/directorAssets'
import { rememberBrief } from '@/lib/marketing/memory'
import { retrieveKnowledge, formatKnowledgeContext } from '@/lib/marketing/knowledge'
import type { AssetItem, AssetState } from '@/components/company/marketing/director/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function taskState(status: string): AssetState {
  return status === 'succeeded' ? 'completed'
    : status === 'running' ? 'in_progress'
    : status === 'failed' ? 'failed'
    : 'queued'
}

// GET /api/company/marketing/v2/director?run_id=  → run + derived asset grid + stats
// + the 3 sub-agent task rows. The Director right pane polls this.
export async function GET(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const runId = new URL(req.url).searchParams.get('run_id')
  if (!runId) return NextResponse.json({ error: 'run_id is required' }, { status: 400 })

  const svc = await createServiceClient()
  const [{ data: run }, { data: tasks }] = await Promise.all([
    svc.from('mkt_agent_runs').select('id,status,campaign_id,error,finished_at').eq('id', runId).maybeSingle(),
    svc.from('mkt_agent_tasks').select('id,agent,type,status,inputs,outputs,error').eq('run_id', runId).order('created_at', { ascending: true }),
  ])
  if (!run) return NextResponse.json({ error: 'run not found' }, { status: 404 })

  const rows = tasks ?? []
  const assets: AssetItem[] = rows
    .filter(t => typeof t.type === 'string' && t.type.startsWith('asset.'))
    .map(t => {
      const i = (t.inputs ?? {}) as Record<string, unknown>
      const o = (t.outputs ?? {}) as Record<string, unknown>
      return {
        id: t.id as string,
        type: (i.type as AssetItem['type']) ?? 'image',
        channel: (i.channel as string | null) ?? null,
        label: (i.label as string) ?? 'Asset',
        dims: (i.dims as string) ?? '',
        state: taskState(t.status as string),
        url: (o.url as string) || undefined,
        text: (o.text as string) || undefined,
        artifactId: (o.artifact_id as string) || undefined,
        jobId: (o.job_id as string) || undefined,
        error: (t.error as string) || undefined,
      }
    })

  const stats = {
    total: assets.length,
    generated: assets.filter(a => a.state === 'completed').length,
    in_progress: assets.filter(a => a.state === 'in_progress').length,
    queued: assets.filter(a => a.state === 'queued').length,
  }
  const agents = rows
    .filter(t => typeof t.type === 'string' && t.type.startsWith('director.'))
    .map(t => ({ id: t.id as string, agent: t.agent as string, status: t.status as string, outputs: (t.outputs ?? null) as Record<string, unknown> | null, error: (t.error as string) || null }))

  return NextResponse.json({ run, assets, stats, agents })
}

// POST /api/company/marketing/v2/director  { brand_id, answers }
// Runs the 3 sub-agents, derives the asset plan, and pre-creates one task per asset
// (status 'pending'). Returns immediately so the client can poll + kick generation.
export async function POST(req: Request) {
  const { user, role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { brand_id, answers } = await req.json().catch(() => ({})) as
    { brand_id?: string; answers?: InterviewAnswers }
  if (!brand_id) return NextResponse.json({ error: 'brand_id is required' }, { status: 400 })
  if (!answers || !isComplete(answers)) {
    return NextResponse.json({ error: 'Please answer every required step first' }, { status: 400 })
  }

  const brief = buildBrief({ ...answers, brand: brand_id })
  const svc = await createServiceClient()

  const { data: brand } = await svc.from('mkt_brands').select('id,name,voice,regions').eq('id', brand_id).single()
  if (!brand) return NextResponse.json({ error: 'brand not found' }, { status: 404 })
  const region = brief.region || brand.regions?.[0] || ''
  if (!region) return NextResponse.json({ error: 'region required' }, { status: 400 })
  // A configured region must not be 'blocked'. Custom countries the operator typed
  // (not in the compliance table) are allowed and treated as prediction-market framing.
  const { data: regRow } = await svc.from('mkt_compliance_regions').select('framing').eq('region', region).eq('enabled', true).maybeSingle()
  if (regRow?.framing === 'blocked') return NextResponse.json({ error: `Marketing is blocked in region ${region}`, code: 'region_blocked' }, { status: 422 })

  const name = (brief.goal || brief.vertical || 'Director campaign').slice(0, 70)
  const bctx: BrandCtx = { name: brand.name, voice: brand.voice ?? {}, region }

  const { data: campaign, error: cErr } = await svc.from('mkt_campaigns').insert({
    brand_id, name, goal: brief.goal || null, status: 'PLANNING', region, created_by: user?.id ?? null,
  }).select('id').single()
  if (cErr || !campaign) return NextResponse.json({ error: cErr?.message ?? 'campaign insert failed' }, { status: 500 })
  const campaignId = campaign.id as string

  await svc.from('mkt_campaign_briefs').insert({
    campaign_id: campaignId, goal: brief.goal || null, audience: brief.audience || null,
    channels: brief.channels, region,
    constraints: { vertical: brief.vertical, tone: brief.tone }, raw_input: brief.notes || null,
  })

  const { data: run } = await svc.from('mkt_agent_runs').insert({
    campaign_id: campaignId, workflow: 'director', status: 'running', started_at: new Date().toISOString(),
  }).select('id').single()
  const runId = run!.id as string

  const mkTask = async (agent: string, type: string, inputs: Record<string, unknown>, status = 'running') => {
    const { data } = await svc.from('mkt_agent_tasks').insert({
      run_id: runId, agent, type, inputs, status, started_at: status === 'running' ? new Date().toISOString() : null,
    }).select('id').single()
    return data!.id as string
  }
  const [copyTaskId, promptTaskId, routerTaskId] = await Promise.all([
    mkTask('copywriter', 'director.copy', brief as unknown as Record<string, unknown>),
    mkTask('prompt-optimizer', 'director.prompts', brief as unknown as Record<string, unknown>),
    mkTask('router', 'director.route', brief as unknown as Record<string, unknown>),
  ])
  const finishTask = (id: string, outputs: Record<string, unknown> | null, error?: string) =>
    svc.from('mkt_agent_tasks').update({
      status: error ? 'failed' : 'succeeded', outputs: outputs ?? {}, error: error ?? null, finished_at: new Date().toISOString(),
    }).eq('id', id)

  await svc.from('mkt_activity').insert({ campaign_id: campaignId, run_id: runId, type: 'agent.step', actor: 'Campaign Director', text: `Director kicked off ${name}`.slice(0, 200) })

  // Remember the durable brief facts at brand scope so the next campaign for this
  // brand pre-fills them (spec § Campaign Memory — "never ask again").
  await rememberBrief(svc, brand_id, {
    vertical: brief.vertical, audience: brief.audience, region: brief.region,
    tone: brief.tone, channels: brief.channels,
  })

  // RAG — retrieve brand knowledge to ground the copywriter (spec § Knowledge Base).
  const kbHits = await retrieveKnowledge(svc, {
    brandId: brand_id, query: `${brief.goal} ${brief.vertical} ${brief.audience}`.trim(), k: 5,
  })
  const knowledge = formatKnowledgeContext(kbHits)

  // Copywriter + prompt-optimizer in parallel, then router.
  const [copyRes, promptRes] = await Promise.allSettled([runCopywriter(bctx, brief, knowledge), runPromptOptimizer(bctx, brief)])
  const copy = copyRes.status === 'fulfilled' ? copyRes.value : null
  await finishTask(copyTaskId, copy as unknown as Record<string, unknown>, copyRes.status === 'rejected' ? String(copyRes.reason).slice(0, 200) : undefined)
  const prompts = promptRes.status === 'fulfilled' ? promptRes.value : null
  await finishTask(promptTaskId, prompts as unknown as Record<string, unknown>, promptRes.status === 'rejected' ? String(promptRes.reason).slice(0, 200) : undefined)

  let router = null
  try {
    router = await runRouter(bctx, brief, copy ?? { headline_hooks: [], copy_variants: [] }, prompts ?? { prompts: [] })
    await finishTask(routerTaskId, router as unknown as Record<string, unknown>)
  } catch (err) {
    await finishTask(routerTaskId, null, (err as Error).message.slice(0, 200))
  }

  // Derive the asset plan and pre-create one 'pending' task per asset so the grid
  // shows the full set immediately. Generation is kicked separately (/director/generate).
  const planned = derivePlannedAssets(brief, copy, prompts)
  for (const a of planned) {
    await mkTask(a.type, `asset.${a.type}`, a as unknown as Record<string, unknown>, 'pending')
  }

  await svc.from('mkt_campaigns').update({
    plan: { director: true, brief, copy, prompts, router } as unknown as Record<string, unknown>,
  }).eq('id', campaignId)

  return NextResponse.json({ campaign_id: campaignId, run_id: runId }, { status: 202 })
}
