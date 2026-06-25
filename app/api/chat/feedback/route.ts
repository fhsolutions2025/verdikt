import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const messageId = String(body.message_id ?? '')
  const rating    = Number(body.rating)

  if (!messageId) return NextResponse.json({ error: 'Missing message_id' }, { status: 400 })
  if (rating !== 1 && rating !== -1) return NextResponse.json({ error: 'Rating must be 1 or -1' }, { status: 400 })

  const service = await createServiceClient()

  // Verify the message belongs to this user
  const { data: msg } = await service
    .from('chat_messages')
    .select('id, user_id')
    .eq('id', messageId)
    .single()

  if (!msg || msg.user_id !== user.id) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  }

  // Upsert feedback (one rating per message)
  const { error } = await service.from('agent_feedback').upsert({
    message_id: messageId,
    user_id:    user.id,
    rating,
    comment:    String(body.comment ?? '').slice(0, 500) || null,
  }, { onConflict: 'message_id,user_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
