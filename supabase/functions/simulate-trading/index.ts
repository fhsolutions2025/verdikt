// simulate-trading — Edge Function (TECH_SPEC §6)
// Invoked by Supabase Cron every minute.
// Creates paired YES+NO simulated trades to model realistic P2P activity:
//   - Hot markets (above-median volume) get 3× more trade weight
//   - Hour-of-day multiplier (WAT = UTC+1): busier during peak hours
//   - Price guard rails: mean-reverts markets that drift to extremes
//   - Every round places one YES and one NO on the same market (counterparty pairing)
// is_simulated = true, taker_id = null — never blended with real player activity.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const TRADER_NAMES = [
  'HedgeBot', 'ArsenalFan', 'ScoutPro', 'NaijaPredict',
  'QuietMoney', 'ForexWatch', 'MarketMind', 'PunterX',
  'EagleEye',  'DataDriven', 'BullRun',   'BearTrap',
]

const TRADE_AMOUNTS = [50, 100, 150, 200, 250, 300, 400, 500, 750, 1000]

function randomAmount(): number {
  return TRADE_AMOUNTS[Math.floor(Math.random() * TRADE_AMOUNTS.length)]
}

function pickTrader(exclude?: string): string {
  let name = TRADER_NAMES[Math.floor(Math.random() * TRADER_NAMES.length)]
  while (name === exclude) {
    name = TRADER_NAMES[Math.floor(Math.random() * TRADER_NAMES.length)]
  }
  return name
}

// Weighted random market selection — hot markets (above-median volume) get 3× weight
function pickMarket(markets: { id: string; yes_price: number; volume: number }[]): typeof markets[0] {
  const sorted  = [...markets].map(m => m.volume).sort((a, b) => a - b)
  const median  = sorted[Math.floor(sorted.length / 2)] ?? 0
  const weights = markets.map(m => m.volume > median ? 3 : 1)
  const total   = weights.reduce((s, w) => s + w, 0)
  let r = Math.random() * total
  for (let i = 0; i < markets.length; i++) {
    r -= weights[i]
    if (r <= 0) return markets[i]
  }
  return markets[markets.length - 1]
}

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: markets } = await supabase
    .from('markets')
    .select('id, yes_price, volume')
    .eq('status', 'live')
    .limit(20)

  if (!markets?.length) {
    return new Response(JSON.stringify({ ok: true, trades: 0, pairs: 0 }))
  }

  // Hour-of-day multiplier (WAT = UTC+1)
  const hour       = (new Date().getUTCHours() + 1) % 24
  const multiplier =
    (hour >= 9 && hour < 12) || (hour >= 17 && hour < 20) ? 1.8
    : (hour >= 22 || hour < 7) ? 0.3
    : 1.0
  const pairCount = Math.max(1, Math.round(2 * multiplier))

  let trades = 0

  for (let i = 0; i < pairCount; i++) {
    const market = pickMarket(markets)
    const p      = market.yes_price

    // Price guard rails: if market is drifting extreme, bias the opposite side
    let yesAmt = randomAmount()
    let noAmt  = randomAmount()
    if (p > 80) {
      // YES overbought — dampen YES, amplify NO to mean-revert
      yesAmt = Math.max(50, Math.round(yesAmt * 0.5))
      noAmt  = Math.min(1000, Math.round(noAmt * 2))
    } else if (p < 20) {
      // NO overbought — amplify YES, dampen NO
      yesAmt = Math.min(1000, Math.round(yesAmt * 2))
      noAmt  = Math.max(50, Math.round(noAmt * 0.5))
    }

    const traderA = pickTrader()
    const traderB = pickTrader(traderA)

    // Place YES side
    await supabase.rpc('execute_trade', {
      p_market_id:             market.id,
      p_taker_id:              null,
      p_side:                  'yes',
      p_amount:                yesAmt,
      p_is_simulated:          true,
      p_simulated_trader_name: traderA,
    })
    trades++

    await new Promise(r => setTimeout(r, 200 + Math.random() * 400))

    // Place NO side (simulates counterparty)
    await supabase.rpc('execute_trade', {
      p_market_id:             market.id,
      p_taker_id:              null,
      p_side:                  'no',
      p_amount:                noAmt,
      p_is_simulated:          true,
      p_simulated_trader_name: traderB,
    })
    trades++

    await new Promise(r => setTimeout(r, 200 + Math.random() * 300))
  }

  return new Response(
    JSON.stringify({ ok: true, trades, pairs: pairCount, multiplier }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
