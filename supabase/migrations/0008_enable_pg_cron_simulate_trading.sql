-- Enable pg_cron and schedule the simulate-trading edge function every minute.
-- NOTE: cron.schedule only stores the command string; it is not executed at
-- schedule time. The job command is corrected in 0009 (auth key) and the
-- net.http_post dependency (pg_net) is enabled in 0010.
create extension if not exists pg_cron schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

select cron.schedule(
  'simulate-trading-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url    := 'https://mqptajyjasrgsfcxkhnw.supabase.co/functions/v1/simulate-trading',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.service_role_key', true) || '"}'::jsonb,
    body   := '{}'::jsonb
  )
  $$
);
