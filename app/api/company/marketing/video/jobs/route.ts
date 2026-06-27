import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// GET → recent durable video jobs (admin). Powers the "Recent renders" panel so a
// billed render is visible/recoverable even after a reload or navigation.
export async function GET() {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const svc = await createServiceClient()
  const { data, error } = await svc
    .from('mkt_video_jobs')
    .select('id, model, model_label, request_id, status_url, response_url, prompt, is_draft, status, video_url, cost_est, error, created_at')
    .order('created_at', { ascending: false })
    .limit(24)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ jobs: data ?? [] })
}
