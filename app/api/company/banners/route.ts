import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Admin CRUD for the home carousel banners. Reads/writes via the service client
// (bypasses RLS); all methods are admin-gated.
export async function GET() {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = await createServiceClient()
  const { data, error } = await service
    .from('promo_banners')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ banners: data ?? [] })
}

// PUT — create (no id) or update (with id) a single banner.
export async function PUT(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const b = await req.json().catch(() => ({}))
  const fields = {
    image_url:  String(b.image_url ?? ''),
    headline:   String(b.headline ?? ''),
    subtext:    String(b.subtext ?? ''),
    cta_label:  String(b.cta_label ?? ''),
    cta_href:   String(b.cta_href ?? '/player'),
    sort_order: Number.isFinite(b.sort_order) ? Number(b.sort_order) : 0,
    is_active:  b.is_active !== false,
    updated_at: new Date().toISOString(),
  }

  const service = await createServiceClient()
  const query = b.id
    ? service.from('promo_banners').update(fields).eq('id', b.id).select().single()
    : service.from('promo_banners').insert(fields).select().single()

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ banner: data })
}

export async function DELETE(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const service = await createServiceClient()
  const { error } = await service.from('promo_banners').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
