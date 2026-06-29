import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { CHANNELS } from '@/lib/marketing/publishers'

export const dynamic = 'force-dynamic'

// GET — list every publishable channel with its connection status. The access token
// is never returned; only whether one is present.
export async function GET() {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const svc = await createServiceClient()
  const { data } = await svc.from('mkt_channel_connections').select('channel,account_id,status,connected_at,access_token')
  const byChannel = new Map((data ?? []).map(c => [c.channel as string, c]))
  const channels = CHANNELS.filter(c => c.requiresCredentials).map(c => {
    const conn = byChannel.get(c.channel)
    return {
      channel: c.channel, label: c.label,
      connected: !!conn && conn.status === 'connected' && !!conn.access_token,
      account_id: (conn?.account_id as string | null) ?? null,
      note: c.note ?? null,
    }
  })
  return NextResponse.json({ channels })
}

// PUT { channel, account_id, access_token } — connect / update a channel.
export async function PUT(req: Request) {
  const { user, role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { channel, account_id, access_token } = await req.json().catch(() => ({})) as
    { channel?: string; account_id?: string; access_token?: string }
  if (!channel || !access_token) return NextResponse.json({ error: 'channel and access_token are required' }, { status: 400 })
  if (!CHANNELS.some(c => c.channel === channel && c.requiresCredentials)) {
    return NextResponse.json({ error: 'channel is not connectable' }, { status: 400 })
  }
  const svc = await createServiceClient()
  const { error } = await svc.from('mkt_channel_connections').upsert({
    channel, account_id: account_id ?? null, access_token, status: 'connected',
    connected_by: user?.id ?? null, updated_at: new Date().toISOString(),
  }, { onConflict: 'channel' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, channel })
}

// DELETE ?channel= — disconnect a channel (clears the token).
export async function DELETE(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const channel = new URL(req.url).searchParams.get('channel')
  if (!channel) return NextResponse.json({ error: 'channel is required' }, { status: 400 })
  const svc = await createServiceClient()
  await svc.from('mkt_channel_connections').update({ status: 'disconnected', access_token: null, updated_at: new Date().toISOString() }).eq('channel', channel)
  return NextResponse.json({ ok: true })
}
