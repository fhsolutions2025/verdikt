import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { role } = await getAuthContext()
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = await createServiceClient()

  const { data: profiles } = await service
    .from('profiles')
    .select('id')
    .eq('role', 'player')

  const playerIds = (profiles ?? []).map(p => p.id)

  const { data: trades } = playerIds.length > 0
    ? await service.from('trades').select('taker_id, amount').in('taker_id', playerIds)
    : { data: [] }

  const volumeByPlayer = new Map<string, number>()
  for (const t of (trades ?? [])) {
    volumeByPlayer.set(t.taker_id!, (volumeByPlayer.get(t.taker_id!) ?? 0) + t.amount)
  }

  const now      = Date.now()
  const MS7D     = 7 * 24 * 60 * 60 * 1000

  const { data: recentTrades } = playerIds.length > 0
    ? await service
        .from('trades')
        .select('taker_id, created_at')
        .in('taker_id', playerIds)
        .gte('created_at', new Date(now - MS7D).toISOString())
    : { data: [] }

  const activeRecently = new Set((recentTrades ?? []).map(t => t.taker_id!))

  let whales = 0, actives = 0, casuals = 0, inactive = 0
  for (const id of playerIds) {
    const vol = volumeByPlayer.get(id) ?? 0
    if (!activeRecently.has(id)) { inactive++; continue }
    if (vol >= 1000)      whales++
    else if (vol >= 100)  actives++
    else                  casuals++
  }

  const segments = [
    {
      label:        'Whales',
      count:        whales,
      description:  'High-value players with 1000¢+ lifetime volume',
      volume_range: '≥ 1000¢ volume',
      color:        '#F59E0B',
    },
    {
      label:        'Active',
      count:        actives,
      description:  'Regular players actively trading this week',
      volume_range: '100–999¢ volume',
      color:        '#6C3FC5',
    },
    {
      label:        'Casual',
      count:        casuals,
      description:  'Occasional players, active but low volume',
      volume_range: '< 100¢ volume',
      color:        '#00C853',
    },
    {
      label:        'Inactive',
      count:        inactive,
      description:  'Players with no trades in the last 7 days',
      volume_range: '0 trades this week',
      color:        '#6B7280',
    },
  ]

  return NextResponse.json({ segments })
}
