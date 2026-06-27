import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { getFalVideoModel, FAL_VIDEO_MODELS, FAL_DRAFT_MODEL_ID, estVideoCost, type FalVideoModel, type FalVideoParams } from '@/lib/falVideoModels'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const BUCKET = 'marketing-media'

function falProxyUrl() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  return `${base}/functions/v1/fal-proxy`
}
function authHeader() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}` }
}

type Svc = Awaited<ReturnType<typeof createServiceClient>>

// Mark a durable job done/failed. Reconciling by id (or request_id) means a billed
// render is never lost or re-paid — even if the client navigated away.
async function finishJob(svc: Svc, where: { id?: string; request_id?: string }, patch: Record<string, unknown>) {
  try {
    let q = svc.from('mkt_video_jobs').update({ ...patch, updated_at: new Date().toISOString() })
    q = where.id ? q.eq('id', where.id) : q.eq('request_id', where.request_id!)
    await q
  } catch { /* best-effort */ }
}

// TEMP (Phase P1): capture fal's raw payload when no URL was extracted, for diagnosis.
async function captureNoUrl(svc: Svc, model: string | undefined, result: { raw?: unknown }) {
  try {
    await svc.from('ai_call_log').insert({
      call_type: 'fal-video-debug', model: model ?? 'fal-video', success: false,
      error_message: JSON.stringify(result.raw ?? result).slice(0, 4000),
    })
  } catch { /* best-effort */ }
}

// Re-host a completed fal video into Storage and return its public URL (fal CDN
// urls expire ~7 days).
async function rehost(svc: Svc, videoUrl: string): Promise<string> {
  const res = await fetch(videoUrl, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`fetch video ${res.status}`)
  const bytes = await res.arrayBuffer()
  const path = `video/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`
  const up = await svc.storage.from(BUCKET).upload(path, bytes, { contentType: 'video/mp4', upsert: false })
  if (up.error) throw new Error(`Storage upload failed: ${up.error.message}`)
  return svc.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

// POST { modelId, prompt, startUrl?, endUrl?, aspect?, duration?, resolution?, audio?, isDraft? }
// Persists a durable job, submits async to fal, polls ~100s; returns { url, jobId }
// when done or { jobId, request_id, processing } if still running (client re-polls).
export async function POST(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const b = body as {
    modelId?: string; prompt?: string; startUrl?: string; endUrl?: string;
    aspect?: string; duration?: number; resolution?: string; audio?: boolean; isDraft?: boolean
  }
  const { prompt, startUrl, endUrl, aspect } = b
  if (!prompt?.trim() && !startUrl) return NextResponse.json({ error: 'Prompt or a start frame is required' }, { status: 400 })
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 })
  }

  // Draft mode forces the cheap workhorse at its lowest resolution, no audio — the
  // "progressive enhancement" tier. Final uses the chosen model + chosen settings.
  const draft = !!b.isDraft
  const chosenId = draft ? FAL_DRAFT_MODEL_ID : (b.modelId ?? '')
  const def: FalVideoModel | undefined = getFalVideoModel(chosenId)
  const audio = draft ? false : !!b.audio
  const resolution = draft && def ? def.resolutions[0] : b.resolution
  const duration = draft && def
    ? (def.durations.includes(b.duration ?? -1) ? b.duration : def.durations[0])
    : b.duration

  let falModel: string
  let input: Record<string, unknown>
  if (def) {
    falModel = startUrl && def.i2vId ? def.i2vId : def.id
    const params: FalVideoParams = { prompt: prompt ?? '', startUrl, endUrl, aspect, duration, resolution, audio }
    input = def.buildInput(params)
  } else {
    // Unknown / pasted custom id: run it verbatim with a generic input.
    falModel = chosenId || FAL_VIDEO_MODELS[0].id
    input = {}
    if (prompt?.trim()) input.prompt = prompt
    if (startUrl)   input.image_url = startUrl
    if (endUrl)     input.end_image_url = endUrl
    if (aspect)     input.aspect_ratio = aspect
    if (duration)   input.duration = String(duration)
    if (resolution) input.resolution = resolution
    if (audio)      input.generate_audio = true
  }

  const svc = await createServiceClient()

  // 1) Insert the durable job BEFORE submitting, so nothing is lost.
  const costEst = def ? estVideoCost(def, duration ?? 0, audio) : 0
  const { data: job } = await svc.from('mkt_video_jobs').insert({
    model: falModel, model_label: def?.label ?? falModel, prompt: prompt ?? '',
    is_draft: draft, aspect: aspect ?? '16:9', duration: duration ?? null,
    resolution: resolution ?? null, audio, status: 'pending', cost_est: costEst,
  }).select('id').single()
  const jobId: string | undefined = job?.id

  // 2) Submit, auto-retrying the duration encoding (number / "N" / "Ns") on a
  //    duration validation error so any model self-corrects.
  const durationEncodings: unknown[] = duration
    ? [input.duration, duration, String(duration), `${duration}s`].filter((v, i, a) => a.indexOf(v) === i)
    : [input.duration]
  let sub: { request_id?: string; model?: string; status_url?: string; response_url?: string; error?: string } = {}
  let subStatus = 502
  for (const enc of durationEncodings) {
    const attempt = { ...input }
    if (duration) attempt.duration = enc
    const r = await fetch(falProxyUrl(), { method: 'POST', headers: authHeader(), body: JSON.stringify({ op: 'video.submit', model: falModel, input: attempt }) })
    subStatus = r.status
    sub = await r.json()
    if (r.ok && sub.request_id) break
    if (!/duration/i.test(sub.error ?? '')) break
  }
  if (!sub.request_id) {
    await captureNoUrl(svc, falModel, { raw: JSON.stringify({ error: sub.error, sent: input }) })
    if (jobId) await finishJob(svc, { id: jobId }, { status: 'failed', error: sub.error ?? 'submit failed' })
    return NextResponse.json({ error: sub.error ? `Video submit failed — ${sub.error}` : 'Video submit failed', jobId }, { status: subStatus || 502 })
  }
  const { request_id, model, status_url, response_url } = sub

  // 3) Reconcile the job with fal's tracking id (so any later poll can find it).
  if (jobId) await finishJob(svc, { id: jobId }, { status: 'processing', request_id, status_url, response_url })

  // 4) Poll up to ~100s using fal's own poll urls.
  const deadline = Date.now() + 100_000
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5_000))
    const stRes = await fetch(falProxyUrl(), { method: 'POST', headers: authHeader(), body: JSON.stringify({ op: 'video.status', request_id, model, status_url }) })
    const st = await stRes.json()
    if (st.status === 'COMPLETED') {
      const resRes = await fetch(falProxyUrl(), { method: 'POST', headers: authHeader(), body: JSON.stringify({ op: 'video.result', request_id, model, response_url }) })
      const result = await resRes.json()
      if (!result.video_url) {
        await captureNoUrl(svc, model, result)
        if (jobId) await finishJob(svc, { id: jobId }, { status: 'failed', error: result.error ?? 'no url' })
        return NextResponse.json({ error: result.error ? `Video generation failed — ${result.error}` : `Video completed but no URL returned${result.raw ? ` — fal shape: ${result.raw}` : ''}`, jobId }, { status: 502 })
      }
      const url = await rehost(svc, result.video_url)
      await svc.rpc('track_api_call', { p_api_name: 'fal.ai' }).then(() => {}, () => {})
      await svc.from('ai_call_log').insert({ call_type: 'fal-video', model: model ?? 'fal-video', success: true, from_cache: false })
      if (jobId) await finishJob(svc, { id: jobId }, { status: 'completed', video_url: url })
      return NextResponse.json({ url, model, jobId })
    }
    if (st.status === 'FAILED' || st.error) {
      if (jobId) await finishJob(svc, { id: jobId }, { status: 'failed', error: st.error ?? 'generation failed' })
      return NextResponse.json({ error: st.error ?? 'Video generation failed', jobId }, { status: 502 })
    }
  }

  // Still processing — the job row is durable; client (or the jobs panel) re-polls.
  return NextResponse.json({ request_id, model, status_url, response_url, processing: true, jobId })
}

// GET ?request_id=&model=&status_url=&response_url= → poll an in-flight job; re-host
// + return { url } when done, updating the durable job row.
export async function GET(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const request_id = searchParams.get('request_id')
  const model = searchParams.get('model') ?? undefined
  const status_url = searchParams.get('status_url') ?? undefined
  const response_url = searchParams.get('response_url') ?? undefined
  if (!request_id) return NextResponse.json({ error: 'request_id required' }, { status: 400 })

  const svc = await createServiceClient()
  const stRes = await fetch(falProxyUrl(), { method: 'POST', headers: authHeader(), body: JSON.stringify({ op: 'video.status', request_id, model, status_url }) })
  const st = await stRes.json()
  if (st.status !== 'COMPLETED') {
    if (st.status === 'FAILED' || st.error) {
      await finishJob(svc, { request_id }, { status: 'failed', error: st.error ?? 'generation failed' })
      return NextResponse.json({ error: st.error ?? 'Video generation failed' }, { status: 502 })
    }
    return NextResponse.json({ processing: true, status: st.status, request_id, model, status_url, response_url })
  }
  const resRes = await fetch(falProxyUrl(), { method: 'POST', headers: authHeader(), body: JSON.stringify({ op: 'video.result', request_id, model, response_url }) })
  const result = await resRes.json()
  if (!result.video_url) {
    await captureNoUrl(svc, model, result)
    await finishJob(svc, { request_id }, { status: 'failed', error: result.error ?? 'no url' })
    return NextResponse.json({ error: result.error ? `Video generation failed — ${result.error}` : `Video completed but no URL returned${result.raw ? ` — fal shape: ${result.raw}` : ''}` }, { status: 502 })
  }
  const url = await rehost(svc, result.video_url)
  await svc.from('ai_call_log').insert({ call_type: 'fal-video', model: model ?? 'fal-video', success: true, from_cache: false })
  await finishJob(svc, { request_id }, { status: 'completed', video_url: url })
  return NextResponse.json({ url, model })
}
