// normalize-byv-market — Edge Function
// Picks up pending_ai markets in batches of 5, runs Haiku normalization,
// updates market status, logs to ai_call_log and audit_log.
// Scheduled at */2 * * * * (migration 0017).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY')!
const ALPHA_VANTAGE_KEY         = Deno.env.get('ALPHA_VANTAGE_KEY') ?? ''
const FOOTBALL_DATA_KEY         = Deno.env.get('FOOTBALL_DATA_KEY') ?? ''
const COINGECKO_API_KEY         = Deno.env.get('COINGECKO_API_KEY') ?? ''

// ─── Price context fetching ───────────────────────────────────────────────────

const CRYPTO_IDS: Record<string, string> = {
  bitcoin: 'bitcoin', btc: 'bitcoin',
  ethereum: 'ethereum', eth: 'ethereum',
  bnb: 'binancecoin', solana: 'solana', sol: 'solana',
  xrp: 'ripple', doge: 'dogecoin', usdt: 'tether',
}

const COMMODITY_SYMBOLS: Record<string, string> = {
  gold: 'XAU', xau: 'XAU',
  silver: 'XAG', xag: 'XAG',
}

// football-data.org free-tier competitions
const FOOTBALL_COMPETITIONS: Record<string, { code: string; name: string }> = {
  'premier league': { code: 'PL',  name: 'Premier League' },
  'epl':            { code: 'PL',  name: 'Premier League' },
  'champions league': { code: 'CL', name: 'Champions League' },
  'ucl':            { code: 'CL',  name: 'Champions League' },
  'la liga':        { code: 'PD',  name: 'La Liga' },
  'bundesliga':     { code: 'BL1', name: 'Bundesliga' },
  'serie a':        { code: 'SA',  name: 'Serie A' },
  'ligue 1':        { code: 'FL1', name: 'Ligue 1' },
  'world cup':      { code: 'WC',  name: 'FIFA World Cup' },
  'euros':          { code: 'EC',  name: 'UEFA European Championship' },
}

async function safeFetch(url: string, options: RequestInit = {}, timeoutMs = 2000): Promise<Response | null> {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
  } catch {
    return null
  }
}

