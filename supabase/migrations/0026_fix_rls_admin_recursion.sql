-- 0026 — fix infinite recursion in admin RLS policies
--
-- Every "admin can also read/write" policy did its admin check inline:
--   EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
--
-- The profiles table has its OWN admin-read policy with the same inline EXISTS,
-- so the moment an authenticated (non-service) user touches any of these tables,
-- Postgres evaluates the subquery against profiles, which re-triggers the
-- profiles policy, which queries profiles again → "infinite recursion detected
-- in policy for relation profiles". The whole query ERRORS, the page swallows it
-- as an empty result, and the player sees "No positions yet" / "DEPLOYED 0.00"
-- even though their rows exist. (Service-role reads bypass RLS, which is why the
-- data looked fine in every direct query.)
--
-- Fix: a SECURITY DEFINER helper that reads profiles as the function owner,
-- bypassing RLS entirely — so the admin check can never recurse. Then rewrite
-- all nine policies to call it.

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, service_role;

-- ── profiles (direct self-recursion) ────────────────────────────────────────
drop policy if exists "profiles: own or admin read" on profiles;
create policy "profiles: own or admin read"
  on profiles for select
  using (id = auth.uid() or public.is_admin());

-- ── positions ───────────────────────────────────────────────────────────────
drop policy if exists "positions: owner or admin" on positions;
create policy "positions: owner or admin"
  on positions for select
  using (player_id = auth.uid() or public.is_admin());

-- ── wallets ─────────────────────────────────────────────────────────────────
drop policy if exists "wallets: owner or admin" on wallets;
create policy "wallets: owner or admin"
  on wallets for select
  using (player_id = auth.uid() or public.is_admin());

-- ── wallet_transactions ─────────────────────────────────────────────────────
drop policy if exists "wallet_tx: owner or admin" on wallet_transactions;
create policy "wallet_tx: owner or admin"
  on wallet_transactions for select
  using (
    wallet_id in (select id from wallets where player_id = auth.uid())
    or public.is_admin()
  );

-- ── admin-read observability tables ─────────────────────────────────────────
drop policy if exists "ai_call_log: admin read" on ai_call_log;
create policy "ai_call_log: admin read"
  on ai_call_log for select using (public.is_admin());

drop policy if exists "api_rate_limits: admin read" on api_rate_limits;
create policy "api_rate_limits: admin read"
  on api_rate_limits for select using (public.is_admin());

drop policy if exists "cron_run_log: admin read" on cron_run_log;
create policy "cron_run_log: admin read"
  on cron_run_log for select using (public.is_admin());

-- ── admin-write config tables ───────────────────────────────────────────────
drop policy if exists "fee_config: admin write" on fee_config;
create policy "fee_config: admin write"
  on fee_config for update using (public.is_admin());

drop policy if exists "mm_config: admin update only" on mm_config;
create policy "mm_config: admin update only"
  on mm_config for update using (public.is_admin());
