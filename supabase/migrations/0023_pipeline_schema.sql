-- 0023: pipeline observability, source feed tracking, missing RPC + CoinGecko registration

-- ── 1. source_feed on markets (unconstrained — sports/finance sources added later) ──
alter table markets
  add column if not exists source_feed text;

-- Drop any previous constraint from dev iterations
alter table markets
  drop constraint if exists markets_source_feed_check;

-- ── 2. from_cache on ai_call_log (idempotent — 0014 may already have it) ──────
alter table ai_call_log
  add column if not exists from_cache boolean not null default false;

-- ── 3. cron_run_log ───────────────────────────────────────────────────────────
create table if not exists cron_run_log (
  id                uuid        primary key default gen_random_uuid(),
  job_name          text        not null,
  started_at        timestamptz not null default now(),
  feeds_active      integer,
  headlines_fetched integer,
  viable_count      integer,
  inserted_count    integer,
  skipped_count     integer,
  error_text        text,
  duration_ms       integer
);

alter table cron_run_log enable row level security;

create policy "cron_run_log: admin read"
  on cron_run_log for select
  using (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ── 4. track_api_call RPC ─────────────────────────────────────────────────────
-- Called by edge functions after each external API fetch.
-- Upserts a per-minute window counter into api_rate_limits.
create or replace function track_api_call(p_api_name text)
returns void language sql security definer as $$
  insert into api_rate_limits (api_name, window_start, call_count)
  values (p_api_name, date_trunc('minute', now()), 1)
  on conflict (api_name, window_start)
  do update set call_count = api_rate_limits.call_count + 1;
$$;

-- ── 5. Register CoinGecko in api_sources ──────────────────────────────────────
-- Used in normalize-byv-market for crypto prices but was never registered.
insert into api_sources (name, category, license_tier, commercial_note, rate_limit_per_minute)
values (
  'CoinGecko',
  'finance',
  'free_demo_only',
  'Demo API. 30 calls/min, 10k credits/month. Covers BTC, ETH, SOL, XRP, DOGE spot prices. Paid plan required for OHLCV and historical data.',
  30
)
on conflict (name) do nothing;
