import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { checkPrompt } from '@/lib/promptGuard'

export const dynamic = 'force-dynamic'

// Per-day generation cap (cost guard — $0.08/image).
const DAILY_CAP = 60

// Generate a page asset via Ideogram. Mirrors the marketing media route but adds
// the banned-terms guard (product imagery must stay generic/abstract) and a
// per-day cap. Returns a temporary Ideogram URL; persist it with /save.
export async function POST(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { prompt, style = 'DESIGN', aspect_ratio } = await req.json()
  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
  }

  const guard = checkPrompt(prompt)
  if (!guard.ok) {
    return NextResponse.json({ error: guard.reason }, { status: 422 })
  }

  const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 503 })
  }

  // Soft per-day cap based on assets saved today.
  const service   = await createServiceClient()
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
  const { count } = await service
    .from('page_assets')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', startOfDay.toISOString())
  if ((count ?? 0) >= DAILY_CAP) {
    return NextResponse.json({ error: `Daily generation cap (${DAILY_CAP}) reached.` }, { status: 429 })
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/ideogram-proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
    body: JSON.stringify({ prompt, style, aspect_ratio }),
    signal: AbortSignal.timeout(60_000),
  })
  const data = await res.json()
  if (!res.ok) {
    return NextResponse.json({ error: data.error ?? 'Image generation failed' }, { status: res.status })
  }

  return NextResponse.json({ url: data.url, seed: data.seed })
}
