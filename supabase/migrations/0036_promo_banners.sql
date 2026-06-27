-- 0036 — promo_banners: home-screen carousel slides (Visual theme)
--
-- Ordered, multi-slide replacement for the single hero_cta_banner asset. Each
-- banner is an image (re-hosted into the marketing-media bucket, like page_assets)
-- plus overlay headline/subtext/CTA. Managed from the Company → Banners tab.
-- Reads are public but only for active banners; writes happen via the service-role
-- key in the admin banners routes (bypasses RLS), mirroring page_assets (0028).

create table if not exists promo_banners (
  id          uuid        primary key default gen_random_uuid(),
  image_url   text        not null default '',
  headline    text        not null default '',
  subtext     text        not null default '',
  cta_label   text        not null default '',
  cta_href    text        not null default '/player',
  sort_order  integer     not null default 0,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists promo_banners_order_idx
  on promo_banners (sort_order) where is_active;

alter table promo_banners enable row level security;

-- Players (anon or authenticated) may read only active banners.
drop policy if exists "promo_banners: public read active" on promo_banners;
create policy "promo_banners: public read active"
  on promo_banners for select
  using (is_active);

-- No insert/update/delete policies: writes go through the service-role admin routes.
