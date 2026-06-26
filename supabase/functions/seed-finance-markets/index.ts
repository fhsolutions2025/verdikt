// seed-finance-markets — Edge Function
// Fetches live prices from CoinGecko (crypto), Alpha Vantage (gold/silver),
// and Frankfurter (forex), then generates binary prediction markets:
//   - Crypto: "Will BTC exceed $X by [date]?"
//   - Commodities: "Will Gold exceed $X per troy ounce by [date]?"
//   - Forex: "Will EUR/USD rise above X by [date]?"
// Inserted as pending_ai → normalize-byv validates with live price context.
// Scheduled every 4 hours (migration 0024).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALPHA_VANTAGE_KEY         = Deno.env.get('ALPHA_VANTAGE_KEY') ?? ''
const COINGECKO_API_KEY         = Deno.env.get('COINGECKO_API_KEY') ?? ''

async function safeFetch(url: string, options: RequestInit = {}, timeoutMs = 10_000): Promise<Response | null> {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
  } catch {
    return null
  }
}

interface MarketSeed {
  question:          string
  yes_price:         number
  closes_at:         string
  resolution_source: string
  source_feed:       string
}

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function futureDate(daysFromNow: number): { iso: string; readable: string } {
  const d = new Date(Date.now() + daysFromNow * 86_400_000)
  return {
    iso:      d.toISOString().slice(0, 10),
    readable: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
  }
}

async function cryptoMarkets(cgEnabled: boolean): Promise<MarketSeed[]> {
  if (!cgEnabled) return []

  const ids = 'bitcoin,ethereum,solana,ripple,dogecoin'
  const url = COINGECKO_API_KEY
    ? `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&x_cg_demo_api_key=${COINGECKO_API_KEY}`
    : `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`

  const res = await safeFetch(url)
  if (!res?.ok) return []

  const data = await res.json() as Record<string, { usd: number }>

  const configs = [
    { id: 'bitcoin',  symbol: 'BTC',  daysOut: 30, pctUp: 0.10 },
    { id: 'ethereum', symbol: 'ETH',  daysOut: 30, pctUp: 0.10 },
    { id: 'solana',   symbol: 'SOL',  daysOut: 21, pctUp: 0.15 },
    { id: 'ripple',   symbol: 'XRP',  daysOut: 21, pctUp: 0.15 },
  ]

  const seeds: MarketSeed[] = []
  for (const cfg of configs) {
    const price = data[cfg.id]?.usd
    if (!price) continue

    // Round target to a clean number (500 for BTC, 10 for ETH, 1 for small caps)
    const step   = price > 10_000 ? 500 : price > 100 ? 10 : price > 1 ? 0.1 : 0.001
    const raw    = price * (1 + cfg.pctUp)
    const target = Math.round(raw / step) * step
    const date   = futureDate(cfg.daysOut)

    seeds.push({
      question:          `Will ${cfg.symbol} exceed $${fmt(target, price < 1 ? 4 : 0)} by ${date.readable}?`,
      yes_price:         40,
      closes_at:         date.iso,
      resolution_source: `CoinGecko ${cfg.symbol}/USD spot price`,
      source_feed:       'CoinGecko',
    })
  }
  return seeds
}

async function commodityMarkets(avEnabled: boolean): Promise<MarketSeed[]> {
  if (!avEnabled || !ALPHA_VANTAGE_KEY) return []

  const seeds: MarketSeed[] = []
  const commodities = [
    { sym: 'XAU', name: 'Gold',   daysOut: 60, pctUp: 0.05 },
    { sym: 'XAG', name: 'Silver', daysOut: 60, pctUp: 0.08 },
  ]

  for (const c of commodities) {
    const res = await safeFetch(
      `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${c.sym}&to_currency=USD&apikey=${ALPHA_VANTAGE_KEY}`,
    )
    if (!res?.ok) continue

    const data  = await res.json()
    const price = parseFloat(data['Realtime Currency Exchange Rate']?.['5. Exchange Rate'] ?? '')
    if (!price) continue

    const step   = 10
    const target = Math.round(price * (1 + c.pctUp) / step) * step
    const date   = futureDate(c.daysOut)

    seeds.push({
      question:          `Will ${c.name} (${c.sym}) exceed $${fmt(target)} per troy ounce by ${date.readable}?`,
      yes_price:         40,
      closes_at:         date.iso,
      resolution_source: `Alpha Vantage ${c.sym}/USD spot price`,
      source_feed:       'Alpha Vantage',
    })
  }
  return seeds
}

