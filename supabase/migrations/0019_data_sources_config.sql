-- 0019: data source config, price cache, politics→current_affairs migration

-- ── 1. Enable/disable per data source ──────────────────────────────────────
alter table api_sources add column if not exists enabled boolean not null default true;

-- ── 2. Price cache — populated by normalize-byv-market every 2 min ─────────
create table if not exists price_cache (
  symbol     text        primary key,  -- e.g. 'BTC', 'EUR', 'XAU'
  price      numeric     not null,
  label      text        not null,     -- display string e.g. 'BTC/USD'
  source     text        not null,     -- api_sources.name
  fetched_at timestamptz not null default now()
);

-- ── 3. RPC to toggle a source on/off from the company dashboard ─────────────
create or replace function toggle_api_source(p_name text, p_enabled bool)
returns void language sql security definer as $$
  update api_sources set enabled = p_enabled where name = p_name;
$$;

-- ── 4. Migrate politics markets → current_affairs ──────────────────────────
-- The enum value 'politics' stays to avoid a costly type rebuild;
-- we just move all data and remove the UI tab.
update markets set category = 'current_affairs' where category = 'politics';

-- ── 5. Seed RSS news sources ────────────────────────────────────────────────
insert into api_sources (name, category, license_tier, commercial_note, rate_limit_per_minute, enabled)
values
  ('BBC RSS',
   'news',
   'free_unrestricted',
   'Free public RSS (BBC World News). No key required. Respectful polling only.',
   null,
   true),
  ('Al Jazeera RSS',
   'news',
   'free_unrestricted',
   'Free public RSS (Al Jazeera World). No key required.',
   null,
   true),
  ('Reuters RSS',
   'news',
   'free_unrestricted',
   'Free public RSS (Reuters World News). No key required.',
   null,
   true)
on conflict (name) do nothing;
