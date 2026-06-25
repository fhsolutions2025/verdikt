import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Returns the current player's recent Vega trade activity.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('autonomous_trade_log')
    .select('id, action, side, amount, realized_pnl, rationale, created_at')
    .eq('player_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ activity: data ?? [] })
}
