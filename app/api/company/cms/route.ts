import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const SLUGS = new Set(['about', 'privacy', 'terms', 'support', 'rewards'])

// GET — list all CMS pages (admin console). PUT — upsert one page's title/body/
// publish state. Admin-gated; writes use the service client (bypasses RLS).
export async function GET() {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = await createServiceClient()
  const { data, error } = await service
    .from('cms_pages')
    .select('slug, title, body, is_published, updated_at')
    .order('slug')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pages: data ?? [] })
}

export async function PUT(req: Request) {
  const { user, role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { slug, title, body: pageBody, is_published } = body
  if (!slug || !SLUGS.has(slug)) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })
  }

  const service = await createServiceClient()
  const { data, error } = await service
    .from('cms_pages')
    .update({
      title:        String(title ?? ''),
      body:         String(pageBody ?? ''),
      is_published: is_published !== false,
      updated_at:   new Date().toISOString(),
      updated_by:   user?.id ?? null,
    })
    .eq('slug', slug)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ page: data })
}
