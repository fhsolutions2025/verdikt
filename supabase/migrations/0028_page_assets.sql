-- 0028 — page_assets: product imagery for the Visual theme (Theme 2)
--
-- Distinct from marketing_assets (free-form campaign gallery). page_assets is a
-- slot-keyed catalogue: exactly one ACTIVE image per slot_key, older versions
-- retained inactive for history/rollback. Slot keys come from lib/pageAssets.ts:
--   - category thumbnails:  market_thumb_<category>  (e.g. market_thumb_sports)
--   - per-market override:   market:<market_id>
--   - hero / empty states:   hero_cta_banner, empty_positions, …
--
-- Images are re-hosted into the existing public `marketing-media` bucket under a
-- `page/` prefix (Ideogram URLs are temporary). Reads are public (players need
-- the live image); writes are service-role only (admin routes use service key).

create table if not exists page_assets (
  id            uuid        primary key default gen_random_uuid(),
  slot_key      text        not null,
  is_active     boolean     not null default true,
  public_url    text        not null,
  storage_path  text        not null,
  width         integer,
  height        integer,
  aspect_ratio  text,
  prompt        text,
  alt_text      text        not null default '',
  seo_tags      text[]      not null default '{}',
  seed          bigint,
  cost_usd      numeric     not null default 0.08,
  created_by    uuid        references profiles(id),
  created_at    timestamptz not null default now()
);

-- Exactly one active image per slot.
create unique index if not exists page_assets_one_active
  on page_assets (slot_key) where is_active;

-- Fast lookup of the active asset for a slot.
create index if not exists page_assets_slot_idx
  on page_assets (slot_key) where is_active;

alter table page_assets enable row level security;

-- Players (anon or authenticated) may read only the live image for each slot.
drop policy if exists "page_assets: public read active" on page_assets;
create policy "page_assets: public read active"
  on page_assets for select
  using (is_active);

-- No insert/update/delete policies: writes happen exclusively via the
-- service-role key in the admin Page Design routes, which bypasses RLS.
