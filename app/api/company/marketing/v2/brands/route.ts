import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// GET /api/company/marketing/v2/brands — list brands
export async function GET() {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const svc = await createServiceClient()
  const { data, error } = await svc.from('mkt_brands').select('*').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

// POST /api/company/marketing/v2/brands — create a brand
export async function POST(req: Request) {
  const { user, role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { name, voice, brand_kit, regions, competitors } = body
  if (!name?.trim()) return NextResponse.json({ error: 'name is required', code: 'needs_input' }, { status: 400 })
  if (!Array.isArray(regions) || regions.length === 0) {
    return NextResponse.json({ error: 'at least one region is required', code: 'needs_input', details: { needs: ['regions'] } }, { status: 400 })
  }

  const svc = await createServiceClient()
  const { data, error } = await svc.from('mkt_brands').insert({
    name, voice: voice ?? {}, brand_kit: brand_kit ?? {}, regions,
    competitors: competitors ?? [], status: 'active', created_by: user?.id ?? null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Seed a brand-voice memory record.
  await svc.from('mkt_memory').insert({
    brand_id: data.id, namespace: 'brand', key: 'voice', value: voice ?? {}, confidence: 0.95, source: 'operator',
  })

  return NextResponse.json({ brand: data }, { status: 201 })
}
