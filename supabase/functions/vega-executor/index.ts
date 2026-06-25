// vega-executor — Edge Function
// Runs every player's autonomous trading agent ("Vega") on a schedule.
//
// Per active config it does two passes:
//   1. STOP-LOSS  — exits any Vega position down >= stop_loss_pct
//   2. ENTRY      — asks Haiku to pick the best opportunities from the
//                   player's allowed live markets, then opens positions
//                   within every server-side guardrail.
//
// EVERY limit (budget cap, max position, daily trades, confidence) is
// enforced here in code — the model only proposes, the executor disposes.
//
// Scheduled hourly via cron; respects each config's run_schedule
// (manual configs are skipped by the scheduler call).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY')!

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = ReturnType<typeof createClient>

interface VegaConfig {
  id:                   string
  player_id:            string
  is_active:            boolean
  budget_cap_inr:       number
  stop_loss_pct:        number
  max_position_size:    number
  confidence_threshold: number
  allowed_categories:   string[]
  max_trades_per_day:   number
  run_schedule:         string
  total_deployed:       number
  total_pnl:            number
}

interface MarketRow {
  id:            string
  question:      string
  yes_price:     number
  no_price:      number
  ai_confidence: number | null
  volume:        number
  category:      string
}

interface Decision {
  market_id:  string
  side:       'yes' | 'no'
  confidence: number
  rationale:  string
}

// ── Ask Haiku which markets to trade ─────────────────────────────────────────
async function getDecisions(
  candidates: MarketRow[],
  cfg: VegaConfig,
  maxPicks: number,
): Promise<Decision[]> {
  if (candidates.length === 0 || maxPicks <= 0) return []

  const marketLines = candidates.map(m =>
    `- id:${m.id} | "${m.question}" | YES ${m.yes_price}¢ / NO ${m.no_price}¢ | ai_confidence:${m.ai_confidence ?? 'n/a'} | category:${m.category}`,
  ).join('\n')

  const prompt = [
    'You are Vega, an autonomous prediction-market trading agent.',
    `You may select AT MOST ${maxPicks} markets to enter this run.`,
    `Only pick a market if your confidence the chosen side resolves correctly is >= ${cfg.confidence_threshold}.`,
    'Prefer markets where the current price looks mispriced relative to the likely outcome.',
    'Be selective — it is correct to return an empty array if nothing is compelling.',
    '',
    'Candidate markets:',
    marketLines,
    '',
    'Return ONLY a JSON array (no prose, no markdown fences). Each element:',
    '{"market_id":"<id>","side":"yes"|"no","confidence":<integer 0-100>,"rationale":"<one sentence>"}',
    'First character of your reply MUST be [.',
  ].join('\n')

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
        max_tokens: 800,
        temperature: 0.4,
        system: 'You are a disciplined trading agent that outputs only raw JSON arrays.',
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return []

    const data = await res.json()
    let raw = (data.content?.[0]?.text ?? '').trim()
    const start = raw.indexOf('[')
    const end   = raw.lastIndexOf(']')
    if (start < 0 || end < 0) return []
    raw = raw.slice(start, end + 1)

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    const validIds = new Set(candidates.map(c => c.id))
    return parsed
      .filter((d: Decision) =>
        validIds.has(d.market_id) &&
        (d.side === 'yes' || d.side === 'no') &&
        Number(d.confidence) >= cfg.confidence_threshold,
      )
      .slice(0, maxPicks)
  } catch {
    return []
  }
}

