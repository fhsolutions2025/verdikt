// seed-sports-markets — Edge Function
// Fetches upcoming football fixtures from football-data.org (next 72 hours)
// and creates binary "Will [Home] beat [Away]?" prediction markets.
// Inserted as pending_ai → normalize-byv enriches with standings context.
// Scheduled every 6 hours (migration 0024).
// is_simulated = false, creator_type = 'ai_system'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FOOTBALL_DATA_KEY         = Deno.env.get('FOOTBALL_DATA_KEY') ?? ''

async function safeFetch(url: string, options: RequestInit = {}, timeoutMs = 10_000): Promise<Response | null> {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
  } catch {
    return null
  }
}

interface Fixture {
  competition: string
  homeTeam:    string
  awayTeam:    string
  utcDate:     string
}

async function fetchUpcomingFixtures(): Promise<Fixture[]> {
  if (!FOOTBALL_DATA_KEY) return []

  const dateFrom = new Date().toISOString().slice(0, 10)
  const dateTo   = new Date(Date.now() + 72 * 3_600_000).toISOString().slice(0, 10)

  const res = await safeFetch(
    `https://api.football-data.org/v4/matches?status=SCHEDULED&dateFrom=${dateFrom}&dateTo=${dateTo}`,
    { headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY } },
  )
  if (!res?.ok) return []

  const data = await res.json() as {
    matches: Array<{
      competition: { name: string }
      homeTeam:    { name: string }
      awayTeam:    { name: string }
      utcDate:     string
    }>
  }

  return (data.matches ?? []).slice(0, 20).map(m => ({
    competition: m.competition?.name ?? 'Football',
    homeTeam:    m.homeTeam?.name    ?? 'Home',
    awayTeam:    m.awayTeam?.name    ?? 'Away',
    utcDate:     m.utcDate,
  }))
}

function fixtureToMarket(f: Fixture): { question: string; closes_at: string; rationale: string } {
  const matchDate = new Date(f.utcDate)
  const dateStr   = matchDate.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
  // Closes the day after the match — result is published by then
  const closes_at = new Date(matchDate.getTime() + 24 * 3_600_000).toISOString().slice(0, 10)

  return {
    question:   `Will ${f.homeTeam} beat ${f.awayTeam} in the ${f.competition} on ${dateStr}?`,
    closes_at,
    rationale:  `Auto-created from the official ${f.competition} fixture ${f.homeTeam} vs ${f.awayTeam} on ${dateStr}. Opens at an even 50/50 line (no model edge applied); resolves on the official full-time match result the day after kickoff.`,
  }
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

  const { data: sourceRow } = await supabase
    .from('api_sources')
    .select('enabled')
    .eq('name', 'football-data.org')
    .single()

  const isEnabled = sourceRow?.enabled ?? false

  if (!isEnabled || !FOOTBALL_DATA_KEY) {
    await supabase.from('cron_run_log').insert({
      job_name: 'seed-sports-markets', started_at: runStart.toISOString(),
      feeds_active: 0, headlines_fetched: 0, viable_count: 0,
      inserted_count: 0, skipped_count: 0,
      duration_ms: Date.now() - runStart.getTime(),
    })
    return new Response(JSON.stringify({ ok: true, message: 'football-data.org disabled or key missing' }))
  }

  // Dedup against open sports markets
  const { data: existing } = await supabase
    .from('markets')
    .select('question')
    .eq('category', 'sports')
    .in('status', ['live', 'pending_ai', 'ai_ready', 'pending_mm_review'])
    .order('created_at', { ascending: false })
    .limit(100)

  const existingQuestions = (existing ?? []).map(m => m.question)

  const fixtures = await fetchUpcomingFixtures()
  await supabase.rpc('track_api_call', { p_api_name: 'football-data.org' })

  let inserted = 0
  let skipped  = 0

  for (const fixture of fixtures) {
    const { question, closes_at, rationale } = fixtureToMarket(fixture)

    if (tooSimilar(question, existingQuestions)) { skipped++; continue }

    const { error } = await supabase.from('markets').insert({
      question,
      category:          'sports',
      fee_category:      'sports',
      yes_price:         50,
      spread_cents:      2,
      ai_confidence:     70,
      status:            'pending_ai',
      creator_type:      'ai_system',
      resolution_source: `Official match result — ${fixture.competition}`,
      closes_at,
      source_feed:       'football-data.org',
      ai_rationale:      rationale,
      volume:            0,
    })

    if (!error) {
      existingQuestions.push(question)
      inserted++
    }
  }

  await supabase.from('cron_run_log').insert({
    job_name:          'seed-sports-markets',
    started_at:        runStart.toISOString(),
    feeds_active:      1,
    headlines_fetched: fixtures.length,
    viable_count:      fixtures.length - skipped,
    inserted_count:    inserted,
    skipped_count:     skipped,
    duration_ms:       Date.now() - runStart.getTime(),
  })

  return new Response(
    JSON.stringify({ ok: true, inserted, skipped, fixtures: fixtures.length }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
