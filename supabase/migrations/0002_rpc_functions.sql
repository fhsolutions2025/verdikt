-- ============================================================
-- Verdikt RPC functions — TECH_SPEC.md §4
-- All multi-step state changes run inside a single transaction.
-- All functions are security definer so they can write across
-- tables on behalf of the calling user without broad client grants.
-- ============================================================

-- ─── execute_trade ─────────────────────────────────────────
-- BUSINESS_LOGIC.md §7 + §7.1
-- nudgeConstant = 0.001, max single-trade price impact capped 5¢
create or replace function execute_trade(
  p_market_id  uuid,
  p_taker_id   uuid,   -- null for simulated trades
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
  v_maker_wallet   wallets%rowtype;
begin
  -- 1. Lock and fetch market
  select * into v_market from markets
  where id = p_market_id and status = 'live'
  for update;

  if not found then
    raise exception 'Market % not found or not live', p_market_id;
  end if;

  -- 2. Fetch fee rate from fee_config (keyed by fee_category per answer A)
  select taker_fee_pct / 100 into v_fee_rate
  from fee_config
  where category = v_market.fee_category;

  if v_fee_rate is null then
    v_fee_rate := 0.01; -- safe fallback
  end if;

  -- 3. Determine price and compute trade values (BUSINESS_LOGIC §7)
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

  -- 4. Debit real player wallet (skip for simulated trades)
  if not p_is_simulated and p_taker_id is not null then
    select * into v_wallet from wallets
    where player_id = p_taker_id for update;

    if v_wallet.balance < v_total_cost then
      raise exception 'Insufficient balance';
    end if;

    update wallets set balance = balance - v_total_cost
    where player_id = p_taker_id;
  end if;

  -- 5. Find best resting order to match against (simple best-price match)
  select * into v_maker_order from orders
  where market_id = p_market_id
    and side = p_side
    and status in ('open', 'partially_filled')
  order by
    case when p_side = 'yes' then price end asc,   -- buy YES: lowest ask first
    case when p_side = 'no'  then price end asc,
    created_at asc
  limit 1;

  -- 6. Insert trade record
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

  -- 7. Update matched order if found
  if v_maker_order.id is not null then
    update orders
    set shares_filled = shares_filled + v_shares,
        status = case
          when shares_filled + v_shares >= shares then 'filled'
          else 'partially_filled'
        end
    where id = v_maker_order.id;

    -- Credit maker rebate to player maker (not AI-managed mm)
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

  -- 8. Price nudge (BUSINESS_LOGIC §7.1)
  --    nudgeConstant = 0.001, max impact capped at 5¢ (answer B)
  v_price_delta := (case when p_side = 'yes' then 1 else -1 end)
                   * least(p_amount * 0.001, 5.0);

  v_new_yes_price := greatest(1, least(99, v_market.yes_price + v_price_delta));

  -- 9. Update market volume and price
  update markets
  set volume    = volume + p_amount,
      yes_price = v_new_yes_price
  where id = p_market_id;

  -- 10. Record price tick
  insert into price_ticks (market_id, price) values (p_market_id, v_new_yes_price);

  -- 11. Upsert position (accumulate shares on same side; separate row for opposite side)
  select * into v_position from positions
  where player_id = p_taker_id
    and market_id = p_market_id
    and side = p_side
    and status = 'open'
  limit 1;

  if p_taker_id is not null then
    if v_position.id is not null then
      -- Average down entry price
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

    -- Wallet debit transaction record
    insert into wallet_transactions (
      wallet_id, type, amount, related_market_id, related_trade_id, description
    )
    select w.id, 'trade', -v_total_cost, p_market_id, v_trade_id,
           'Trade: ' || p_side::text || ' on market'
    from wallets w where w.player_id = p_taker_id;
  end if;

  -- 12. Audit log
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

-- ─── seed_market ───────────────────────────────────────────
-- BUSINESS_LOGIC §3.1, §3.3; TECH_SPEC §4.2
create or replace function seed_market(
  p_market_id    uuid,
  p_maker_id     uuid,  -- null for AI-managed institutional mm
  p_yes_shares   numeric,
  p_no_shares    numeric,
  p_spread_cents numeric
)
returns jsonb
language plpgsql security definer as $$
declare
  v_market       markets%rowtype;
  v_yes_ask      numeric;
  v_no_ask       numeric;
  v_yes_capital  numeric;
  v_no_capital   numeric;
  v_capital_dep  numeric;
  v_new_status   market_status;
begin
  select * into v_market from markets where id = p_market_id for update;
  if not found then
    raise exception 'Market % not found', p_market_id;
  end if;

  -- Validate spread cap (BUSINESS_LOGIC §3.3): > 5¢ is a hard cap
  if p_spread_cents > 5 then
    raise exception 'Spread exceeds maximum of 5¢';
  end if;

  -- Determine compliance tier → new market status
  if p_spread_cents <= 2 then
    v_new_status := 'live';
  elsif p_spread_cents <= 3 then
    v_new_status := 'pending_compliance';  -- elevated: risk review 1h
  else
    v_new_status := 'pending_compliance';  -- high: senior approval
  end if;

  -- Compute ask prices from mid-price + spread
  v_yes_ask := v_market.yes_price + (p_spread_cents / 2);
  v_no_ask  := v_market.no_price  + (p_spread_cents / 2);

  -- Capital (BUSINESS_LOGIC §3.1)
  v_yes_capital := p_yes_shares * (v_yes_ask / 100);
  v_no_capital  := p_no_shares  * (v_no_ask  / 100);
  v_capital_dep := v_yes_capital + v_no_capital;

  -- Debit maker wallet if player maker
  if p_maker_id is not null then
    update wallets set balance = balance - v_capital_dep
    where player_id = p_maker_id;

    insert into wallet_transactions (
      wallet_id, type, amount, related_market_id, description
    )
    select w.id, 'trade', -v_capital_dep, p_market_id,
           'Market seed: capital deployed'
    from wallets w where w.player_id = p_maker_id;
  end if;

  -- Place resting orders (bid/ask each side)
  insert into orders (market_id, maker_id, side, price, shares)
  values
    (p_market_id, p_maker_id, 'yes', v_yes_ask, p_yes_shares),
    (p_market_id, p_maker_id, 'no',  v_no_ask,  p_no_shares);

  -- Transition market status
  update markets set status = v_new_status where id = p_market_id;

  -- Insert initial price tick
  insert into price_ticks (market_id, price) values (p_market_id, v_market.yes_price);

  -- Audit
  insert into audit_log (type, description, amount, market_id, actor_id)
  values (
    'seed',
    'Market seeded: yes=' || p_yes_shares || ' no=' || p_no_shares
    || ' spread=' || p_spread_cents || '¢',
    v_capital_dep, p_market_id, p_maker_id
  );

  return jsonb_build_object(
    'status',          v_new_status,
    'capital_deployed', v_capital_dep,
    'capital_at_risk',  least(v_yes_capital, v_no_capital)
  );
end;
$$;

-- ─── approve_ai_market ─────────────────────────────────────
-- TECH_SPEC §4.3 — MM Desk "AI Ready Markets" approval
create or replace function approve_ai_market(
  p_market_id uuid,
  p_mm_id     uuid
)
returns jsonb
language plpgsql security definer as $$
declare
  v_market    markets%rowtype;
  v_mm_config mm_config%rowtype;
  v_result    jsonb;
begin
  select * into v_market from markets
  where id = p_market_id
    and status in ('ai_ready', 'pending_mm_review')
  for update;

  if not found then
    raise exception 'Market % not in ai_ready/pending_mm_review state', p_market_id;
  end if;

  select * into v_mm_config from mm_config limit 1;

  -- Use AI-suggested spread from the market record
  -- seed_market handles status transition
  v_result := seed_market(
    p_market_id,
    null,                    -- AI-managed: no individual player maker_id
    1000,                    -- default YES shares for institutional seed
    1000,                    -- default NO shares
    v_market.spread_cents    -- use AI-suggested spread on the market row
  );

  -- Audit (seed_market already logs 'seed'; add approval record)
  insert into audit_log (type, description, market_id, actor_id)
  values (
    'seed',
    'AI market approved and seeded by MM',
    p_market_id, p_mm_id
  );

  return v_result;
end;
$$;

-- ─── resolve_market ────────────────────────────────────────
-- BUSINESS_LOGIC §12; TECH_SPEC §4.4
create or replace function resolve_market(
  p_market_id uuid,
  p_outcome   market_outcome  -- 'yes', 'no', or 'void'
)
returns jsonb
language plpgsql security definer as $$
declare
  v_pos      record;
  v_payout   numeric;
  v_resolved integer := 0;
begin
  -- Update market
  update markets
  set status      = 'resolved',
      outcome     = p_outcome,
      resolved_at = now()
  where id = p_market_id and status = 'live';

  if not found then
    raise exception 'Market % not live', p_market_id;
  end if;

  -- Settle all open positions
  for v_pos in
    select p.*, w.id as wallet_id
    from positions p
    join wallets w on w.player_id = p.player_id
    where p.market_id = p_market_id and p.status = 'open'
  loop
    if p_outcome = 'void' then
      -- Full refund at entry value (BUSINESS_LOGIC §12)
      v_payout := v_pos.entry_value;

      update positions
      set status      = 'voided',
          closed_at   = now(),
          realized_pnl = 0
      where id = v_pos.id;

    elsif (p_outcome = 'yes' and v_pos.side = 'yes')
       or (p_outcome = 'no'  and v_pos.side = 'no') then
      -- Winner: 1.00 per share (= 100¢ per share)
      v_payout := v_pos.shares;

      update positions
      set status       = 'resolved_won',
          closed_at    = now(),
          realized_pnl = v_payout - v_pos.entry_value
      where id = v_pos.id;

    else
      -- Loser: zero payout
      v_payout := 0;

      update positions
      set status       = 'resolved_lost',
          closed_at    = now(),
          realized_pnl = -v_pos.entry_value
      where id = v_pos.id;
    end if;

    -- Credit wallet if payout > 0
    if v_payout > 0 then
      update wallets set balance = balance + v_payout
      where id = v_pos.wallet_id;

      insert into wallet_transactions (
        wallet_id, type, amount, related_market_id, description
      ) values (
        v_pos.wallet_id,
        case when p_outcome = 'void' then 'payout' else 'payout' end,
        v_payout, p_market_id,
        case when p_outcome = 'void' then 'Void refund'
             else 'Resolution payout (' || p_outcome::text || ')' end
      );
    end if;

    v_resolved := v_resolved + 1;
  end loop;

  -- Audit
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

-- ─── sell_position ─────────────────────────────────────────
-- TECH_SPEC §4.5 — early exit at current market price
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
  v_wallet     wallets%rowtype;
begin
  select * into v_pos from positions
  where id = p_position_id and player_id = p_player_id and status = 'open'
  for update;

  if not found then
    raise exception 'Position % not found or not open', p_position_id;
  end if;

  select * into v_market from markets where id = v_pos.market_id;

  -- Current price for the position's side
  if v_pos.side = 'yes' then
    v_curr_price := v_market.yes_price;
  else
    v_curr_price := v_market.no_price;
  end if;

  -- Current value and P&L
  v_curr_value := v_pos.shares * (v_curr_price / 100);
  v_pnl        := v_curr_value - v_pos.entry_value;

  -- Update position
  update positions
  set status       = 'sold',
      closed_at    = now(),
      realized_pnl = v_pnl
  where id = p_position_id;

  -- Credit wallet
  update wallets set balance = balance + v_curr_value
  where player_id = p_player_id;

  select * into v_wallet from wallets where player_id = p_player_id;

  insert into wallet_transactions (
    wallet_id, type, amount, related_market_id, description
  ) values (
    v_wallet.id, 'sell', v_curr_value, v_pos.market_id,
    'Sold position: ' || v_pos.side::text
  );

  -- Audit
  insert into audit_log (type, description, amount, market_id, actor_id)
  values (
    'trade',
    'Position sold: ' || v_pos.side::text || ' P&L=' || round(v_pnl, 2)::text,
    v_curr_value, v_pos.market_id, p_player_id
  );

  return jsonb_build_object(
    'realized_pnl', v_pnl,
    'sale_value',   v_curr_value,
    'new_balance',  v_wallet.balance + v_curr_value
  );
end;
$$;