// ── Process one player's config ──────────────────────────────────────────────
async function runConfig(supabase: Supabase, cfg: VegaConfig): Promise<{ entries: number; exits: number }> {
  let entries = 0
  let exits   = 0

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)

  // ── PASS 1: STOP-LOSS ──────────────────────────────────────────────────────
  // Vega's open positions = positions referenced by our entry log, still open.
  const { data: entryLogs } = await supabase
    .from('autonomous_trade_log')
    .select('position_id')
    .eq('player_id', cfg.player_id)
    .eq('action', 'entry')
    .not('position_id', 'is', null)

  const vegaPositionIds = [...new Set((entryLogs ?? []).map((r: { position_id: string }) => r.position_id))]

  if (vegaPositionIds.length > 0) {
    const { data: positions } = await supabase
      .from('positions')
      .select('id, market_id, side, entry_price, shares')
      .in('id', vegaPositionIds)
      .eq('status', 'open')

    for (const pos of positions ?? []) {
      const { data: market } = await supabase
        .from('markets')
        .select('yes_price, no_price, status')
        .eq('id', pos.market_id)
        .single()
      if (!market || market.status !== 'live') continue

      const currentPrice = pos.side === 'yes' ? market.yes_price : market.no_price
      const pnlPct = ((currentPrice - pos.entry_price) / pos.entry_price) * 100

      if (pnlPct <= -cfg.stop_loss_pct) {
        const { data: sale, error } = await supabase.rpc('sell_position', {
          p_position_id: pos.id,
          p_player_id:   cfg.player_id,
        })
        if (!error) {
          exits++
          const realized = (sale as { realized_pnl?: number })?.realized_pnl ?? 0
          await supabase.from('autonomous_trade_log').insert({
            player_id:    cfg.player_id,
            config_id:    cfg.id,
            action:       'stop_loss',
            market_id:    pos.market_id,
            position_id:  pos.id,
            side:         pos.side,
            realized_pnl: realized,
            rationale:    `Stop-loss triggered at ${pnlPct.toFixed(1)}% (limit ${cfg.stop_loss_pct}%)`,
          })
          await supabase
            .from('autonomous_agent_configs')
            .update({ total_pnl: cfg.total_pnl + realized })
            .eq('id', cfg.id)
          cfg.total_pnl += realized
        }
      }
    }
  }

  // ── PASS 2: ENTRY ──────────────────────────────────────────────────────────
  // Daily trade budget remaining
  const { count: tradesToday } = await supabase
    .from('autonomous_trade_log')
    .select('id', { count: 'exact', head: true })
    .eq('player_id', cfg.player_id)
    .eq('action', 'entry')
    .gte('created_at', todayStart.toISOString())

  const remainingTrades = cfg.max_trades_per_day - (tradesToday ?? 0)
  const remainingBudget = cfg.budget_cap_inr - cfg.total_deployed
  if (remainingTrades <= 0 || remainingBudget < 10) {
    await touchLastRun(supabase, cfg.id)
    return { entries, exits }
  }

  // Wallet balance gate
  const { data: wallet } = await supabase
    .from('wallets')
    .select('balance')
    .eq('player_id', cfg.player_id)
    .single()
  const balance = wallet?.balance ?? 0
  if (balance < 10) {
    await touchLastRun(supabase, cfg.id)
    return { entries, exits }
  }

  // Candidate markets: live, allowed category, confidence threshold,
  // not already held by Vega.
  const heldMarketIds = new Set<string>()
  if (vegaPositionIds.length > 0) {
    const { data: heldPos } = await supabase
      .from('positions')
      .select('market_id')
      .in('id', vegaPositionIds)
      .eq('status', 'open')
    for (const p of heldPos ?? []) heldMarketIds.add(p.market_id)
  }

  const { data: liveMarkets } = await supabase
    .from('markets')
    .select('id, question, yes_price, no_price, ai_confidence, volume, category')
    .eq('status', 'live')
    .in('category', cfg.allowed_categories)
    .gte('ai_confidence', cfg.confidence_threshold)
    .order('volume', { ascending: false })
    .limit(15)

  const candidates = (liveMarkets ?? []).filter((m: MarketRow) => !heldMarketIds.has(m.id))

  const maxPicks   = Math.min(remainingTrades, Math.floor(remainingBudget / Math.min(cfg.max_position_size, remainingBudget)))
  const decisions  = await getDecisions(candidates, cfg, Math.max(1, maxPicks))

  let deployedThisRun = 0
  for (const d of decisions) {
    const budgetLeft = remainingBudget - deployedThisRun
    if (budgetLeft < 10) break
    if (entries >= remainingTrades) break

    // Position size: capped by max_position_size, remaining budget, and wallet
    const amount = Math.floor(Math.min(cfg.max_position_size, budgetLeft, balance - deployedThisRun))
    if (amount < 10) continue

    const { data: trade, error } = await supabase.rpc('execute_trade', {
      p_market_id:    d.market_id,
      p_taker_id:     cfg.player_id,
      p_side:         d.side,
      p_amount:       amount,
      p_is_simulated: false,
    })

    if (error) {
      await supabase.from('autonomous_trade_log').insert({
        player_id: cfg.player_id, config_id: cfg.id, action: 'error',
        market_id: d.market_id, side: d.side, amount,
        model_confidence: d.confidence,
        rationale: `Execution failed: ${error.message}`.slice(0, 400),
      })
      continue
    }

    // Find the position this trade created/merged into
    const { data: pos } = await supabase
      .from('positions')
      .select('id')
      .eq('player_id', cfg.player_id)
      .eq('market_id', d.market_id)
      .eq('side', d.side)
      .eq('status', 'open')
      .limit(1)
      .single()

    await supabase.from('autonomous_trade_log').insert({
      player_id:        cfg.player_id,
      config_id:        cfg.id,
      action:           'entry',
      market_id:        d.market_id,
      position_id:      pos?.id ?? null,
      side:             d.side,
      amount,
      shares:           (trade as { shares?: number })?.shares ?? null,
      model_confidence: d.confidence,
      rationale:        d.rationale?.slice(0, 400) ?? null,
    })

    deployedThisRun += amount
    entries++
  }

  if (deployedThisRun > 0) {
    await supabase
      .from('autonomous_agent_configs')
      .update({ total_deployed: cfg.total_deployed + deployedThisRun, last_run_at: new Date().toISOString() })
      .eq('id', cfg.id)
  } else {
    await touchLastRun(supabase, cfg.id)
  }

  return { entries, exits }
}

