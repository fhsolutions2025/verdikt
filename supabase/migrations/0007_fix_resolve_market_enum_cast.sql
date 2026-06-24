-- Fix resolve_market: add ::transaction_type cast to wallet_transactions insert
-- wallet_transactions.type is a transaction_type enum; text literals need explicit casts.
create or replace function resolve_market(
  p_market_id uuid,
  p_outcome   market_outcome
)
returns jsonb
language plpgsql security definer as $$
declare
  v_pos      record;
  v_payout   numeric;
  v_resolved integer := 0;
begin
  update markets
  set status      = 'resolved',
      outcome     = p_outcome,
      resolved_at = now()
  where id = p_market_id and status = 'live';

  if not found then
    raise exception 'Market % not live', p_market_id;
  end if;

  for v_pos in
    select p.*, w.id as wallet_id
    from positions p
    join wallets w on w.player_id = p.player_id
    where p.market_id = p_market_id and p.status = 'open'
  loop
    if p_outcome = 'void' then
      v_payout := v_pos.entry_value;

      update positions
      set status       = 'voided',
          closed_at    = now(),
          realized_pnl = 0
      where id = v_pos.id;

    elsif (p_outcome = 'yes' and v_pos.side = 'yes')
       or (p_outcome = 'no'  and v_pos.side = 'no') then
      v_payout := v_pos.shares;

      update positions
      set status       = 'resolved_won',
          closed_at    = now(),
          realized_pnl = v_payout - v_pos.entry_value
      where id = v_pos.id;

    else
      v_payout := 0;

      update positions
      set status       = 'resolved_lost',
          closed_at    = now(),
          realized_pnl = -v_pos.entry_value
      where id = v_pos.id;
    end if;

    if v_payout > 0 then
      update wallets set balance = balance + v_payout
      where id = v_pos.wallet_id;

      insert into wallet_transactions (
        wallet_id, type, amount, related_market_id, description
      ) values (
        v_pos.wallet_id,
        'payout'::transaction_type,
        v_payout, p_market_id,
        case when p_outcome = 'void' then 'Void refund'
             else 'Resolution payout (' || p_outcome::text || ')' end
      );
    end if;

    v_resolved := v_resolved + 1;
  end loop;

  insert into audit_log (type, description, market_id)
  values (
    'resolve',
    'Market resolved: ' || p_outcome::text || ', ' || v_resolved || ' positions settled',
    p_market_id
  );

  return jsonb_build_object(
    'outcome',           p_outcome,
    'positions_settled', v_resolved
  );
end;
$$;
