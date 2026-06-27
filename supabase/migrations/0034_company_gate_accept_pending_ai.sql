-- 0034 — Company gate accepts pending_ai (not only ai_ready)
--
-- The Company review queue is "AI-generated markets awaiting a human decision".
-- Generators insert markets as pending_ai with their rationale already attached;
-- normalize-byv asynchronously promotes them to ai_ready. The company should be
-- able to review + submit a freshly-seeded market to MM immediately from the
-- Run-now panel, without waiting for the 2-minute normalize cron. So broaden
-- company_approve_market to accept both pending_ai and ai_ready for ai_system
-- markets. (company_reject_market already accepts pending_ai/ai_ready.)

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
  where id = p_market_id and status in ('ai_ready', 'pending_ai')
  returning * into v;

  if not found then
    raise exception 'Market % is not awaiting company review', p_market_id;
  end if;

  insert into audit_log (type, description, market_id, actor_id)
  values ('market_submission', 'Company approved AI market → MM review', p_market_id, auth.uid());

  return jsonb_build_object('status', 'pending_mm_review');
end $$;
