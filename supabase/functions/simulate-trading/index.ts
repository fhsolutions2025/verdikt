// Supabase Edge Function — scheduled simulation engine (TECH_SPEC §6)
// Invoked by Supabase Cron at the finest reliable interval (1 minute).
// Generates several simulated trades on random live markets.
// is_simulated = true, taker_id = null — never blended with real activity.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TRADER_NAMES = [
  'HedgeBot', 'ArsenalFan', 'ScoutPro', 'NaijaPredict',
  'QuietMoney', 'ForexWatch', 'MarketMind', 'PunterX',
]

const TRADE_AMOUNTS = [100, 150, 200, 250, 300, 400, 500]

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Fetch live markets
  const { data: markets, error: mErr } = await supabase
    .from('markets')
    .select('id, yes_price, no_price')
    .eq('status', 'live')
    .limit(10)

  if (mErr || !markets?.length) {
    return new Response(JSON.stringify({ ok: true, trades: 0 }))
  }

  const trades = []
  const count  = Math.floor(Math.random() * 3) + 2  // 2–4 trades per invocation

  for (let i = 0; i < count; i++) {
    const market      = markets[Math.floor(Math.random() * markets.length)]
    const side        = Math.random() > 0.5 ? 'yes' : 'no'
    const amount      = TRADE_AMOUNTS[Math.floor(Math.random() * TRADE_AMOUNTS.length)]
    const traderName  = TRADER_NAMES[Math.floor(Math.random() * TRADER_NAMES.length)]

    const { data, error } = await supabase.rpc('execute_trade', {
      p_market_id:             market.id,
      p_taker_id:              null,
      p_side:                  side,
      p_amount:                amount,
      p_is_simulated:          true,
      p_simulated_trader_name: traderName,
    })

    if (!error) trades.push(data)

    // Slight delay between simulated trades (TECH_SPEC §6.2)
    await new Promise(r => setTimeout(r, 300 + Math.random() * 700))
  }

  return new Response(JSON.stringify({ ok: true, trades: trades.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
