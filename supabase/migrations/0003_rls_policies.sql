-- ============================================================
-- RLS Policies — TECH_SPEC.md §7
-- During demo phase the persona switcher is client-side only;
-- any authenticated session can read all portals.
-- Write paths are locked to RPC functions (security definer).
-- ============================================================

-- Enable RLS on every table
alter table profiles           enable row level security;
alter table operators          enable row level security;
alter table wallets            enable row level security;
alter table wallet_transactions enable row level security;
alter table bundles            enable row level security;
alter table markets            enable row level security;
alter table price_ticks        enable row level security;
alter table orders             enable row level security;
alter table trades             enable row level security;
alter table positions          enable row level security;
alter table fee_config         enable row level security;
alter table mm_config          enable row level security;
alter table audit_log          enable row level security;

-- ─── profiles ──────────────────────────────────────────────
create policy "profiles: own or admin read"
  on profiles for select
  using (id = auth.uid() or exists (
    select 1 from profiles p2
    where p2.id = auth.uid() and p2.role = 'admin'
  ));

-- ─── operators ─────────────────────────────────────────────
create policy "operators: any authed read"
  on operators for select
  using (auth.uid() is not null);

-- ─── markets / bundles / price_ticks / orders / trades ─────
-- Read: any authenticated user
-- Write: blocked on client; only security-definer RPCs can write
create policy "markets: any authed read"
  on markets for select using (auth.uid() is not null);

create policy "bundles: any authed read"
  on bundles for select using (auth.uid() is not null);

create policy "price_ticks: any authed read"
  on price_ticks for select using (auth.uid() is not null);

create policy "orders: any authed read"
  on orders for select using (auth.uid() is not null);

create policy "trades: any authed read"
  on trades for select using (auth.uid() is not null);

-- ─── positions ─────────────────────────────────────────────
create policy "positions: owner or admin"
  on positions for select
  using (
    player_id = auth.uid()
    or exists (
      select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ─── wallets ───────────────────────────────────────────────
create policy "wallets: owner or admin"
  on wallets for select
  using (
    player_id = auth.uid()
    or exists (
      select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ─── wallet_transactions ───────────────────────────────────
create policy "wallet_tx: owner or admin"
  on wallet_transactions for select
  using (
    wallet_id in (
      select id from wallets where player_id = auth.uid()
    )
    or exists (
      select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ─── fee_config ────────────────────────────────────────────
create policy "fee_config: any authed read"
  on fee_config for select using (auth.uid() is not null);

create policy "fee_config: admin write"
  on fee_config for update
  using (exists (
    select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

-- ─── mm_config ─────────────────────────────────────────────
create policy "mm_config: any authed read"
  on mm_config for select using (auth.uid() is not null);

create policy "mm_config: admin update only"
  on mm_config for update
  using (exists (
    select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

-- ─── audit_log ─────────────────────────────────────────────
-- Relaxed for investor demos: any authed user can read
create policy "audit_log: any authed read"
  on audit_log for select using (auth.uid() is not null);

-- ─── Realtime publications ─────────────────────────────────
-- TECH_SPEC §5
alter publication supabase_realtime add table markets;
alter publication supabase_realtime add table trades;
alter publication supabase_realtime add table wallet_transactions;
alter publication supabase_realtime add table wallets;
alter publication supabase_realtime add table positions;
alter publication supabase_realtime add table audit_log;
alter publication supabase_realtime add table price_ticks;
