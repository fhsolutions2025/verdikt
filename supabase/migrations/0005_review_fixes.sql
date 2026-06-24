-- ============================================================
-- Post-review fixes — correctness + security hardening
-- ============================================================

-- ─── 1. Fix sell_position: return value double-counted balance ──
-- v_wallet is re-queried AFTER the UPDATE so balance already includes
-- v_curr_value; the original `v_wallet.balance + v_curr_value` was wrong.
create or replace function sell_position(
  p_position_id uuid,
  p_player_id   uuid
)
returns jsonb
language plpgsql security definer as $$
declare
  v_pos        positions%rowtype;
  v_market     markets%rowtype;
  v_curr_price numeric;
  v_curr_value numeric;
  v_pnl        numeric;
  v_new_balance numeric;
begin
  select * into v_pos from positions
  where id = p_position_id and player_id = p_player_id and status = 'open'
  for update;

  if not found then
    raise exception 'Position % not found or not open', p_position_id;
  end if;

  select * into v_market from markets where id = v_pos.market_id;

  if v_pos.side = 'yes' then
    v_curr_price := v_market.yes_price;
  else
    v_curr_price := v_market.no_price;
  end if;

  v_curr_value := v_pos.shares * (v_curr_price / 100);
  v_pnl        := v_curr_value - v_pos.entry_value;

  update positions
  set status       = 'sold',
      closed_at    = now(),
      realized_pnl = v_pnl
  where id = p_position_id;

  -- Credit wallet and capture new balance in one step
  update wallets set balance = balance + v_curr_value
  where player_id = p_player_id
  returning balance into v_new_balance;

  insert into wallet_transactions (
    wallet_id, type, amount, related_market_id, description
  )
  select w.id, 'sell', v_curr_value, v_pos.market_id,
         'Sold position: ' || v_pos.side::text
  from wallets w where w.player_id = p_player_id;

  -- Audit type corrected: 'sell' not 'trade'
  insert into audit_log (type, description, amount, market_id, actor_id)
  values (
    'sell',
    'Position sold: ' || v_pos.side::text || ' P&L=' || round(v_pnl, 2)::text,
    v_curr_value, v_pos.market_id, p_player_id
  );

  return jsonb_build_object(
    'realized_pnl', v_pnl,
    'sale_value',   v_curr_value,
    'new_balance',  v_new_balance
  );
end;
$$;

-- ─── 2. Fix execute_trade: add p_amount > 0 guard ──────────────
create or replace function execute_trade(
  p_market_id  uuid,
  p_taker_id   uuid,
  p_side       order_side,
  p_amount     numeric,
  p_is_simulated boolean default false,
  p_simulated_trader_name text default null
)
returns jsonb
language plpgsql security definer as $$
declare
  v_market         markets%rowtype;
  v_fee_rate       numeric;
  v_price          numeric;
  v_shares         numeric;
  v_fee            numeric;
  v_total_cost     numeric;
  v_platform_share numeric;
  v_rebate_share   numeric;
  v_price_delta    numeric;
  v_new_yes_price  numeric;
  v_trade_id       uuid;
  v_position       positions%rowtype;
  v_wallet         wallets%rowtype;
  v_maker_order    orders%rowtype;
