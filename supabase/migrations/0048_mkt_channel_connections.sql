-- 0048 — Social channel connections (VERDIKT Marketing Studio § Publishing)
--
-- Per-channel publishing credentials (operator-supplied OAuth tokens + account ids).
-- Admin-only RLS; the access token is never returned to the client unmasked. When a
-- connection exists with status 'connected', the publisher posts live to that channel;
-- otherwise publishing records an export.
create table if not exists mkt_channel_connections (
  channel       text primary key,             -- instagram | facebook | linkedin | x
  account_id    text,                          -- e.g. IG business user id / page id
  access_token  text,                          -- operator-supplied OAuth token
  status        text not null default 'connected', -- connected | disconnected
  meta          jsonb not null default '{}'::jsonb,
  connected_by  uuid,
  connected_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table mkt_channel_connections enable row level security;
-- Admin-only read; writes go through the service-role admin route (bypasses RLS).
drop policy if exists "mkt_channel_connections: admin read" on mkt_channel_connections;
create policy "mkt_channel_connections: admin read" on mkt_channel_connections for select using (is_admin());
