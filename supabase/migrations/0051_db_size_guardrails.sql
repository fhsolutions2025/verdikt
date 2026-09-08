-- Precaution layer on top of 0050's cleanup: close the remaining unbounded-growth
-- gaps and add a proactive size check so the DB never silently clogs again.
--
--   1. Extend the daily prune job to cover ai_call_log + cron_run_log — the two
--      per-event log tables that had no retention and were not part of 0050's fix.
--   2. Add db_size_status(): a cheap function reporting current size, % of a
--      configurable cap, and a warn flag — queryable ad hoc or from a dashboard.
--   3. Log a WARN row into a tiny db_size_alerts table whenever the daily prune
--      run finds the DB over the warn threshold (default 400 MB, ~80% of the
--      500 MB free-tier cap), so there's a durable, checkable trail instead of
--      finding out only when something breaks.

create table if not exists db_size_alerts (
  id bigint generated always as identity primary key,
  checked_at timestamptz not null default now(),
  total_bytes bigint not null,
  warn_threshold_bytes bigint not null,
  message text not null
);
alter table db_size_alerts enable row level security;
drop policy if exists "admin read db_size_alerts" on db_size_alerts;
create policy "admin read db_size_alerts" on db_size_alerts for select
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- Ad hoc / dashboard-callable size check. warn_mb defaults to 400 (80% of the
-- 500 MB free-tier cap) — pass a different value for a paid-tier cap.
create or replace function db_size_status(warn_mb integer default 400)
returns table (total_bytes bigint, total_pretty text, warn_threshold_mb integer, over_warn boolean)
language sql
stable
as $$
  select
    pg_database_size(current_database()),
    pg_size_pretty(pg_database_size(current_database())),
    warn_mb,
    pg_database_size(current_database()) > (warn_mb::bigint * 1024 * 1024);
$$;

-- Extend the recurring prune (0050) to also cover ai_call_log + cron_run_log, and
-- to log a db_size_alerts row when still over the warn threshold after pruning.
create or replace function prune_operational_data()
returns void
language plpgsql
security definer
set search_path = public, cron
as $$
declare
  v_total bigint;
  v_warn_bytes bigint := 400 * 1024 * 1024; -- 400 MB
begin
  delete from trades where is_simulated = true and created_at < now() - interval '7 days';
  delete from audit_log where type = 'trade' and created_at < now() - interval '30 days';
  delete from price_ticks where recorded_at < now() - interval '30 days';
  delete from cron.job_run_details where start_time < now() - interval '3 days';
  delete from api_rate_limits where window_start < now() - interval '2 days';

  -- New: the two per-event logs that had no retention before this migration.
  delete from ai_call_log where created_at < now() - interval '60 days';
  delete from cron_run_log where started_at < now() - interval '60 days';

  v_total := pg_database_size(current_database());
  if v_total > v_warn_bytes then
    insert into db_size_alerts (total_bytes, warn_threshold_bytes, message)
    values (
      v_total, v_warn_bytes,
      'Database size ' || pg_size_pretty(v_total) || ' exceeds the ' ||
      pg_size_pretty(v_warn_bytes) || ' precaution threshold after the daily prune. ' ||
      'Check pg_stat_user_tables for the growth source before it reaches the plan cap.'
    );
  end if;
end;
$$;

-- Re-affirm the daily schedule (idempotent; 0050 already created it).
select cron.unschedule(jobid) from cron.job where jobname = 'prune-operational-data';
select cron.schedule('prune-operational-data', '0 3 * * *', 'select prune_operational_data()');
