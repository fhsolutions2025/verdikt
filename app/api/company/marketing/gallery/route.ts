import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const BUCKET = 'marketing-media'

// ── List / search gallery ──────────────────────────────────────────────────────
export async function GET(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const search = (searchParams.get('search') ?? '').trim()
  const tag    = (searchParams.get('tag') ?? '').trim()

  const service = await createServiceClient()
  let query = service
    .from('marketing_assets')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (tag)    query = query.eq('campaign_tag', tag)
  if (search) query = query.or(`title.ilike.%${search}%,prompt.ilike.%${search}%,alt_text.ilike.%${search}%`)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Distinct campaign tags for the filter chips
  const { data: tagRows } = await service
    .from('marketing_assets')
    .select('campaign_tag')
    .neq('campaign_tag', '')
  const tags = Array.from(new Set((tagRows ?? []).map(r => r.campaign_tag))).sort()

  // Lifetime aggregate spend across ALL assets (ignores filters)
  const { data: costRows } = await service
    .from('marketing_assets')
    .select('cost_usd')
  const totalCount = costRows?.length ?? 0
  const totalSpend = (costRows ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0)

  return NextResponse.json({ assets: data ?? [], tags, totalCount, totalSpend })
}

// ── Save to gallery (persist Ideogram image to Storage) ─────────────────────────
export async function POST(req: Request) {
  const { user, role } = await getAuthContext()
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const {
    url, title, alt_text, keywords, platform, dimensions,
    aspect_ratio, style, prompt, campaign_tag, seed, cost_usd,
  } = body

  if (!url) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }

  const service = await createServiceClient()

  // Ideogram URLs are temporary — fetch the bytes and re-host in Storage.
  let imageBytes: ArrayBuffer
  let contentType = 'image/png'
  try {
    const imgRes = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!imgRes.ok) throw new Error(`fetch ${imgRes.status}`)
    contentType = imgRes.headers.get('content-type') ?? 'image/png'
    imageBytes  = await imgRes.arrayBuffer()
  } catch (e) {
    return NextResponse.json({ error: `Failed to fetch source image: ${(e as Error).message}` }, { status: 502 })
  }

  const ext  = contentType.includes('jpeg') ? 'jpg' : contentType.includes('webp') ? 'webp' : 'png'
  const path = `${platform || 'asset'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const { error: uploadErr } = await service.storage
    .from(BUCKET)
    .upload(path, imageBytes, { contentType, upsert: false })

  if (uploadErr) {
    return NextResponse.json({ error: `Storage upload failed: ${uploadErr.message}` }, { status: 500 })
  }

  const { data: pub } = service.storage.from(BUCKET).getPublicUrl(path)

  const { data: row, error: insertErr } = await service
    .from('marketing_assets')
    .insert({
      storage_path: path,
      public_url:   pub.publicUrl,
      title:        title ?? '',
      alt_text:     alt_text ?? '',
      keywords:     keywords ?? [],
      platform:     platform ?? '',
      dimensions:   dimensions ?? '',
      aspect_ratio: aspect_ratio ?? '',
      style:        style ?? '',
      prompt:       prompt ?? '',
      campaign_tag: campaign_tag ?? '',
      seed:         seed ?? null,
      cost_usd:     cost_usd ?? 0.08,
      created_by:   user?.id ?? null,
    })
    .select()
    .single()

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({ asset: row })
}
