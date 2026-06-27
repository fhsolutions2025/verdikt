-- 0033 — AI rationale on markets + Company review gate (Company → MM)
--
-- (1) Capture the AI's "why this market" reasoning so reviewers (and players) can
--     judge a generated market. (2) Insert a Company approval gate before MM: an AI
--     market (ai_ready) must be approved by the company → pending_mm_review, then MM
--     seeds it to live. Both RPCs are admin-gated (service_role or admin), mirroring
--     resolve_market's guard.

alter table markets add column if not exists ai_rationale text;

-- Company approves an AI-generated market → hands it to MM.
create or replace function company_approve_market(p_market_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public as $$
declare v markets%rowtype;
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role','') <> 'service_role'
     and not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Admin role required to approve markets' using errcode = '42501';
  end if;

  update markets set status = 'pending_mm_review'
  where id = p_market_id and status = 'ai_ready'
  returning * into v;

  if not found then
    raise exception 'Market % is not in ai_ready state', p_market_id;
  end if;

  insert into audit_log (type, description, market_id, actor_id)
  values ('market_submission', 'Company approved AI market → MM review', p_market_id, auth.uid());

  return jsonb_build_object('status', 'pending_mm_review');
end $$;

-- Company rejects an AI-generated market → voided.
create or replace function company_reject_market(p_market_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public as $$
declare v markets%rowtype;
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role','') <> 'service_role'
     and not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Admin role required to reject markets' using errcode = '42501';
  end if;

  update markets set status = 'voided'
  where id = p_market_id and status in ('ai_ready', 'pending_ai')
  returning * into v;

  if not found then
    raise exception 'Market % is not reviewable', p_market_id;
  end if;

  insert into audit_log (type, description, market_id, actor_id)
  values ('market_submission',
          coalesce('Company rejected AI market: ' || p_reason, 'Company rejected AI market'),
          p_market_id, auth.uid());

  return jsonb_build_object('status', 'voided');
end $$;
