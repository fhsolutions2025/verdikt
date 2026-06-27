import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const BUCKET = 'marketing-media'
const ALLOWED = new Set(['fal-ai/flux-pro/v1.1', 'fal-ai/flux-pro/v1.1-ultra'])

function falProxyUrl() {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/functions/v1/fal-proxy`
}
function svcAuth() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}` }
}

// POST { prompt, model } → generate the logo (synchronous FLUX image) → { url }.
// fal images are sync; if the call hangs the 90s proxy timeout surfaces an error.
export async function POST(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { prompt, model } = await req.json().catch(() => ({})) as { prompt?: string; model?: string }
  if (!prompt?.trim()) return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
  const falModel = ALLOWED.has(model ?? '') ? model! : 'fal-ai/flux-pro/v1.1'

  const res = await fetch(falProxyUrl(), {
    method: 'POST', headers: svcAuth(),
    body: JSON.stringify({ op: 'image', model: falModel, prompt, image_size: 'square_hd' }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.url) {
    return NextResponse.json({ error: data.error ? `Logo generation failed — ${data.error}` : 'Logo generation failed' }, { status: res.status || 502 })
  }
  const svc = await createServiceClient()
  await svc.from('ai_call_log').insert({ call_type: 'fal-image', model: falModel, success: true, from_cache: false }).then(() => {}, () => {})
  return NextResponse.json({ url: data.url, model: falModel })
}

// PUT { url } → re-host the (temporary) fal image into Storage and persist it as the
// brand logo so it never expires. Returns the permanent public URL.
export async function PUT(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { url } = await req.json().catch(() => ({})) as { url?: string }
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 })

  const svc = await createServiceClient()
  let bytes: ArrayBuffer, contentType = 'image/png'
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!r.ok) throw new Error(`fetch ${r.status}`)
    contentType = r.headers.get('content-type') ?? 'image/png'
    bytes = await r.arrayBuffer()
  } catch (e) {
    return NextResponse.json({ error: `Failed to fetch source image: ${(e as Error).message}` }, { status: 502 })
  }
  const ext = contentType.includes('jpeg') ? 'jpg' : contentType.includes('webp') ? 'webp' : 'png'
  const path = `brand/logo-${Date.now()}.${ext}`
  const up = await svc.storage.from(BUCKET).upload(path, new Uint8Array(bytes), { contentType, upsert: false })
  if (up.error) return NextResponse.json({ error: `Storage upload failed: ${up.error.message}` }, { status: 500 })
  const publicUrl = svc.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

  const { error } = await svc.from('brand_settings').update({ logo_url: publicUrl, updated_at: new Date().toISOString() }).eq('id', 'default')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ logo_url: publicUrl })
}