async function fetchPriceContext(
  supabase: ReturnType<typeof createClient>,
  category: string,
  question: string,
): Promise<string> {
  const q = question.toLowerCase()

  // ── Sports: football-data.org standings ────────────────────────────────────
  if (category === 'sports') {
    if (!FOOTBALL_DATA_KEY) return 'unavailable — football-data.org key not configured'

    for (const [keyword, comp] of Object.entries(FOOTBALL_COMPETITIONS)) {
      if (q.includes(keyword)) {
        const res = await safeFetch(
          `https://api.football-data.org/v4/competitions/${comp.code}/standings`,
          { headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY } },
        )
        await trackCall(supabase, 'football-data.org')
        if (res?.ok) {
          const data = await res.json()
          const table = data?.standings?.[0]?.table ?? []
          const top5 = (table as Array<{ position: number; team: { name: string }; points: number; playedGames: number }>)
            .slice(0, 5)
            .map(r => `${r.position}. ${r.team.name} — ${r.points}pts (${r.playedGames}g)`)
            .join('; ')
          return top5
            ? `${comp.name} top 5 standings: ${top5}`
            : 'unavailable — standings data empty'
        }
        return 'unavailable — football-data.org fetch failed'
      }
    }
    return 'unavailable — no matching football competition found in question'
  }

  if (category !== 'finance') return 'unavailable — not a finance or sports market'

  // ── Crypto: CoinGecko ──────────────────────────────────────────────────────
  for (const [keyword, coinId] of Object.entries(CRYPTO_IDS)) {
    if (q.includes(keyword)) {
      const cgUrl = COINGECKO_API_KEY
        ? `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&x_cg_demo_api_key=${COINGECKO_API_KEY}`
        : `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`
      const res = await safeFetch(cgUrl)
      await trackCall(supabase, 'CoinGecko')
      if (res?.ok) {
        const data = await res.json()
        const price = data[coinId]?.usd
        if (price) return `${coinId} (crypto) current price: $${price} USD`
      }
      return 'unavailable — CoinGecko fetch failed'
    }
  }

  // ── Commodities (gold/silver): Alpha Vantage ───────────────────────────────
  for (const [keyword, symbol] of Object.entries(COMMODITY_SYMBOLS)) {
    if (q.includes(keyword)) {
      if (!ALPHA_VANTAGE_KEY) return 'unavailable — Alpha Vantage key not configured'
      const res = await safeFetch(
        `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${symbol}&to_currency=USD&apikey=${ALPHA_VANTAGE_KEY}`,
      )
      await trackCall(supabase, 'Alpha Vantage')
      if (res?.ok) {
        const data = await res.json()
        const rate = data['Realtime Currency Exchange Rate']?.['5. Exchange Rate']
        if (rate) return `${symbol}/USD current price: ${parseFloat(rate).toFixed(2)} USD per troy ounce`
      }
      return 'unavailable — Alpha Vantage fetch failed'
    }
  }

  // ── Forex: Frankfurter ─────────────────────────────────────────────────────
  if (/\b(usd|eur|gbp|jpy|cad|aud|chf|cny|inr|mxn|brl|dollar|euro|pound|yen|franc|forex|currency|exchange rate)\b/i.test(q)) {
    const res = await safeFetch('https://api.frankfurter.app/latest?base=USD')
    await trackCall(supabase, 'Frankfurter')
    if (res?.ok) {
      const data = await res.json()
      const rates = data.rates as Record<string, number>
      // Top globally-traded pairs available from Frankfurter (ECB data)
      const priority = ['EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR', 'MXN', 'BRL']
      const summary = priority
        .filter(c => rates[c])
        .map(c => `${c}: ${rates[c]}`)
        .join(', ')
      return `Forex rates (USD base, ${data.date}): ${summary}`
    }
    return 'unavailable — Frankfurter fetch failed'
  }

  return 'unavailable — no matching price source for this question'
}

// Fire-and-forget call tracker — never throws, never blocks the main flow
async function trackCall(supabase: ReturnType<typeof createClient>, apiName: string): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).rpc('track_api_call', { p_api_name: apiName })
  } catch {
    // tracking failure must not break normalization
  }
}

// ─── Haiku prompt ─────────────────────────────────────────────────────────────

