import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Trigger BYV normalization immediately after a player submission so the
// market doesn't sit in pending_ai until the 2-minute cron fires.
// Fire-and-forget from the client; returns immediately.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key     = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!baseUrl || !key) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  // Kick off normalization — don't block the response on it finishing.
  fetch(`${baseUrl}/functions/v1/normalize-byv-market`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body:   '{}',
    signal: AbortSignal.timeout(55_000),
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
