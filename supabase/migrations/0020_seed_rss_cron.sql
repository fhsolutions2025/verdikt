-- Schedule seed-rss-markets edge function every 15 minutes.
-- Generates current_affairs markets from BBC/Al Jazeera/Reuters RSS feeds.
select cron.schedule(
  'seed-rss-markets-every-15-minutes',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://mqptajyjasrgsfcxkhnw.supabase.co/functions/v1/seed-rss-markets',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1xcHRhanlqYXNyZ3NmY3hraG53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyODQwNTcsImV4cCI6MjA5Nzg2MDA1N30.CrkWXw1CcxUe7sARxWSkOkVKncpQH5sLIeaH6J1Yg3w"}'::jsonb,
    body    := '{}'::jsonb
  )
  $$
);
