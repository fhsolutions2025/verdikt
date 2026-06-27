import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { getFalVideoModel, type FalVideoParams } from '@/lib/falVideoModels'

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

// Re-host a completed fal video into Storage and return its public URL.
async function rehost(videoUrl: string): Promise<string> {
  const svc = await createServiceClient()
  const res = await fetch(videoUrl, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`fetch video ${res.status}`)
  const bytes = await res.arrayBuffer()
  const path = `video/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`
  const up = await svc.storage.from(BUCKET).upload(path, bytes, { contentType: 'video/mp4', upsert: false })
  if (up.error) throw new Error(`Storage upload failed: ${up.error.message}`)
  return svc.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

// POST { modelId, prompt, startUrl?, endUrl?, aspect?, duration?, resolution?, audio? }
// → resolve the model from the registry, build its fal input, submit, poll ~100s;
// returns { url } when done or { request_id, model } if still processing.
export async function POST(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { modelId, prompt, startUrl, endUrl, aspect, duration, resolution, audio } = body as {
    modelId?: string; prompt?: string; startUrl?: string; endUrl?: string;
    aspect?: string; duration?: number; resolution?: string; audio?: boolean
  }
  if (!prompt?.trim() && !startUrl) return NextResponse.json({ error: 'Prompt or a start frame is required' }, { status: 400 })
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 })
  }

  const def = getFalVideoModel(modelId ?? '') ?? getFalVideoModel('fal-ai/ltx-video')!
  // Use the image-to-video endpoint when a start frame is supplied.
  const falModel = startUrl && def.i2vId ? def.i2vId : def.id
  const params: FalVideoParams = { prompt: prompt ?? '', startUrl, endUrl, aspect, duration, resolution, audio }
  const input = def.buildInput(params)

  // Submit.
  const subRes = await fetch(falProxyUrl(), { method: 'POST', headers: authHeader(), body: JSON.stringify({ op: 'video.submit', model: falModel, input }) })
  const sub = await subRes.json()
  if (!subRes.ok || !sub.request_id) {
    return NextResponse.json({ error: sub.error ?? 'Video submit failed' }, { status: subRes.status || 502 })
  }
  const { request_id, model } = sub

  // Poll up to ~100s.
  const deadline = Date.now() + 100_000
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5_000))
    const stRes = await fetch(falProxyUrl(), { method: 'POST', headers: authHeader(), body: JSON.stringify({ op: 'video.status', request_id, model }) })
    const st = await stRes.json()
    if (st.status === 'COMPLETED') {
      const resRes = await fetch(falProxyUrl(), { method: 'POST', headers: authHeader(), body: JSON.stringify({ op: 'video.result', request_id, model }) })
      const result = await resRes.json()
      if (!result.video_url) return NextResponse.json({ error: 'Video completed but no URL returned' }, { status: 502 })
      const url = await rehost(result.video_url)
      const svc = await createServiceClient()
      await svc.rpc('track_api_call', { p_api_name: 'fal.ai' }).then(() => {}, () => {})
      await svc.from('ai_call_log').insert({ call_type: 'fal-video', model: model ?? 'fal-ai/ltx-video', success: true, from_cache: false })
      return NextResponse.json({ url, model })
    }
    if (st.status === 'FAILED' || st.error) {
      return NextResponse.json({ error: st.error ?? 'Video generation failed' }, { status: 502 })
    }
  }

  // Still processing — hand the request_id back for the client to re-poll.
  return NextResponse.json({ request_id, model, processing: true })
}

// GET ?request_id=&model= → poll an in-flight job; re-host + return { url } when done.
export async function GET(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const request_id = searchParams.get('request_id')
  const model = searchParams.get('model') ?? undefined
  if (!request_id) return NextResponse.json({ error: 'request_id required' }, { status: 400 })

  const stRes = await fetch(falProxyUrl(), { method: 'POST', headers: authHeader(), body: JSON.stringify({ op: 'video.status', request_id, model }) })
  const st = await stRes.json()
  if (st.status !== 'COMPLETED') {
    if (st.status === 'FAILED' || st.error) return NextResponse.json({ error: st.error ?? 'Video generation failed' }, { status: 502 })
    return NextResponse.json({ processing: true, status: st.status })
  }
  const resRes = await fetch(falProxyUrl(), { method: 'POST', headers: authHeader(), body: JSON.stringify({ op: 'video.result', request_id, model }) })
  const result = await resRes.json()
  if (!result.video_url) return NextResponse.json({ error: 'Video completed but no URL returned' }, { status: 502 })
  const url = await rehost(result.video_url)
  const svc = await createServiceClient()
  await svc.from('ai_call_log').insert({ call_type: 'fal-video', model: model ?? 'fal-ai/ltx-video', success: true, from_cache: false })
  return NextResponse.json({ url, model })
}