begin
  -- Guard: amount must be positive
  if p_amount <= 0 then
    raise exception 'Trade amount must be positive';
  end if;

  select * into v_market from markets
  where id = p_market_id and status = 'live'
  for update;

  if not found then
    raise exception 'Market % not found or not live', p_market_id;
  end if;

  select taker_fee_pct / 100 into v_fee_rate
  from fee_config
  where category = v_market.fee_category;

  if v_fee_rate is null then
    v_fee_rate := 0.01;
  end if;

  if p_side = 'yes' then
    v_price := v_market.yes_price;
  else
    v_price := v_market.no_price;
  end if;

  v_shares         := floor(p_amount / (v_price / 100));
  v_fee            := p_amount * v_fee_rate;
  v_total_cost     := p_amount + v_fee;
  v_platform_share := v_fee * 0.75;
  v_rebate_share   := v_fee * 0.25;

  if not p_is_simulated and p_taker_id is not null then
    select * into v_wallet from wallets
    where player_id = p_taker_id for update;

    if v_wallet.balance < v_total_cost then
      raise exception 'Insufficient balance';
    end if;

    update wallets set balance = balance - v_total_cost
    where player_id = p_taker_id;
  end if;

  select * into v_maker_order from orders
  where market_id = p_market_id
    and side = p_side
    and status in ('open', 'partially_filled')
  order by
    case when p_side = 'yes' then price end asc,
    case when p_side = 'no'  then price end asc,
    created_at asc
  limit 1;

  insert into trades (
    market_id, taker_id, maker_order_id, side,
    price, shares, amount, fee,
    platform_fee_share, maker_rebate_share,
    is_simulated, simulated_trader_name
  ) values (
    p_market_id, p_taker_id,
    case when v_maker_order.id is not null then v_maker_order.id end,
    p_side,
    v_price, v_shares, p_amount, v_fee,
    v_platform_share, v_rebate_share,
    p_is_simulated, p_simulated_trader_name
  ) returning id into v_trade_id;

  if v_maker_order.id is not null then
    update orders
    set shares_filled = shares_filled + v_shares,
        status = case
          when shares_filled + v_shares >= shares then 'filled'
          else 'partially_filled'
        end
    where id = v_maker_order.id;

    if v_maker_order.maker_id is not null then
      update wallets set balance = balance + v_rebate_share
      where player_id = v_maker_order.maker_id;

      insert into wallet_transactions (
        wallet_id, type, amount, related_market_id, related_trade_id, description
      )
      select w.id, 'maker_rebate', v_rebate_share, p_market_id, v_trade_id,
             'Maker rebate on trade'
      from wallets w where w.player_id = v_maker_order.maker_id;
    end if;
  end if;

  v_price_delta   := (case when p_side = 'yes' then 1 else -1 end)
                     * least(p_amount * 0.001, 5.0);
  v_new_yes_price := greatest(1, least(99, v_market.yes_price + v_price_delta));

  update markets
  set volume    = volume + p_amount,
      yes_price = v_new_yes_price
  where id = p_market_id;

  insert into price_ticks (market_id, price) values (p_market_id, v_new_yes_price);

  -- Position upsert only for real (non-simulated) trades with a taker
  if p_taker_id is not null then
    select * into v_position from positions
    where player_id = p_taker_id
      and market_id = p_market_id
      and side = p_side
      and status = 'open'
    limit 1;

    if v_position.id is not null then
      update positions
      set shares      = shares + v_shares,
          entry_value = entry_value + p_amount,
          entry_price = (entry_value + p_amount) / (shares + v_shares),
          fee_paid    = fee_paid + v_fee
      where id = v_position.id;
    else
      insert into positions (
        player_id, market_id, side, shares,
        entry_price, entry_value, fee_paid
      ) values (
        p_taker_id, p_market_id, p_side, v_shares,
        v_price, p_amount, v_fee
      );
    end if;

    insert into wallet_transactions (
      wallet_id, type, amount, related_market_id, related_trade_id, description
    )
    select w.id, 'trade', -v_total_cost, p_market_id, v_trade_id,
           'Trade: ' || p_side::text || ' on market'
    from wallets w where w.player_id = p_taker_id;
  end if;

  insert into audit_log (type, description, amount, fee, market_id, actor_id)
  values (
    'trade',
    case when p_is_simulated
         then 'Simulated trade [' || coalesce(p_simulated_trader_name,'Bot') || '] '
              || p_side::text || ' ' || p_amount::text
         else 'Trade: ' || p_side::text || ' ' || p_amount::text
    end,
    p_amount, v_fee, p_market_id, p_taker_id
  );

  return jsonb_build_object(
    'trade_id',       v_trade_id,
    'shares',         v_shares,
    'fee',            v_fee,
    'total_cost',     v_total_cost,
    'new_yes_price',  v_new_yes_price,
    'new_no_price',   100 - v_new_yes_price
  );
end;
$$;

-- ─── 3. Block any new mm_config rows (singleton guarantee) ─────
create policy "mm_config: block insert"
  on mm_config for insert
  with check (false);

-- ─── 4. Fix v_platform_totals: remove today-only filter ────────
-- Both v_platform_totals and v_operator_revenue now cover all-time,
-- so Company KPIs show consistent numbers.
create or replace view v_platform_totals as
select
  coalesce(sum(amount), 0)             as total_volume,
  coalesce(sum(platform_fee_share), 0) as total_platform_fees,
  coalesce(sum(maker_rebate_share), 0) as total_maker_rebates
from trades;

-- ─── 5. Add reject_ai_market RPC ───────────────────────────────
create or replace function reject_ai_market(
  p_market_id uuid,
  p_mm_id     uuid
)
returns jsonb
language plpgsql security definer as $$
begin
  update markets
  set status = 'voided'
  where id = p_market_id
    and status in ('ai_ready', 'pending_mm_review');

  if not found then
    raise exception 'Market % not in ai_ready/pending_mm_review state', p_market_id;
  end if;

  insert into audit_log (type, description, market_id, actor_id)
  values ('resolve', 'AI market rejected by MM', p_market_id, p_mm_id);

  return jsonb_build_object('status', 'voided');
end;
$$;
