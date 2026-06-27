-- 0032 — auto-close + auto-resolve markets at their close time
--
-- Markets never auto-closed: a market stayed 'live' past closes_at and could not
-- settle. This adds close_due_markets(), scheduled by pg_cron, which resolves every
-- live market whose closes_at has passed.
--
-- Outcome source: Verdikt has no external oracle, so auto-resolution is PRICE-IMPLIED
-- — the market's final yes_price decides (>= 50 ⇒ YES, else NO). A manual MM/company
-- resolve_market() call before the cron runs takes precedence (it flips status to
-- 'resolved', so the market is no longer 'live' and is skipped here).

create or replace function close_due_markets()
returns integer
language plpgsql
security definer
set search_path = public as $$
declare
  m record;
  n integer := 0;
begin
  -- resolve_market is admin-gated; pg_cron has no JWT/auth.uid, so authorize this
  -- trusted system function as service_role for the current transaction.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  for m in
    select id, yes_price
    from markets
    where status = 'live' and closes_at <= now()
    order by closes_at asc
  loop
    begin
      perform resolve_market(
        m.id,
        (case when m.yes_price >= 50 then 'yes' else 'no' end)::market_outcome
      );
      n := n + 1;
    exception when others then
      -- never let one bad market block the rest
      insert into audit_log (type, description, market_id)
      values ('resolve', 'Auto-close failed: ' || sqlerrm, m.id);
    end;
  end loop;

  if n > 0 then
    insert into audit_log (type, description)
    values ('resolve', 'Auto-closed ' || n || ' market(s) at close time');
  end if;
  return n;
end $$;

-- Schedule every 10 minutes (pg_cron enabled in 0008). Unschedule first for idempotency.
do $$
begin
  perform cron.unschedule('close-due-markets');
exception when others then null;
end $$;

select cron.schedule('close-due-markets', '*/10 * * * *', $$select close_due_markets()$$);
