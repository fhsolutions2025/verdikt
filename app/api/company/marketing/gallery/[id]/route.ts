import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const BUCKET = 'marketing-media'

// ── Delete a gallery asset (removes Storage object + row) ───────────────────────
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { role } = await getAuthContext()
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id }  = await params
  const service = await createServiceClient()

  const { data: asset } = await service
    .from('marketing_assets')
    .select('storage_path')
    .eq('id', id)
    .single()

  if (asset?.storage_path) {
    await service.storage.from(BUCKET).remove([asset.storage_path])
  }

  const { error } = await service.from('marketing_assets').delete().eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// ── Update campaign tag ─────────────────────────────────────────────────────────
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { role } = await getAuthContext()
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id }  = await params
  const { campaign_tag } = await req.json()
  const service = await createServiceClient()

  const { error } = await service
    .from('marketing_assets')
    .update({ campaign_tag: campaign_tag ?? '' })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
