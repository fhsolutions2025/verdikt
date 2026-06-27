import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import {
  runCopywriter, runPromptOptimizer, runRouter,
  type BrandCtx,
} from '@/lib/marketing/agents'
import { buildBrief, isComplete, type InterviewAnswers } from '@/lib/marketing/directorInterview'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// GET /api/company/marketing/v2/director?run_id=  → the run's sub-agent task rows
// (for the Director right-panel to poll PLANNING → GENERATING → done).
export async function GET(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const runId = new URL(req.url).searchParams.get('run_id')
  if (!runId) return NextResponse.json({ error: 'run_id is required' }, { status: 400 })

  const svc = await createServiceClient()
  const [{ data: run }, { data: tasks }] = await Promise.all([
    svc.from('mkt_agent_runs').select('id,status,campaign_id,error,finished_at').eq('id', runId).maybeSingle(),
    svc.from('mkt_agent_tasks').select('id,agent,type,status,outputs,error,started_at,finished_at').eq('run_id', runId).order('created_at', { ascending: true }),
  ])
  if (!run) return NextResponse.json({ error: 'run not found' }, { status: 404 })
  return NextResponse.json({ run, tasks: tasks ?? [] })
}

// POST /api/company/marketing/v2/director  { brand_id, answers }
// Creates a campaign from the hardcoded interview, then fans out the three
// sub-agents (copywriter + prompt-optimizer in parallel, then router) writing live
// status to mkt_agent_tasks. In-request execution; the client polls the GET above.
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

  // Brand + region validation (mirrors the campaigns POST guard).
  const { data: brand } = await svc.from('mkt_brands').select('id,name,voice,regions').eq('id', brand_id).single()
  if (!brand) return NextResponse.json({ error: 'brand not found' }, { status: 404 })
  const region = brief.region || brand.regions?.[0] || ''
  if (!region) return NextResponse.json({ error: 'region required' }, { status: 400 })
  const { data: regRow } = await svc.from('mkt_compliance_regions').select('framing').eq('region', region).eq('enabled', true).maybeSingle()
  if (!regRow) return NextResponse.json({ error: `Region ${region} is not configured for compliance`, code: 'region_unconfigured' }, { status: 422 })
  if (regRow.framing === 'blocked') return NextResponse.json({ error: `Marketing is blocked in region ${region}`, code: 'region_blocked' }, { status: 422 })

  const name = (brief.goal || brief.vertical || 'Director campaign').slice(0, 70)
  const bctx: BrandCtx = { name: brand.name, voice: brand.voice ?? {}, region }

  // Campaign + brief.
  const { data: campaign, error: cErr } = await svc.from('mkt_campaigns').insert({
    brand_id, name, goal: brief.goal || null, status: 'PLANNING', region,
    created_by: user?.id ?? null,
  }).select('id').single()
  if (cErr || !campaign) return NextResponse.json({ error: cErr?.message ?? 'campaign insert failed' }, { status: 500 })
  const campaignId = campaign.id as string

  await svc.from('mkt_campaign_briefs').insert({
    campaign_id: campaignId, goal: brief.goal || null, audience: brief.audience || null,
    channels: brief.channels, region,
    constraints: { vertical: brief.vertical, tone: brief.tone },
    raw_input: brief.notes || null,
  })

  // Run + three task rows (visible immediately for polling).
  const { data: run } = await svc.from('mkt_agent_runs').insert({
    campaign_id: campaignId, workflow: 'director', status: 'running', started_at: new Date().toISOString(),
  }).select('id').single()
  const runId = run!.id as string

  const mkTask = async (agent: string, type: string) => {
    const { data } = await svc.from('mkt_agent_tasks').insert({
      run_id: runId, agent, type, inputs: brief as unknown as Record<string, unknown>,
      status: 'running', started_at: new Date().toISOString(),
    }).select('id').single()
    return data!.id as string
  }
  const [copyTaskId, promptTaskId, routerTaskId] = await Promise.all([
    mkTask('copywriter', 'director.copy'),
    mkTask('prompt-optimizer', 'director.prompts'),
    mkTask('router', 'director.route'),
  ])

  const finishTask = (id: string, outputs: Record<string, unknown> | null, error?: string) =>
    svc.from('mkt_agent_tasks').update({
      status: error ? 'failed' : 'succeeded', outputs: outputs ?? {},
      error: error ?? null, finished_at: new Date().toISOString(),
    }).eq('id', id)

  const logActivity = (text: string, actor: string, severity = 'info') =>
    svc.from('mkt_activity').insert({ campaign_id: campaignId, run_id: runId, type: 'agent.step', actor, text: text.slice(0, 200), severity })

  await logActivity(`Director kicked off ${name}`, 'Campaign Director')

  // Copywriter + prompt-optimizer run in parallel; router depends on both.
  const [copyRes, promptRes] = await Promise.allSettled([
    runCopywriter(bctx, brief),
    runPromptOptimizer(bctx, brief),
  ])

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

  const errors = [copyRes.status === 'rejected', promptRes.status === 'rejected', !router].filter(Boolean).length
  const runStatus = errors === 0 ? 'completed' : errors >= 3 ? 'failed' : 'partial'
  await svc.from('mkt_agent_runs').update({ status: runStatus, finished_at: new Date().toISOString() }).eq('id', runId)

  // Persist the assembled director output onto the campaign plan.
  await svc.from('mkt_campaigns').update({
    plan: { director: true, brief, copy, prompts, router } as unknown as Record<string, unknown>,
  }).eq('id', campaignId)
  await logActivity(`Director run ${runStatus}${errors ? ` (${errors} sub-agent error/s)` : ''}`, 'Campaign Director', errors ? 'warn' : 'info')

  return NextResponse.json({ campaign_id: campaignId, run_id: runId, status: runStatus }, { status: 202 })
}
