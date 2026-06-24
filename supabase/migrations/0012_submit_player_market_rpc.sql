-- Phase 2 (Bring Your Verdikt): player market submission.
-- Atomic, security-definer. Creates a market in 'pending_ai' state from a
-- player's raw idea. The AI normalization step (next build) will refine the
-- question/fee/confidence and transition it to 'ai_ready' for MM review.
create or replace function submit_player_market(
  p_player_id     uuid,
  p_question      text,
  p_category      market_category,
  p_closes_at     timestamptz,
  p_gut_yes_price numeric default 50
)
returns jsonb
language plpgsql security definer as $$
declare
  v_market_id   uuid;
  v_clean_price numeric;
begin
  if length(trim(coalesce(p_question, ''))) < 10 then
    raise exception 'Question must be at least 10 characters';
  end if;

  if p_closes_at is null or p_closes_at <= now() then
    raise exception 'Close date must be in the future';
  end if;

  -- Clamp the player's gut probability into the valid (0,100) range.
  v_clean_price := greatest(1, least(99, coalesce(p_gut_yes_price, 50)));

  insert into markets (
    question, category, fee_category, yes_price,
    status, closes_at, created_by, creator_type, spread_cents
  ) values (
    trim(p_question), p_category, 'user_created', v_clean_price,
    'pending_ai', p_closes_at, p_player_id, 'player_mm', 2
  ) returning id into v_market_id;

  insert into audit_log (type, description, market_id, actor_id)
  values (
    'market_submission',
    'Player submitted market: ' || left(trim(p_question), 80),
    v_market_id, p_player_id
  );

  return jsonb_build_object(
    'market_id', v_market_id,
    'status',    'pending_ai'
  );
end;
$$;