async function touchLastRun(supabase: Supabase, configId: string): Promise<void> {
  await supabase
    .from('autonomous_agent_configs')
    .update({ last_run_at: new Date().toISOString() })
    .eq('id', configId)
}

// ── Entrypoint ───────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // A single-player manual run may be requested via POST body { player_id }.
  // This is the only path that may run a 'manual' config (player pressed "Run now").
  let manualPlayerId: string | null = null
  if (req.method === 'POST') {
    try {
      const body = await req.json()
      if (body?.player_id) manualPlayerId = String(body.player_id)
    } catch { /* no body — scheduled run */ }
  }

  // Optional ?schedule=hourly|daily filter so a daily cron only runs daily configs
  const url = new URL(req.url)
  const scheduleFilter = url.searchParams.get('schedule')

  let query = supabase
    .from('autonomous_agent_configs')
    .select('*')
    .eq('is_active', true)

  if (manualPlayerId) {
    // On-demand run for one player, any schedule (including manual)
    query = query.eq('player_id', manualPlayerId)
  } else if (scheduleFilter === 'hourly' || scheduleFilter === 'daily') {
    query = query.eq('run_schedule', scheduleFilter)
  } else {
    // Scheduled sweep — never auto-run 'manual' configs
    query = query.neq('run_schedule', 'manual')
  }

  const { data: configs, error } = await query

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }

  let totalEntries = 0
  let totalExits   = 0
  const results: Array<{ player_id: string; entries: number; exits: number }> = []

  for (const cfg of (configs ?? []) as VegaConfig[]) {
    try {
      const r = await runConfig(supabase, cfg)
      totalEntries += r.entries
      totalExits   += r.exits
      results.push({ player_id: cfg.player_id, entries: r.entries, exits: r.exits })
    } catch (err) {
      results.push({ player_id: cfg.player_id, entries: 0, exits: 0 })
      await supabase.from('autonomous_trade_log').insert({
        player_id: cfg.player_id, config_id: cfg.id, action: 'error',
        rationale: `Run failed: ${err instanceof Error ? err.message : 'unknown'}`.slice(0, 400),
      }).then(() => {}, () => {})
    }
  }

  return new Response(
    JSON.stringify({ ok: true, configs: configs?.length ?? 0, entries: totalEntries, exits: totalExits, results }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
