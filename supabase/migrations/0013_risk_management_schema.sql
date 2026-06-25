-- RISK_MANAGEMENT.md §4 schema additions

-- §4.3 — add 'risk_alert' to audit_type enum (must precede view creation)
alter type audit_type add value if not exists 'risk_alert';

-- §4.1 — ai_call_log: observability for every LLM call made by the platform
create table if not exists ai_call_log (
  id                uuid        primary key default gen_random_uuid(),
  call_type         text        not null,   -- 'risk_brief' | 'byv_normalization' | 'ai_ready_pricing'
  model             text        not null,   -- e.g. 'claude-haiku-4-5-20251001'
  input_tokens      integer,
  output_tokens     integer,
  latency_ms        integer,
  success           boolean     not null,
  error_message     text,
  related_market_id uuid        references markets(id),
  created_at        timestamptz not null default now()
);

create index if not exists idx_ai_call_log_time on ai_call_log(created_at desc);

-- §4.2 — v_market_risk_status: live imbalance state across all live markets.
-- Canonical source for is_imbalanced — client code must read this, never recompute.
-- Threshold mirrors BUSINESS_LOGIC.md §4 / lib/calculations.ts isMarketImbalanced.
create or replace view v_market_risk_status as
select
  m.*,
  (m.yes_price > 70 or m.yes_price < 30)              as is_imbalanced,
  case
    when m.yes_price > 70 or m.yes_price < 30 then 'orange'
    else 'green'
  end                                                  as risk_tier
from markets m
where m.status = 'live';

-- §4.4 — api_sources: registry of external data dependencies with licence metadata
create table if not exists api_sources (
  id                    uuid        primary key default gen_random_uuid(),
  name                  text        not null unique,
  category              text        not null,
  license_tier          text        not null, -- 'free_unrestricted' | 'free_demo_only' | 'metered' | 'paid_required_at_scale'
  commercial_note       text,
  rate_limit_per_minute integer,
  created_at            timestamptz not null default now()
);

-- §4.4 — api_rate_limits: per-minute call counts, checked before every external call
create table if not exists api_rate_limits (
  api_name     text        not null,
  window_start timestamptz not null,
  call_count   integer     not null default 0,
  primary key (api_name, window_start)
);

-- Seed canonical api_sources per RISK_MANAGEMENT §6
insert into api_sources (name, category, license_tier, commercial_note, rate_limit_per_minute)
values
  ('Frankfurter',
   'finance',
   'free_unrestricted',
   null,
   null),
  ('football-data.org',
   'sports',
   'free_demo_only',
   'Free tier: fixtures/results/tables only — no odds. African domestic leagues not covered. Paid plan required for commercial use.',
   10),
  ('Firecrawl',
   'scraping',
   'metered',
   '5,000 pages/month on current plan. Upgrade required for production scale.',
   null),
  ('ACLED',
   'politics',
   'free_demo_only',
   'Licensed for non-commercial/research use only. Paid plan required before any commercial deployment.',
   null),
  ('NewsAPI.org',
   'news',
   'free_demo_only',
   'Development use only per terms of service. Paid plan required for production/commercial use.',
   null),
  ('Claude (Haiku 4.5)',
   'ai',
   'paid_required_at_scale',
   'Token-metered via Anthropic API. API key stored in Supabase Edge Function secrets only — never in Vercel env or client.',
   null)
on conflict (name) do nothing;
