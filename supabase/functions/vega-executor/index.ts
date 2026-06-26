// vega-executor — Edge Function
// Runs every player's autonomous trading agent ("Vega") on a schedule.
//
// Per active config it does two passes:
//   1. STOP-LOSS  — exits any Vega position down >= stop_loss_pct
//   2. ENTRY      — a two-stage calibrated forecaster:
//        Stage 1 (belief): Haiku estimates P(YES) BLIND to the market price
//                          (anti-anchoring / circular-reference guard).
//        Stage 2 (edge):   code computes edge = |agent_p - market_p|, gates on
//                          an edge floor + confidence + near-50 straddle, then
//                          sizes via fractional Kelly within every limit.
//
// EVERY limit (budget cap, max position, daily trades, confidence, edge) is
// enforced here in code — the model only forecasts, the executor disposes.
//
// Scheduled hourly via cron; respects each config's run_schedule
// (manual configs are skipped by the scheduler call).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
async function safeFetch(url: string, options: RequestInit = {}, timeoutMs = 30_000): Promise<Response | null> {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
  } catch {
    return null
  }
}

// Route Anthropic calls through the proxy — key lives in Supabase secrets only
async function callAnthropicProxy(body: Record<string, unknown>): Promise<Response | null> {
  return safeFetch(
    `${SUPABASE_URL}/functions/v1/anthropic-proxy`,
    {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(body),
    },
    25_000,
  )
}

// ── Forecaster tuning constants ──────────────────────────────────────────────
const EDGE_THRESHOLD_PP = 8     // min |belief − market| in percentage points to trade
const KELLY_MULT        = 0.35  // fractional Kelly multiplier (conservative sizing)
// Win-probability floor for the CHOSEN side. This is deliberately separate from
// the per-config `confidence_threshold` (which is a candidacy filter on each
// market's ai_confidence). Reusing the 70 candidacy knob here was over-binding:
// it required Vega to be ≥70% sure AND have ≥8pp edge AND clear the straddle
// guard simultaneously, which silently produced zero trades on almost every run.
const MIN_WIN_PROB      = 55

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
  closes_at:     string | null
}

// A calibrated belief about one market, formed BLIND to the market price.
interface Belief {
  market_id: string
  p_yes:     number   // integer 0–100: P(YES resolves true)
  rationale: string
}

// A market that survived all gates, with its computed size and metrics.
interface SizedTrade {
  market_id:      string
  side:           'yes' | 'no'
  stake:          number   // INR, pre-floor
  edge_pp:        number
  p_side:         number   // belief chosen side wins, 0–100
  market_p_yes:   number   // 0–100
  p_yes:          number   // 0–100
  kelly_fraction: number
  rationale:      string
}

