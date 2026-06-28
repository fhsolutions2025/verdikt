import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { getFalVideoModel, FAL_DRAFT_MODEL_ID, estVideoCost, type FalVideoParams } from '@/lib/falVideoModels'
import { contextCues } from '@/lib/marketing/agents'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BUCKET = 'marketing-media'
const falProxyUrl = () => `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/functions/v1/fal-proxy`
const authHeader = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}` })

type Svc = Awaited<ReturnType<typeof createServiceClient>>

async function rehost(svc: Svc, videoUrl: string): Promise<string> {
  const res = await fetch(videoUrl, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`fetch video ${res.status}`)
  const bytes = await res.arrayBuffer()
  const path = `video/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`
  const up = await svc.storage.from(BUCKET).upload(path, bytes, { contentType: 'video/mp4', upsert: false })
  if (up.error) throw new Error(`Storage upload failed: ${up.error.message}`)
  return svc.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

// POST /api/company/marketing/v2/director/generate-asset  { task_id }
// Renders a single QUEUED video asset on demand (cheap draft tier to control spend),
// re-hosts it, links a video artifact, and flips the task to succeeded. The grid
// polls the director GET and shows the card spinner → clip.
export async function POST(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { task_id } = await req.json().catch(() => ({})) as { task_id?: string }
  if (!task_id) return NextResponse.json({ error: 'task_id is required' }, { status: 400 })
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 })
  }

  const svc = await createServiceClient()
  const { data: task } = await svc.from('mkt_agent_tasks').select('id,run_id,type,inputs,status').eq('id', task_id).maybeSingle()
  if (!task || task.type !== 'asset.video') return NextResponse.json({ error: 'video asset task not found' }, { status: 404 })
  if (task.status === 'succeeded') return NextResponse.json({ error: 'already generated' }, { status: 409 })

  const { data: run } = await svc.from('mkt_agent_runs').select('campaign_id').eq('id', task.run_id).maybeSingle()
  const campaignId = run?.campaign_id as string | undefined
  const spec = (task.inputs ?? {}) as { channel?: string | null; label?: string; prompt?: string }

  // Enrich the (preserved) prompt with the campaign's vertical/audience/region/headline
  // so the clip is on-topic — not a generic teaser. Mirrors the image pipeline.
  let prompt = spec.prompt || 'on-brand marketing teaser, cinematic'
  if (campaignId) {
    const { data: campaign } = await svc.from('mkt_campaigns').select('region,plan').eq('id', campaignId).maybeSingle()
    const plan = (campaign?.plan ?? {}) as { brief?: { vertical?: string; audience?: string }; copy?: { headline_hooks?: string[] } }
    const cues = contextCues({
      vertical: plan.brief?.vertical, audience: plan.brief?.audience,
      region: campaign?.region ?? undefined, headline: plan.copy?.headline_hooks?.[0],
    })
    if (cues) prompt = `${prompt}. ${cues}.`
  }

  await svc.from('mkt_agent_tasks').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', task_id)

  const fail = async (msg: string, code = 502) => {
    await svc.from('mkt_agent_tasks').update({ status: 'failed', error: msg.slice(0, 200), finished_at: new Date().toISOString() }).eq('id', task_id)
    return NextResponse.json({ error: msg }, { status: code })
  }

  // Cheap draft model keeps on-click spend controlled (per the locked decision).
  const def = getFalVideoModel(FAL_DRAFT_MODEL_ID)
  if (!def) return fail('Draft video model unavailable', 500)
  const duration = def.durations[0]
  const params: FalVideoParams = { prompt, aspect: '9:16', duration, resolution: def.resolutions[0], audio: false }
  const input = def.buildInput(params)

  const { data: job } = await svc.from('mkt_video_jobs').insert({
    model: def.id, model_label: def.label, prompt, is_draft: true, aspect: '9:16',
    duration, resolution: def.resolutions[0], audio: false, status: 'processing', cost_est: estVideoCost(def, duration, false),
  }).select('id').single()
  const jobId = job?.id as string | undefined
  if (jobId) await svc.from('mkt_agent_tasks').update({ outputs: { job_id: jobId } }).eq('id', task_id)

  // Submit + poll ~100s using fal's own poll urls (mirrors the video studio route).
  const sub = await fetch(falProxyUrl(), { method: 'POST', headers: authHeader(), body: JSON.stringify({ op: 'video.submit', model: def.id, input }) }).then(r => r.json()).catch(() => ({}))
  if (!sub.request_id) {
    if (jobId) await svc.from('mkt_video_jobs').update({ status: 'failed', error: sub.error ?? 'submit failed' }).eq('id', jobId)
    return fail(sub.error ? `Video submit failed — ${sub.error}` : 'Video submit failed')
  }
  const { request_id, model, status_url, response_url } = sub
  if (jobId) await svc.from('mkt_video_jobs').update({ request_id, status_url, response_url }).eq('id', jobId)

  const deadline = Date.now() + 100_000
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5_000))
    const st = await fetch(falProxyUrl(), { method: 'POST', headers: authHeader(), body: JSON.stringify({ op: 'video.status', request_id, model, status_url }) }).then(r => r.json()).catch(() => ({}))
    if (st.status === 'COMPLETED') {
      const result = await fetch(falProxyUrl(), { method: 'POST', headers: authHeader(), body: JSON.stringify({ op: 'video.result', request_id, model, response_url }) }).then(r => r.json()).catch(() => ({}))
      if (!result.video_url) {
        if (jobId) await svc.from('mkt_video_jobs').update({ status: 'failed', error: result.error ?? 'no url' }).eq('id', jobId)
        return fail(result.error ? `Video failed — ${result.error}` : 'Video completed but no URL')
      }
      const url = await rehost(svc, result.video_url)
      if (jobId) await svc.from('mkt_video_jobs').update({ status: 'completed', video_url: url }).eq('id', jobId)
      await svc.from('ai_call_log').insert({ call_type: 'fal-video', model: model ?? def.id, success: true, from_cache: false }).then(() => {}, () => {})
      let artId: string | null = null
      if (campaignId) {
        const { data: art } = await svc.from('mkt_artifacts').insert({ campaign_id: campaignId, type: 'video', channel: spec.channel ?? null, title: spec.label ?? 'Video', status: 'needs_review', created_by_agent: 'Campaign Director' }).select('id').single()
        if (art) { await svc.from('mkt_artifact_versions').insert({ artifact_id: art.id, version: 1, content: { prompt }, asset_url: url, source: 'agent' }); artId = art.id as string; await svc.from('mkt_artifacts').update({ latest_version_id: (await svc.from('mkt_artifact_versions').select('id').eq('artifact_id', art.id).limit(1).single()).data?.id }).eq('id', art.id) }
      }
      await svc.from('mkt_agent_tasks').update({ status: 'succeeded', outputs: { url, job_id: jobId, artifact_id: artId }, finished_at: new Date().toISOString() }).eq('id', task_id)
      return NextResponse.json({ url, task_id }, { status: 200 })
    }
    if (st.status === 'FAILED' || st.error) {
      if (jobId) await svc.from('mkt_video_jobs').update({ status: 'failed', error: st.error ?? 'failed' }).eq('id', jobId)
      return fail(st.error ?? 'Video generation failed')
    }
  }
  // Still processing past our window — leave the task running; the job is durable.
  return NextResponse.json({ processing: true, task_id, job_id: jobId }, { status: 202 })
}
