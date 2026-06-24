-- Replace the cron job to use the anon key in the Authorization header.
-- The simulate-trading edge function does not validate the incoming bearer
-- token; it authenticates to Postgres using SUPABASE_SERVICE_ROLE_KEY from its
-- own Deno environment. The anon key below is a public, client-safe JWT.
select cron.unschedule('simulate-trading-every-minute');

select cron.schedule(
  'simulate-trading-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://mqptajyjasrgsfcxkhnw.supabase.co/functions/v1/simulate-trading',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xcHRhanlqYXNyZ3NmY3hraG53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyODQwNTcsImV4cCI6MjA5Nzg2MDA1N30.CrkWXw1CcxUe7sARxWSkOkVKncpQH5sLIeaH6J1Yg3w"}'::jsonb,
    body    := '{}'::jsonb
  )
  $$
);