// ── STAGE 1: BELIEF (LLM, blind to price) ────────────────────────────────────
// Ask Haiku for a calibrated P(YES) per market. The prompt MUST NOT contain
// yes_price / no_price or any market-implied probability — this is the
// circular-reference guard + anti-anchoring rule. The model forms its belief
// first; Stage 2 (pure code) compares it to price to find edge.
async function getBeliefs(
  candidates: MarketRow[],
  cfg: VegaConfig,
): Promise<Belief[]> {
  if (candidates.length === 0) return []

  // NOTE: no price fields here. Only neutral, non-anchoring context.
  const marketLines = candidates.map(m =>
    `- id:${m.id} | "${m.question}" | category:${m.category} | closes_at:${m.closes_at ?? 'n/a'} | ai_confidence:${m.ai_confidence ?? 'n/a'}`,
  ).join('\n')

  const prompt = [
    'You are Vega, a calibrated forecaster for prediction markets.',
    'For each market below, estimate P(YES resolves true) as an INTEGER 0-100.',
    'Anchor FIRST on the base rate for the event class, then adjust for the specifics of this question.',
    'You are NOT told the market price, and you must not guess it — form your own honest belief.',
    'Returning nothing, or a low-conviction estimate near 50, is completely fine when you are unsure.',
    '',
    'Markets:',
    marketLines,
    '',
    'Return ONLY a JSON array (no prose, no markdown fences). Each element:',
    '{"market_id":"<id>","p_yes":<integer 0-100>,"rationale":"<one sentence, base-rate anchored>"}',
    'First character of your reply MUST be [.',
  ].join('\n')

  try {
    const res = await callAnthropicProxy({
      model:       'claude-haiku-4-5-20251001',
      max_tokens:  1000,
      temperature: 0.3,
      system:      'You are a disciplined, calibrated forecaster that outputs only raw JSON arrays. You never see or infer market prices; you reason purely from base rates and evidence.',
      messages:    [{ role: 'user', content: prompt }],
    })
    if (!res?.ok) return []

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
      .filter((b: Belief) => {
        const p = Number(b.p_yes)
        return validIds.has(b.market_id) && Number.isFinite(p) && p >= 0 && p <= 100
      })
      .map((b: Belief) => ({
        market_id: b.market_id,
        p_yes:     Math.round(Number(b.p_yes)),
        rationale: b.rationale,
      }))
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
      .select('id, market_id, side, entry_price, entry_value, shares')
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
          // Release the capital this position tied up so budget_cap reflects
          // OPEN exposure, not lifetime deployed. Without this the cap is
          // permanently consumed and Vega stops trading after a few exits.
          const released = Number(pos.entry_value ?? 0)
          const newDeployed = Math.max(0, cfg.total_deployed - released)
          await supabase
            .from('autonomous_agent_configs')
            .update({ total_pnl: cfg.total_pnl + realized, total_deployed: newDeployed })
            .eq('id', cfg.id)
          cfg.total_pnl += realized
          cfg.total_deployed = newDeployed
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

  // Candidacy filter. A live market is eligible if its ai_confidence meets the
  // config threshold OR is unknown (null). Previously a bare `.gte()` silently
  // dropped every null-confidence live market — Postgres comparisons against
  // NULL are never true — which alone could starve Vega of all candidates.
  const { data: liveMarkets } = await supabase
    .from('markets')
    .select('id, question, yes_price, no_price, ai_confidence, volume, category, closes_at')
    .eq('status', 'live')
    .in('category', cfg.allowed_categories)
    .or(`ai_confidence.is.null,ai_confidence.gte.${cfg.confidence_threshold}`)
    .order('volume', { ascending: false })
    .limit(15)

  const candidates = (liveMarkets ?? []).filter((m: MarketRow) => !heldMarketIds.has(m.id))

  // STAGE 1: form beliefs BLIND to price.
  const beliefs = await getBeliefs(candidates, cfg)
  const marketById = new Map(candidates.map((m: MarketRow) => [m.id, m]))

  // STAGE 2: edge + sizing (pure code, no LLM).
  const sized: SizedTrade[] = []
  for (const b of beliefs) {
    const m = marketById.get(b.market_id)
    if (!m) continue

    const market_p_yes = m.yes_price            // 0–100
    const p_yes        = b.p_yes                // 0–100
    const edge_pp      = Math.abs(p_yes - market_p_yes)

    const chosen: 'yes' | 'no' = p_yes > market_p_yes ? 'yes' : 'no'
    const p_side     = chosen === 'yes' ? p_yes : (100 - p_yes)            // belief chosen side wins, 0–100
    const price_side = (chosen === 'yes' ? m.yes_price : m.no_price) / 100 // cost per share, 0–1

    // GATES
    if (edge_pp < EDGE_THRESHOLD_PP) continue
    if (p_side < MIN_WIN_PROB) continue
    // straddle guard: both belief and market sit in the coin-flip zone
    if (market_p_yes >= 45 && market_p_yes <= 55 && p_yes >= 45 && p_yes <= 55) continue

    // KELLY sizing (fractional)
    const denom = 1 - price_side
    if (denom <= 0) continue
    let f_star = (p_side / 100 - price_side) / denom
    if (f_star < 0) f_star = 0
    const kelly_fraction = f_star * KELLY_MULT
    let stake = kelly_fraction * cfg.budget_cap_inr

    // cap to max_position_size and remaining budget
    stake = Math.min(stake, cfg.max_position_size, cfg.budget_cap_inr - cfg.total_deployed)
    if (stake < 1) continue

    sized.push({
      market_id:      b.market_id,
      side:           chosen,
      stake,
      edge_pp,
      p_side,
      market_p_yes,
      p_yes,
      kelly_fraction,
      rationale:      b.rationale,
    })
  }

  // Rank by edge_pp descending, take up to remainingTrades.
  sized.sort((a, b) => b.edge_pp - a.edge_pp)
  const picks = sized.slice(0, remainingTrades)

  let deployedThisRun = 0
  for (const t of picks) {
    const budgetLeft = remainingBudget - deployedThisRun
    if (budgetLeft < 1) break
    if (entries >= remainingTrades) break

    // Final size: capped by chosen stake, remaining run budget, and wallet.
    const amount = Math.floor(Math.min(t.stake, budgetLeft, balance - deployedThisRun))
    if (amount < 1) continue

    const { data: trade, error } = await supabase.rpc('execute_trade', {
      p_market_id:    t.market_id,
      p_taker_id:     cfg.player_id,
      p_side:         t.side,
      p_amount:       amount,
      p_is_simulated: false,
    })

    const model_confidence = Math.round(t.p_side)

    if (error) {
      await supabase.from('autonomous_trade_log').insert({
        player_id: cfg.player_id, config_id: cfg.id, action: 'error',
        market_id: t.market_id, side: t.side, amount,
        model_confidence,
        agent_probability:  Math.round(t.p_side),
        market_probability: Math.round(t.side === 'yes' ? t.market_p_yes : (100 - t.market_p_yes)),
        edge_pp:            Math.round(t.edge_pp * 100) / 100,
        kelly_fraction:     Math.round(t.kelly_fraction * 10000) / 10000,
        rationale: `Execution failed: ${error.message}`.slice(0, 400),
      })
      continue
    }

    // Link the agent log to the position this trade created/merged into.
    // execute_trade now returns position_id directly — authoritative, and
    // immune to the read-after-write race / "already held this side" ambiguity
    // that made a re-query occasionally miss and drop the ★ Vega badge. Fall
    // back to a re-query only if an older RPC build omits the field.
    let positionId = (trade as { position_id?: string })?.position_id ?? null
    if (!positionId) {
      const { data: pos } = await supabase
        .from('positions')
        .select('id')
        .eq('player_id', cfg.player_id)
        .eq('market_id', t.market_id)
        .eq('side', t.side)
        .eq('status', 'open')
        .limit(1)
        .single()
      positionId = pos?.id ?? null
    }

    await supabase.from('autonomous_trade_log').insert({
      player_id:          cfg.player_id,
      config_id:          cfg.id,
      action:             'entry',
      market_id:          t.market_id,
      position_id:        positionId,
      side:               t.side,
      amount,
      shares:             (trade as { shares?: number })?.shares ?? null,
      model_confidence,
      rationale:          t.rationale?.slice(0, 400) ?? null,
      agent_probability:  Math.round(t.p_side),
      market_probability: Math.round(t.side === 'yes' ? t.market_p_yes : (100 - t.market_p_yes)),
      edge_pp:            Math.round(t.edge_pp * 100) / 100,
      kelly_fraction:     Math.round(t.kelly_fraction * 10000) / 10000,
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

  // ── Global kill-switch ──────────────────────────────────────────────────────
  // Ops can globally pause every autonomous agent. Checked first so neither the
  // scheduled sweep nor a manual "Run now" can place any trade while paused.
  const { data: globalCfg } = await supabase
    .from('autonomous_global_config')
    .select('agents_enabled')
    .eq('id', 1)
    .single()

  if (globalCfg && globalCfg.agents_enabled === false) {
    return new Response(
      JSON.stringify({ ok: true, killed: true, configs: 0, entries: 0, exits: 0, results: [] }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  }

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
