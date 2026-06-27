import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface BrandColor { name: string; hex: string }
interface BrandKitDTO {
  colors: BrandColor[]
  tone: string
  visualStyle: string
  logoDescription: string
  autoInject: boolean
  logoUrl: string | null
}

type Row = {
  colors: BrandColor[] | null; tone: string | null; visual_style: string | null
  logo_description: string | null; auto_inject: boolean | null; logo_url: string | null
}
function toDTO(r: Row): BrandKitDTO {
  return {
    colors: Array.isArray(r.colors) ? r.colors : [],
    tone: r.tone ?? '', visualStyle: r.visual_style ?? '',
    logoDescription: r.logo_description ?? '', autoInject: r.auto_inject ?? true,
    logoUrl: r.logo_url ?? null,
  }
}

// GET → the single brand_settings row (admin).
export async function GET() {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const svc = await createServiceClient()
  const { data, error } = await svc.from('brand_settings').select('*').eq('id', 'default').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ brand: data ? toDTO(data as Row) : null })
}

// PUT → upsert the brand kit (colors/voice/style/description/auto-inject).
// logo_url is managed by the /brand/logo route, so it's not overwritten here.
export async function PUT(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as Partial<BrandKitDTO>
  const svc = await createServiceClient()
  const { error } = await svc.from('brand_settings').update({
    colors: b.colors ?? [], tone: b.tone ?? '', visual_style: b.visualStyle ?? '',
    logo_description: b.logoDescription ?? '', auto_inject: b.autoInject ?? true,
    updated_at: new Date().toISOString(),
  }).eq('id', 'default')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
