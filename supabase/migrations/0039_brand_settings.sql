-- 0039 — brand_settings: the workspace Brand Kit, moved off localStorage into Supabase
--
-- Single-row settings (id='default'): palette, voice/tone, visual style, logo
-- description, auto-inject flag, and the saved logo image URL (re-hosted into the
-- marketing-media bucket so it never expires). Admin-only; writes via the
-- service-role admin routes.

create table if not exists brand_settings (
  id               text        primary key default 'default',
  colors           jsonb       not null default '[]'::jsonb,
  tone             text        not null default '',
  visual_style     text        not null default '',
  logo_description text        not null default '',
  auto_inject      boolean     not null default true,
  logo_url         text,
  updated_at       timestamptz not null default now()
);

insert into brand_settings (id) values ('default') on conflict (id) do nothing;

alter table brand_settings enable row level security;

-- Admin read (the company workspace is admin-only). Writes go through the
-- service-role admin routes.
drop policy if exists "brand_settings: admin read" on brand_settings;
create policy "brand_settings: admin read"
  on brand_settings for select
  using (is_admin());
