import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { ingestDocument } from '@/lib/marketing/knowledge'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// GET /api/company/marketing/v2/knowledge?brand_id=  → documents for a brand
export async function GET(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const brandId = new URL(req.url).searchParams.get('brand_id')
  if (!brandId) return NextResponse.json({ error: 'brand_id is required' }, { status: 400 })

  const svc = await createServiceClient()
  const { data } = await svc.from('mkt_knowledge_documents')
    .select('id,title,source,url,status,chunk_count,error,created_at')
    .eq('brand_id', brandId).order('created_at', { ascending: false })
  return NextResponse.json({ documents: data ?? [] })
}

// POST /api/company/marketing/v2/knowledge  { brand_id, title, text, source?, url? }
// Ingests a text document: chunk → embed → store. Text is extracted client-side for
// .txt/.md/.csv (no server-side parser dependency).
export async function POST(req: Request) {
  const { user, role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { brand_id, title, text, source, url } = await req.json().catch(() => ({})) as
    { brand_id?: string; title?: string; text?: string; source?: string; url?: string }
  if (!brand_id) return NextResponse.json({ error: 'brand_id is required' }, { status: 400 })
  if (!text || !text.trim()) return NextResponse.json({ error: 'text is required' }, { status: 400 })

  const svc = await createServiceClient()
  try {
    const result = await ingestDocument(svc, {
      brandId: brand_id, title: title?.trim() || 'Untitled document', text,
      source: source || 'paste', url, bytes: text.length, createdBy: user?.id ?? null,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

// DELETE /api/company/marketing/v2/knowledge?id=  → remove a document (+ its chunks)
export async function DELETE(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const svc = await createServiceClient()
  const { error } = await svc.from('mkt_knowledge_documents').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
