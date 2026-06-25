import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { prompt, style, aspect_ratio } = await req.json()
  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
  }

  const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 })
  }

  const proxyUrl = `${supabaseUrl}/functions/v1/ideogram-proxy`
  const res = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ prompt, style, aspect_ratio }),
    signal: AbortSignal.timeout(60_000),
  })

  const data = await res.json()

  if (!res.ok) {
    return NextResponse.json({ error: data.error ?? 'Image generation failed' }, { status: res.status })
  }

  return NextResponse.json({ url: data.url, seed: data.seed })
}
