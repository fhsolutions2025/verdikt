-- 0024: Register sports + finance seeder edge functions in pg_cron
-- and ensure their API sources are in api_sources.

-- ── 1. Register football-data.org in api_sources (if not present) ─────────────
insert into api_sources (name, category, license_tier, commercial_note, rate_limit_per_minute)
values (
  'football-data.org',
  'sports',
  'free_tier',
  'Free tier: 10 calls/min, major European leagues + World Cup/Euros. Fixtures, standings, results. Commercial use requires paid plan.',
  10
)
on conflict (name) do nothing;

-- ── 2. Ensure Frankfurter is registered ───────────────────────────────────────
insert into api_sources (name, category, license_tier, commercial_note, rate_limit_per_minute)
values (
  'Frankfurter',
  'finance',
  'open_source',
  'Open-source ECB exchange rate API. No key required. ~10k req/day. Covers 30+ currencies.',
  60
)
on conflict (name) do nothing;

-- ── 3. Ensure Alpha Vantage is registered ─────────────────────────────────────
insert into api_sources (name, category, license_tier, commercial_note, rate_limit_per_minute)
values (
  'Alpha Vantage',
  'finance',
  'free_tier',
  'Free tier: 25 calls/day, 5 calls/min. Covers forex, commodities (gold/silver), equities. Premium required for real-time & higher limits.',
  5
)
on conflict (name) do nothing;

-- ── 4. Cron: seed-sports-markets every 6 hours ────────────────────────────────
select cron.schedule(
  'seed-sports-markets-every-6-hours',
  '0 */6 * * *',
  $$
  select net.http_post(
    url     := 'https://mqptajyjasrgsfcxkhnw.supabase.co/functions/v1/seed-sports-markets',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xcHRhanlqYXNyZ3NmY3hraG53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyODQwNTcsImV4cCI6MjA5Nzg2MDA1N30.CrkWXw1CcxUe7sARxWSkOkVKncpQH5sLIeaH6J1Yg3w"}'::jsonb,
    body    := '{}'::jsonb
  )
  $$
);

-- ── 5. Cron: seed-finance-markets every 4 hours ───────────────────────────────
select cron.schedule(
  'seed-finance-markets-every-4-hours',
  '0 */4 * * *',
  $$
  select net.http_post(
    url     := 'https://mqptajyjasrgsfcxkhnw.supabase.co/functions/v1/seed-finance-markets',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xcHRhanlqYXNyZ3NmY3hraG53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyODQwNTcsImV4cCI6MjA5Nzg2MDA1N30.CrkWXw1CcxUe7sARxWSkOkVKncpQH5sLIeaH6J1Yg3w"}'::jsonb,
    body    := '{}'::jsonb
  )
  $$
);
