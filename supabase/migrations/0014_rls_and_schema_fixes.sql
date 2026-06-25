-- Fix gaps identified in code review of migration 0013:
-- 1. RLS on ai_call_log, api_sources, api_rate_limits (missing from 0013)
-- 2. Add from_cache boolean to ai_call_log (prevents error_message sentinel abuse)

-- ─── RLS — ai_call_log ───────────────────────────────────────
-- Operational / internal data: admin read only. Edge functions write via service_role.
alter table ai_call_log enable row level security;

create policy "ai_call_log: admin read"
  on ai_call_log for select
  using (exists (
    select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

-- ─── RLS — api_sources ───────────────────────────────────────
-- Registry of external data sources: any authed user may read (shown in Company Portal).
-- Write is migration-only (no client path).
alter table api_sources enable row level security;

create policy "api_sources: any authed read"
  on api_sources for select using (auth.uid() is not null);

-- ─── RLS — api_rate_limits ───────────────────────────────────
-- Per-minute call counters written by Edge Functions (service_role).
-- Admin read only from the portal; no client write path.
alter table api_rate_limits enable row level security;

create policy "api_rate_limits: admin read"
  on api_rate_limits for select
  using (exists (
    select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

-- ─── ai_call_log: add from_cache column ──────────────────────
-- Canonical boolean for cache hits — avoids overloading error_message with
-- the 'cache_hit' sentinel string that forces every error consumer to
-- know a magic exclusion value.
alter table ai_call_log
  add column if not exists from_cache boolean not null default false;
