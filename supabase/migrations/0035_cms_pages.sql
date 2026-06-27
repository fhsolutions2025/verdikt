-- 0035 — cms_pages: company-authored info/legal pages shown to players
--
-- Slug-keyed content (about, privacy, terms, support, rewards) edited from the
-- Company → Content tab and rendered read-only at /player/info/<slug>. Body is
-- light markdown. Reads are public but only for published pages; writes happen
-- exclusively via the service-role key in the admin CMS route (bypasses RLS),
-- mirroring page_assets (0028).

create table if not exists cms_pages (
  slug         text        primary key,
  title        text        not null default '',
  body         text        not null default '',
  is_published boolean     not null default true,
  updated_at   timestamptz not null default now(),
  updated_by   uuid        references profiles(id)
);

alter table cms_pages enable row level security;

-- Players (anon or authenticated) may read only published pages.
drop policy if exists "cms_pages: public read published" on cms_pages;
create policy "cms_pages: public read published"
  on cms_pages for select
  using (is_published);

-- No insert/update/delete policies: writes go through the service-role admin route.

-- Seed the five info pages with placeholder copy (idempotent).
insert into cms_pages (slug, title, body) values
  ('about',   'About Verdikt',   '# About Verdikt

Verdikt is a play-money prediction market. Turn your read on the world into positions across sports, finance and current affairs.

_Edit this page from the Company → Content tab._'),
  ('rewards', 'Rewards',         '# Rewards

Earn rewards as you trade and climb the leaderboard.

_Edit this page from the Company → Content tab._'),
  ('privacy', 'Privacy Policy',  '# Privacy Policy

This is placeholder privacy content.

_Edit this page from the Company → Content tab._'),
  ('terms',   'Terms of Service','# Terms of Service

This is placeholder terms content.

_Edit this page from the Company → Content tab._'),
  ('support', 'Support',         '# Support

Need help? Reach the Verdikt team here.

_Edit this page from the Company → Content tab._')
on conflict (slug) do nothing;