async function forexMarkets(fxEnabled: boolean): Promise<MarketSeed[]> {
  if (!fxEnabled) return []

  const res = await safeFetch('https://api.frankfurter.app/latest?base=USD')
  if (!res?.ok) return []

  const data  = await res.json() as { rates: Record<string, number> }
  const rates = data.rates

  const seeds: MarketSeed[] = []
  const pairs = [
    { sym: 'EUR', label: 'EUR/USD', pct: 0.02, daysOut: 30 },
    { sym: 'GBP', label: 'GBP/USD', pct: 0.02, daysOut: 30 },
  ]

  for (const p of pairs) {
    const usdPerX = rates[p.sym]   // e.g. EUR rate in Frankfurter = USD per EUR
    if (!usdPerX) continue

    // Frankfurter base=USD → rates[EUR] = how many EUR per 1 USD → invert for EUR/USD
    const spotRate = parseFloat((1 / usdPerX).toFixed(4))
    const target   = parseFloat((spotRate * (1 + p.pct)).toFixed(4))
    const date     = futureDate(p.daysOut)

    seeds.push({
      question:          `Will ${p.label} rise above ${target} by ${date.readable}?`,
      yes_price:         40,
      closes_at:         date.iso,
      resolution_source: `Frankfurter ${p.label} exchange rate`,
      source_feed:       'Frankfurter',
    })
  }
  return seeds
}

function tooSimilar(question: string, existing: string[]): boolean {
  const kw = new Set(question.toLowerCase().split(/\W+/).filter(w => w.length > 3))
  for (const q of existing) {
    const overlap = q.toLowerCase().split(/\W+/).filter(w => w.length > 3 && kw.has(w)).length
    if (overlap >= 4) return true
  }
  return false
}

Deno.serve(async () => {
  const runStart = new Date()
  const supabase  = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: sources } = await supabase
    .from('api_sources')
    .select('name, enabled')
    .in('name', ['CoinGecko', 'Alpha Vantage', 'Frankfurter'])

  const enabledSet = new Set<string>(
    (sources ?? []).filter(s => s.enabled).map(s => s.name),
  )

  if (enabledSet.size === 0) {
    await supabase.from('cron_run_log').insert({
      job_name: 'seed-finance-markets', started_at: runStart.toISOString(),
      feeds_active: 0, headlines_fetched: 0, viable_count: 0,
      inserted_count: 0, skipped_count: 0,
      duration_ms: Date.now() - runStart.getTime(),
    })
    return new Response(JSON.stringify({ ok: true, message: 'All finance sources disabled' }))
  }

  // Dedup against open finance markets
  const { data: existing } = await supabase
    .from('markets')
    .select('question')
    .eq('category', 'finance')
    .in('status', ['live', 'pending_ai', 'ai_ready', 'pending_mm_review'])
    .order('created_at', { ascending: false })
    .limit(100)

  const existingQuestions = (existing ?? []).map(m => m.question)

  // Fetch from all enabled sources in parallel
  const [cryptoSeeds, commoditySeeds, forexSeeds] = await Promise.all([
    cryptoMarkets(enabledSet.has('CoinGecko')),
    commodityMarkets(enabledSet.has('Alpha Vantage')),
    forexMarkets(enabledSet.has('Frankfurter')),
  ])

  // Track API calls for sources that returned data
  if (cryptoSeeds.length)    await supabase.rpc('track_api_call', { p_api_name: 'CoinGecko' })
  if (commoditySeeds.length) await supabase.rpc('track_api_call', { p_api_name: 'Alpha Vantage' })
  if (forexSeeds.length)     await supabase.rpc('track_api_call', { p_api_name: 'Frankfurter' })

  const candidates = [...cryptoSeeds, ...commoditySeeds, ...forexSeeds]

  let inserted = 0
  let skipped  = 0

  for (const seed of candidates) {
    if (tooSimilar(seed.question, existingQuestions)) { skipped++; continue }

    const { error } = await supabase.from('markets').insert({
      question:          seed.question,
      category:          'finance',
      fee_category:      'finance',
      yes_price:         seed.yes_price,
      spread_cents:      2,
      ai_confidence:     65,
      status:            'pending_ai',
      creator_type:      'ai_system',
      resolution_source: seed.resolution_source,
      closes_at:         seed.closes_at,
      source_feed:       seed.source_feed,
      volume:            0,
    })

    if (!error) {
      existingQuestions.push(seed.question)
      inserted++
    }
  }

  await supabase.from('cron_run_log').insert({
    job_name:          'seed-finance-markets',
    started_at:        runStart.toISOString(),
    feeds_active:      enabledSet.size,
    headlines_fetched: candidates.length,
    viable_count:      candidates.length - skipped,
    inserted_count:    inserted,
    skipped_count:     skipped,
    duration_ms:       Date.now() - runStart.getTime(),
  })

  return new Response(
    JSON.stringify({ ok: true, inserted, skipped, candidates: candidates.length }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
