-- Enable pg_net so the scheduled cron job can call net.http_post to invoke
-- the simulate-trading edge function over HTTP.
create extension if not exists pg_net schema extensions;
