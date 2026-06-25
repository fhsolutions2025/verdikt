-- Schedule normalize-byv-market edge function every 2 minutes.
-- Separate job from simulate-trading (which runs every minute).
-- Anon key is public/safe per TECH_SPEC §6.
select cron.schedule(
  'normalize-byv-market-every-2-minutes',
  '*/2 * * * *',
  $$
  select net.http_post(
    url     := 'https://mqptajyjasrgsfcxkhnw.supabase.co/functions/v1/normalize-byv-market',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xcHRhanlqYXNyZ3NmY3hraG53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyODQwNTcsImV4cCI6MjA5Nzg2MDA1N30.CrkWXw1CcxUe7sARxWSkOkVKncpQH5sLIeaH6J1Yg3w"}'::jsonb,
    body    := '{}'::jsonb
  )
  $$
);
