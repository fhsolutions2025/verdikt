-- 0038 — mkt_video_jobs: durable fal video render jobs (stops "charged but not delivered")
--
-- fal `submit` is a durable queue job: the moment it's accepted fal runs + bills it,
-- even if our app never retrieves the result. Previously we held the result only in
-- memory during one request, so a slow render (Kling 3.0 Pro ~120-215s) or a user
-- navigating away discarded the billed clip. We now persist every submit here and
-- reconcile by request_id, so a paid render is never lost or re-paid.
--
-- Writes happen via the service-role key in the admin video route (bypasses RLS);
-- admins may read (observability), mirroring the other mkt_* tables.

create table if not exists mkt_video_jobs (
  id            uuid        primary key default gen_random_uuid(),
  model         text        not null,                 -- fal endpoint actually submitted
  model_label   text        not null default '',      -- friendly label for the UI
  request_id    text,                                  -- fal tracking id (set right after submit)
  status_url    text,                                  -- fal-returned poll urls (avoid path reconstruction)
  response_url  text,
  prompt        text        not null default '',
  is_draft      boolean     not null default false,
  aspect        text        not null default '16:9',
  duration      integer,
  resolution    text,
  audio         boolean     not null default false,
  status        text        not null default 'pending'
                check (status in ('pending','processing','completed','failed')),
  video_url     text,                                  -- re-hosted Storage url when completed
  cost_est      numeric     not null default 0,
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists mkt_video_jobs_created_idx on mkt_video_jobs (created_at desc);
create index if not exists mkt_video_jobs_status_idx  on mkt_video_jobs (status);
create index if not exists mkt_video_jobs_request_idx on mkt_video_jobs (request_id);

alter table mkt_video_jobs enable row level security;

-- Admin-only read (observability). Writes go through the service-role admin route.
drop policy if exists "mkt_video_jobs: admin read" on mkt_video_jobs;
create policy "mkt_video_jobs: admin read"
  on mkt_video_jobs for select
  using (is_admin());
