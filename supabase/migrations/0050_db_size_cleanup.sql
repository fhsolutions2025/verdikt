-- DB-over-limit fix: the platform was accumulating ~656 MB, almost entirely from
-- simulate-trading-every-minute running every single minute forever (99.998% of all
-- `trades` rows are is_simulated=true — 654,588 synthetic vs 13 real). Each simulated
-- trade also writes one row into audit_log(type='trade') and price_ticks via
-- execute_trade(), so those two tables bloated in lockstep. cron.job_run_details
-- (pg_cron's own execution log) and api_rate_limits also grew with no retention.
--
-- Fix:
--   1. Slow the simulated-trading cadence from every minute to every 15 minutes.
--   2. One-time purge of old operational/log data (trades ledger is otherwise kept
--      forever for real trades; audit_log/price_ticks are operational telemetry, not
--      the system of record — trades + wallet_transactions remain that).
--   3. A recurring daily prune job so this doesn't re-bloat.

-- 1) Slow the simulated-trading cron (was '* * * * *').
select cron.alter_job(job_id := 2, schedule := '*/15 * * * *')
where exists (select 1 from cron.job where jobid = 2 and jobname = 'simulate-trading-every-minute');

-- 2) One-time purge.
-- Simulated trades older than 7 days (all real trades, is_simulated=false, are kept forever).
delete from trades where is_simulated = true and created_at < now() - interval '7 days';

-- Trade-audit telemetry older than 30 days (trades/wallet_transactions remain the ledger).
delete from audit_log where type = 'trade' and created_at < now() - interval '30 days';

-- Price-tick history older than 30 days (used only for recent-movement sparklines).
delete from price_ticks where recorded_at < now() - interval '30 days';

-- pg_cron's own run log — standard maintenance, zero product value.
delete from cron.job_run_details where start_time < now() - interval '3 days';

-- Expired rate-limit windows.
delete from api_rate_limits where window_start < now() - interval '2 days';

-- 3) Recurring prune so the same tables don't re-bloat.
create or replace function prune_operational_data()
returns void
language plpgsql
security definer
set search_path = public, cron
as $$
begin
  delete from trades where is_simulated = true and created_at < now() - interval '7 days';
  delete from audit_log where type = 'trade' and created_at < now() - interval '30 days';
  delete from price_ticks where recorded_at < now() - interval '30 days';
  delete from cron.job_run_details where start_time < now() - interval '3 days';
  delete from api_rate_limits where window_start < now() - interval '2 days';
end;
$$;

select cron.unschedule(jobid) from cron.job where jobname = 'prune-operational-data';
select cron.schedule('prune-operational-data', '0 3 * * *', 'select prune_operational_data()');
