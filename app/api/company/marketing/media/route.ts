import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Map our Ideogram-style aspect ratios to OpenAI image sizes (gpt-image-1).
function openaiSize(aspect: string | undefined): string {
  switch (aspect) {
    case 'ASPECT_16_9': case 'ASPECT_16_10': return '1536x1024'
    case 'ASPECT_9_16': case 'ASPECT_10_16': return '1024x1536'
    default: return '1024x1024'
  }
}

export async function POST(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { prompt, style, aspect_ratio, provider = 'ideogram' } = await req.json()
  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
  }

  const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 })
  }

  // ── OpenAI image path (gpt-image-1) ─────────────────────────────────────────
  if (provider === 'openai') {
    const res = await fetch(`${supabaseUrl}/functions/v1/openai-image-proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceRoleKey}` },
      body: JSON.stringify({ prompt, model: 'gpt-image-1', size: openaiSize(aspect_ratio) }),
      signal: AbortSignal.timeout(60_000),
    })
    const data = await res.json()
    const svc = await createServiceClient()

    if (!res.ok || data.error) {
      await svc.from('ai_call_log').insert({ call_type: 'openai-image', model: 'gpt-image-1', success: false, from_cache: false, error_message: (data.error?.message ?? data.error ?? `status ${res.status}`)?.toString().slice(0, 300) })
      return NextResponse.json({ error: data.error?.message ?? data.error ?? 'OpenAI image generation failed' }, { status: res.status || 502 })
    }

    const item = data.data?.[0] ?? {}
    let url: string | undefined = item.url

    // gpt-image-1 returns base64 — re-host into Storage so the gallery can save it.
    if (!url && item.b64_json) {
      const bytes = Uint8Array.from(atob(item.b64_json), c => c.charCodeAt(0))
      const path = `openai/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`
      const up = await svc.storage.from('marketing-media').upload(path, bytes, { contentType: 'image/png', upsert: false })
      if (up.error) {
        return NextResponse.json({ error: `Storage upload failed: ${up.error.message}` }, { status: 500 })
      }
      url = svc.storage.from('marketing-media').getPublicUrl(path).data.publicUrl
    }

    if (!url) return NextResponse.json({ error: 'OpenAI returned no image' }, { status: 502 })

    // Track for API Health (calls + logged as an OpenAI image generation).
    await svc.rpc('track_api_call', { p_api_name: 'OpenAI Image' }).then(() => {}, () => {})
    await svc.from('ai_call_log').insert({ call_type: 'openai-image', model: 'gpt-image-1', success: true, from_cache: false })

    return NextResponse.json({ url, seed: null, provider: 'openai' })
  }

  // ── Ideogram path (default) ─────────────────────────────────────────────────
  const res = await fetch(`${supabaseUrl}/functions/v1/ideogram-proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceRoleKey}` },
    body: JSON.stringify({ prompt, style, aspect_ratio }),
    signal: AbortSignal.timeout(60_000),
  })
  const data = await res.json()
  if (!res.ok) {
    return NextResponse.json({ error: data.error ?? 'Image generation failed' }, { status: res.status })
  }
  // Track Ideogram call for API Health (spend still derived from saved assets).
  const svc = await createServiceClient()
  await svc.rpc('track_api_call', { p_api_name: 'Ideogram V_2' }).then(() => {}, () => {})

  return NextResponse.json({ url: data.url, seed: data.seed, provider: 'ideogram' })
}
