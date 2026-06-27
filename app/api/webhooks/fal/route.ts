import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyFalWebhook } from '@/lib/falWebhook'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'   // Ed25519 verification needs the Node crypto module

const BUCKET = 'marketing-media'

// Recursively find a video URL in fal's payload (shapes vary across models).
function findVideoUrl(v: unknown, depth = 0): string | undefined {
  if (v == null || depth > 6) return undefined
  if (typeof v === 'string') return /^https?:\/\/\S+\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(v) ? v : undefined
  if (Array.isArray(v)) { for (const x of v) { const u = findVideoUrl(x, depth + 1); if (u) return u } return undefined }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    for (const k of ['video', 'videos', 'output', 'result', 'file', 'files', 'payload']) {
      if (k in o) { const u = findVideoUrl(o[k], depth + 1); if (u) return u }
    }
    for (const val of Object.values(o)) { const u = findVideoUrl(val, depth + 1); if (u) return u }
  }
  return undefined
}

async function rehost(svc: Awaited<ReturnType<typeof createServiceClient>>, url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`fetch video ${res.status}`)
  const bytes = await res.arrayBuffer()
  const path = `video/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`
  const up = await svc.storage.from(BUCKET).upload(path, bytes, { contentType: 'video/mp4', upsert: false })
  if (up.error) throw new Error(`Storage upload failed: ${up.error.message}`)
  return svc.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

// fal POSTs here when a queued render finishes. Public + UNAUTHENTICATED by design —
// trust is established by verifying fal's Ed25519 signature over the raw body.
export async function POST(req: Request) {
  const rawBody = await req.text()
  const v = await verifyFalWebhook({
    requestId:    req.headers.get('x-fal-webhook-request-id'),
    userId:       req.headers.get('x-fal-webhook-user-id'),
    timestamp:    req.headers.get('x-fal-webhook-timestamp'),
    signatureHex: req.headers.get('x-fal-webhook-signature'),
  }, rawBody)

  if (!v.valid) return NextResponse.json({ error: `Invalid signature: ${v.reason}` }, { status: 401 })

  let body: { request_id?: string; status?: string; payload?: unknown; error?: unknown } = {}
  try { body = JSON.parse(rawBody) } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }
  const requestId = body.request_id ?? v.requestId
  if (!requestId) return NextResponse.json({ error: 'no request_id' }, { status: 400 })

  const svc = await createServiceClient()
  // Idempotent: ignore if this job is already resolved (poll may have won the race).
  const { data: job } = await svc.from('mkt_video_jobs').select('id, status').eq('request_id', requestId).maybeSingle()
  if (job && (job.status === 'completed' || job.status === 'failed')) {
    return NextResponse.json({ ok: true, already: job.status })
  }

  const upd = (p: Record<string, unknown>) =>
    svc.from('mkt_video_jobs').update({ ...p, updated_at: new Date().toISOString() }).eq('request_id', requestId)

  if (body.status === 'ERROR' || (!body.payload && body.error)) {
    const err = typeof body.error === 'string' ? body.error : JSON.stringify(body.error ?? 'fal error').slice(0, 500)
    await upd({ status: 'failed', error: err })
    return NextResponse.json({ ok: true, status: 'failed' })
  }

  const videoUrl = findVideoUrl(body.payload ?? body)
  if (!videoUrl) {
    await upd({ status: 'failed', error: 'webhook had no video url' })
    return NextResponse.json({ ok: true, status: 'failed', note: 'no url' })
  }

  try {
    const stored = await rehost(svc, videoUrl)
    await upd({ status: 'completed', video_url: stored })
    await svc.from('ai_call_log').insert({ call_type: 'fal-video', model: job ? undefined : 'fal-video', success: true, from_cache: false }).then(() => {}, () => {})
    return NextResponse.json({ ok: true, status: 'completed' })
  } catch (e) {
    await upd({ status: 'failed', error: (e as Error).message })
    return NextResponse.json({ ok: true, status: 'failed', note: 'rehost failed' })
  }
}
