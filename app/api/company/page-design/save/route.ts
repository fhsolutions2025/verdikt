import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { getSlot } from '@/lib/pageAssets'
import { checkPrompt } from '@/lib/promptGuard'

export const dynamic = 'force-dynamic'

const BUCKET = 'marketing-media'

function validSlotKey(key: string): boolean {
  if (getSlot(key)) return true
  // Per-market override: market:<uuid>
  return /^market:[0-9a-f-]{36}$/i.test(key)
}

// Persist a generated page asset under a slot_key: re-host the temporary Ideogram
// image into Storage, deactivate the slot's previous active asset (history kept),
// then insert the new active row.
export async function POST(req: Request) {
  const { user, role } = await getAuthContext()
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const {
    slot_key, url, prompt, alt_text, seo_tags,
    width, height, aspect_ratio, seed, cost_usd,
  } = body

  if (!slot_key || !validSlotKey(slot_key)) {
    return NextResponse.json({ error: 'Invalid slot_key' }, { status: 400 })
  }
  if (!url) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }
  if (!alt_text?.trim()) {
    return NextResponse.json({ error: 'alt_text is required (accessibility & SEO)' }, { status: 400 })
  }
  // Defence in depth — re-check the prompt that produced this image.
  const guard = checkPrompt(prompt ?? '')
  if (!guard.ok) {
    return NextResponse.json({ error: guard.reason }, { status: 422 })
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
  const safeSlot = slot_key.replace(/[^a-z0-9_-]/gi, '_')
  const path = `page/${safeSlot}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const { error: uploadErr } = await service.storage
    .from(BUCKET)
    .upload(path, imageBytes, { contentType, upsert: false })
  if (uploadErr) {
    return NextResponse.json({ error: `Storage upload failed: ${uploadErr.message}` }, { status: 500 })
  }

  const { data: pub } = service.storage.from(BUCKET).getPublicUrl(path)

  // Deactivate the slot's current active asset (keeps history) before inserting.
  const { error: deactivateErr } = await service
    .from('page_assets')
    .update({ is_active: false })
    .eq('slot_key', slot_key)
    .eq('is_active', true)
  if (deactivateErr) {
    return NextResponse.json({ error: deactivateErr.message }, { status: 500 })
  }

  const tags: string[] = Array.isArray(seo_tags)
    ? seo_tags
    : typeof seo_tags === 'string'
      ? seo_tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : []

  const { data: row, error: insertErr } = await service
    .from('page_assets')
    .insert({
      slot_key,
      is_active:    true,
      public_url:   pub.publicUrl,
      storage_path: path,
      width:        width ?? null,
      height:       height ?? null,
      aspect_ratio: aspect_ratio ?? null,
      prompt:       prompt ?? null,
      alt_text:     alt_text,
      seo_tags:     tags,
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
