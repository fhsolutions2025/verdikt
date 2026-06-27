import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { checkPrompt } from '@/lib/promptGuard'

export const dynamic = 'force-dynamic'

const BUCKET = 'marketing-media'

// Generate a carousel banner image via Ideogram and re-host it into Storage,
// returning the public URL (the client then saves it onto a promo_banners row).
// Mirrors app/api/company/page-design/{generate,save}: admin-gated, banned-terms
// guard, 16:9 wide art for the 3:1 banner box.
export async function POST(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { prompt, url: srcUrl } = await req.json().catch(() => ({}))
  // Two modes: re-host an already-generated image (srcUrl), or generate from a prompt.
  if (!srcUrl && !prompt?.trim()) {
    return NextResponse.json({ error: 'Provide a prompt or a url' }, { status: 400 })
  }
  if (prompt) {
    const guard = checkPrompt(prompt)
    if (!guard.ok) return NextResponse.json({ error: guard.reason }, { status: 422 })
  }

  const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 })
  }

  // 1) Resolve the source image URL — either generate one, or use the supplied
  //    (already-generated, e.g. Media Studio) temporary URL to just re-host.
  let sourceUrl = srcUrl as string | undefined
  if (!sourceUrl) {
    const genRes = await fetch(`${supabaseUrl}/functions/v1/ideogram-proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
      body: JSON.stringify({ prompt, style: 'DESIGN', aspect_ratio: 'ASPECT_16_9' }),
      signal: AbortSignal.timeout(60_000),
    })
    const gen = await genRes.json()
    if (!genRes.ok || !gen.url) {
      return NextResponse.json({ error: gen.error ?? 'Image generation failed' }, { status: genRes.status || 502 })
    }
    sourceUrl = gen.url
  }

  // 2) Re-host the temporary image into Storage.
  const service = await createServiceClient()
  let bytes: ArrayBuffer
  let contentType = 'image/png'
  try {
    const imgRes = await fetch(sourceUrl!, { signal: AbortSignal.timeout(30_000) })
    if (!imgRes.ok) throw new Error(`fetch ${imgRes.status}`)
    contentType = imgRes.headers.get('content-type') ?? 'image/png'
    bytes = await imgRes.arrayBuffer()
  } catch (e) {
    return NextResponse.json({ error: `Failed to fetch source image: ${(e as Error).message}` }, { status: 502 })
  }

  const ext  = contentType.includes('jpeg') ? 'jpg' : contentType.includes('webp') ? 'webp' : 'png'
  const path = `banners/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const { error: upErr } = await service.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false })
  if (upErr) return NextResponse.json({ error: `Storage upload failed: ${upErr.message}` }, { status: 500 })

  const { data: pub } = service.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ url: pub.publicUrl })
}
