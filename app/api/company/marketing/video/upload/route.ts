import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const BUCKET = 'marketing-media'
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB

// Upload a start/end frame image for image-to-video. Returns its public URL.
export async function POST(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'file is required' }, { status: 400 })
  if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'Only image frames are supported' }, { status: 415 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Frame too large (max 5 MB)' }, { status: 413 })

  const svc = await createServiceClient()
  const ext = file.type.includes('jpeg') ? 'jpg' : file.type.includes('webp') ? 'webp' : 'png'
  const path = `frames/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const up = await svc.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false })
  if (up.error) return NextResponse.json({ error: `Storage upload failed: ${up.error.message}` }, { status: 500 })

  const url = svc.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  return NextResponse.json({ url })
}
