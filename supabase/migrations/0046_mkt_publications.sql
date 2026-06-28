-- 0046 — Publishing records (VERDIKT Marketing Studio § Publishing)
--
-- Tracks where each approved asset was published. The Home Carousel target writes a
-- live promo_banners row (visible on the player home); other channels record an
-- export (no live social API integration yet). Only approved artifacts may publish.
create table if not exists mkt_publications (
  id            uuid primary key default gen_random_uuid(),
  artifact_id   uuid references mkt_artifacts(id) on delete set null,
  campaign_id   uuid,
  channel       text not null,                 -- home_carousel | instagram | export | ...
  target        text,                          -- e.g. promo_banner id / external ref
  status        text not null default 'published', -- published | exported | failed
  url           text,
  published_by  uuid,
  published_at  timestamptz not null default now()
);
create index if not exists mkt_publications_campaign_idx on mkt_publications (campaign_id, published_at desc);
create index if not exists mkt_publications_artifact_idx on mkt_publications (artifact_id);

alter table mkt_publications enable row level security;
drop policy if exists "mkt_publications: admin read" on mkt_publications;
create policy "mkt_publications: admin read" on mkt_publications for select using (is_admin());