function buildPrompt(market: {
  question: string; category: string; closes_at: string
}, daysToClose: number, priceContext: string): string {
  return `You are Verdikt's market normalization AI.
You receive a player-submitted market idea and must return structured JSON only — no preamble, no markdown, no code fences.

JSON shape:
{
  "cleaned_question": string,
  "is_verifiable": boolean,
  "resolution_source": string,
  "confidence_score": number,
  "suggested_yes_price": number,
  "rejection_reason": string | null,
  "deadline_warning": string | null
}

Rules:
- confidence_score is 0–100
- confidence < 40: set is_verifiable false and provide rejection_reason
- suggested_yes_price must be between 1 and 99 (integer or one decimal)
- Never output currency symbols in JSON string values
- Never do arithmetic — prices come from context below
- deadline_warning: if closes_at is fewer than 7 days away, explain why this is a risk
- Market category: ${market.category}
- Closes at: ${market.closes_at}
- Days until close: ${daysToClose}
- Current price context: ${priceContext}
- Player's original text: ${market.question}`
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: markets, error: fetchErr } = await supabase
    .from('markets')
    .select('id, question, category, closes_at, created_by')
    .eq('status', 'pending_ai')
    .order('created_at', { ascending: true })
    .limit(5)

  if (fetchErr || !markets?.length) {
    return new Response(
      JSON.stringify({ ok: true, processed: 0, reason: fetchErr?.message ?? 'no pending markets' }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  }

  const results = []

  for (const market of markets) {
    const daysToClose = Math.ceil(
      (new Date(market.closes_at).getTime() - Date.now()) / 86_400_000
    )

    const priceContext = await fetchPriceContext(supabase, market.category, market.question)
    const prompt       = buildPrompt(market, daysToClose, priceContext)

    const callStart   = Date.now()
    let aiSuccess     = false
    let inputTokens: number | null   = null
    let outputTokens: number | null  = null
    let latencyMs: number | null     = null
    let aiJson: Record<string, unknown> | null = null
    let errorMessage: string | null  = null

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 512,
          system:     'You are a JSON-only API. Output raw JSON with no markdown, no code fences, no explanation. First character must be {.',
          messages:   [{ role: 'user', content: prompt }],
        }),
      })

      latencyMs = Date.now() - callStart
      const body = await res.json()

      if (res.ok && body.content?.[0]?.text) {
        inputTokens  = body.usage?.input_tokens  ?? null
        outputTokens = body.usage?.output_tokens ?? null
        // Strip markdown code fences Haiku sometimes adds despite instructions
        let rawText = body.content[0].text.trim()
        const fenceMatch = rawText.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/)
        if (fenceMatch) rawText = fenceMatch[1].trim()
        aiJson    = JSON.parse(rawText)
        aiSuccess = true
      } else {
        errorMessage = body.error?.message ?? `HTTP ${res.status}`
      }
    } catch (e) {
      latencyMs    = Date.now() - callStart
      errorMessage = e instanceof Error ? e.message : 'Unknown error'
    }

    // Always log the AI call
    await supabase.from('ai_call_log').insert({
      call_type:         'byv_normalization',
      model:             'claude-haiku-4-5-20251001',
      input_tokens:      inputTokens,
      output_tokens:     outputTokens,
      latency_ms:        latencyMs,
      success:           aiSuccess,
      error_message:     errorMessage,
      related_market_id: market.id,
      from_cache:        false,
    })

    if (!aiSuccess || !aiJson) {
      results.push({ market_id: market.id, outcome: 'ai_error', error: errorMessage })
      continue
    }

    const confidence = Math.round(Number(aiJson.confidence_score) || 0)

    let marketUpdate: Record<string, unknown>
    let auditDesc: string

    if (confidence >= 65) {
      const yesPrice = Math.min(99, Math.max(1, Math.round(Number(aiJson.suggested_yes_price))))
      marketUpdate = {
        status:                   'ai_ready',
        question:                 String(aiJson.cleaned_question),
        yes_price:                yesPrice,
        ai_confidence:            confidence,
        resolution_source:        String(aiJson.resolution_source),
        player_original_question: market.question,
      }
      auditDesc = `AI normalized (conf ${confidence}%): "${aiJson.cleaned_question}" — via ${aiJson.resolution_source}`
    } else if (confidence >= 40) {
      marketUpdate = {
        status:                   'ai_ready',
        ai_confidence:            confidence,
        player_original_question: market.question,
      }
      auditDesc = `AI low-confidence (conf ${confidence}%) — needs company review: "${market.question}"`
    } else {
      marketUpdate = {
        status:                   'voided',
        rejection_reason:         String(aiJson.rejection_reason ?? 'Confidence too low for market creation'),
        player_original_question: market.question,
      }
      auditDesc = `AI rejected (conf ${confidence}%): ${aiJson.rejection_reason ?? 'confidence < 40'}`
    }

    await supabase.from('markets').update(marketUpdate).eq('id', market.id)

    await supabase.from('audit_log').insert({
      type:        'market_submission',
      description: auditDesc,
      market_id:   market.id,
      actor_id:    null,
    })

    results.push({ market_id: market.id, outcome: confidence >= 40 ? 'ai_ready' : 'voided', confidence })
  }

  return new Response(
    JSON.stringify({ ok: true, processed: results.length, results }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
