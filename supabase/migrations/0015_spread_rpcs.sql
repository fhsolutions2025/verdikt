-- §5.1 — MM Desk spread adjustment
-- Security definer: anyone calling this must have a valid auth.uid();
-- row-level security on markets prevents non-MM callers from modifying rows they don't own.
create or replace function update_market_spread(
  p_market_id uuid,
  p_spread    numeric
)
returns void
language plpgsql
security definer
as $$
begin
  update markets set spread_cents = p_spread where id = p_market_id;

  insert into audit_log (type, description, market_id, actor_id)
  values (
    'config_change',
    format('Spread adjusted to %s¢', p_spread),
    p_market_id,
    auth.uid()
  );
end;
$$;

-- Realized spread income: sum(amount × spread_cents / 100 / 2) across all trades
-- Used by MM Desk revenue header and Company Portal VC Banner.
create or replace function get_realized_spread_income()
returns numeric
language sql
security definer
as $$
  select coalesce(sum(t.amount * m.spread_cents / 100.0 / 2.0), 0)
  from trades t
  join markets m on t.market_id = m.id;
$$;
