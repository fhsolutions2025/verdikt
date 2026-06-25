-- BYV (Bring Your Verdikt) schema additions

-- Preserve verbatim player question before AI normalization overwrites market.question
alter table markets add column if not exists player_original_question text;

-- Rejection reason for voided player submissions
alter table markets add column if not exists rejection_reason text;

-- Alpha Vantage: finance data covering gold (XAU/USD), forex, stocks, crypto
insert into api_sources (name, category, license_tier, commercial_note, rate_limit_per_minute)
values (
  'Alpha Vantage',
  'finance',
  'free_demo_only',
  'Free tier: 25 requests/day across all datasets. Covers XAU/USD (gold), forex, equities, crypto. Paid plan required for realtime US equities, intraday FX/crypto, and options data. API key in Edge Function secrets.',
  null
)
on conflict (name) do nothing;

-- company_accept_submission: Company accepts an ai_ready player submission → MM queue
create or replace function company_accept_submission(p_market_id uuid)
returns void language plpgsql security definer as $$
begin
  update markets set status = 'pending_mm_review' where id = p_market_id;
  insert into audit_log (type, description, market_id, actor_id)
  values (
    'market_submission',
    'Company accepted player submission — sent to MM queue',
    p_market_id,
    auth.uid()
  );
end;
$$;

-- company_reject_submission: Company rejects a player submission with reason → voided
create or replace function company_reject_submission(p_market_id uuid, p_reason text)
returns void language plpgsql security definer as $$
begin
  update markets
  set status = 'voided', rejection_reason = p_reason
  where id = p_market_id;

  insert into audit_log (type, description, market_id, actor_id)
  values (
    'market_submission',
    format('Company rejected player submission: %s', p_reason),
    p_market_id,
    auth.uid()
  );
end;
$$;
