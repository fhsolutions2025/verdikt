-- ============================================================
-- Verdikt schema — TECH_SPEC.md §3
-- All prices stored as numeric cents (0-100 scale).
-- no_price is a generated column; never store independently.
-- ============================================================

-- ─── Extensions ────────────────────────────────────────────
create extension if not exists pgcrypto;

-- ─── Enums ─────────────────────────────────────────────────
create type user_role as enum ('admin', 'player');

create type bundle_status as enum ('draft', 'live', 'resolved', 'voided');

create type market_category as enum (
  'sports', 'finance', 'politics', 'current_affairs', 'custom'
);

-- fee_category is computed at market-creation time per user answer A:
--   bundle_id != null → 'bundle'
--   player-submitted (Bring Your Verdikt) → 'user_created'
--   else mirrors category 1:1
create type fee_category as enum (
  'sports', 'finance', 'politics', 'current_affairs', 'custom',
  'user_created', 'bundle'
);

create type market_status as enum (
  'ai_ready',
  'pending_mm_review',
  'pending_compliance',
  'live',
  'resolved',
  'voided'
);

create type creator_type as enum ('institutional_mm', 'player_mm', 'ai_system');

create type market_outcome as enum ('yes', 'no', 'void');

create type order_side as enum ('yes', 'no');

create type order_status as enum ('open', 'partially_filled', 'filled', 'cancelled');

create type position_status as enum (
  'open', 'sold', 'resolved_won', 'resolved_lost', 'voided'
);

create type transaction_type as enum (
  'deposit', 'withdrawal', 'trade', 'sell', 'payout',
  'fee', 'maker_rebate', 'maker_spread', 'holding_reward', 'creator_royalty'
);

create type audit_type as enum (
  'trade', 'seed', 'resolve', 'fee', 'operator_sync', 'config_change'
);

-- ─── operators ─────────────────────────────────────────────
create table operators (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  revenue_share_pct numeric not null default 25,
  created_at        timestamptz not null default now()
);

-- ─── profiles ──────────────────────────────────────────────
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  role         user_role not null default 'player',
  display_name text not null,
  operator_id  uuid references operators(id),
  created_at   timestamptz not null default now()
);

-- ─── wallets ───────────────────────────────────────────────
create table wallets (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null unique references profiles(id),
  balance    numeric not null default 10000,
  updated_at timestamptz not null default now()
);

-- ─── bundles ───────────────────────────────────────────────
create table bundles (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  category   text not null,
  closes_at  timestamptz not null,
  status     bundle_status not null default 'draft',
  created_at timestamptz not null default now()
);

-- ─── markets ───────────────────────────────────────────────
create table markets (
  id                uuid primary key default gen_random_uuid(),
  question          text not null,
  category          market_category not null,
  fee_category      fee_category not null,
  bundle_id         uuid references bundles(id),
  yes_price         numeric not null check (yes_price > 0 and yes_price < 100),
  -- no_price derived, never stored independently (TECH_SPEC §3.4)
  no_price          numeric generated always as (100 - yes_price) stored,
  ai_confidence     numeric check (ai_confidence between 0 and 100),
  status            market_status not null default 'ai_ready',
  resolution_source text,
  closes_at         timestamptz not null,
  resolved_at       timestamptz,
  outcome           market_outcome,
  volume            numeric not null default 0,
  est_volume        numeric,
  spread_cents      numeric not null default 2
                    check (spread_cents >= 0 and spread_cents <= 5),
  created_by        uuid references profiles(id),
  creator_type      creator_type not null default 'ai_system',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_markets_status   on markets(status);
create index idx_markets_bundle   on markets(bundle_id);
create index idx_markets_category on markets(category);

-- ─── price_ticks ───────────────────────────────────────────
create table price_ticks (
  id          bigserial primary key,
  market_id   uuid not null references markets(id) on delete cascade,
  price       numeric not null,
  recorded_at timestamptz not null default now()
);

create index idx_price_ticks_market_time
  on price_ticks(market_id, recorded_at desc);

-- ─── orders ────────────────────────────────────────────────
create table orders (
  id            uuid primary key default gen_random_uuid(),
  market_id     uuid not null references markets(id),
  maker_id      uuid references profiles(id),
  side          order_side not null,
  price         numeric not null,
  shares        numeric not null,
  shares_filled numeric not null default 0,
  status        order_status not null default 'open',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_orders_market_status on orders(market_id, status);

-- ─── trades ────────────────────────────────────────────────
create table trades (
  id                   uuid primary key default gen_random_uuid(),
  market_id            uuid not null references markets(id),
  taker_id             uuid references profiles(id),
  maker_order_id       uuid references orders(id),
  side                 order_side not null,
  price                numeric not null,
  shares               numeric not null,
  amount               numeric not null,
  fee                  numeric not null,
  platform_fee_share   numeric not null,
  maker_rebate_share   numeric not null,
  is_simulated         boolean not null default false,
  simulated_trader_name text,
  created_at           timestamptz not null default now()
);

create index idx_trades_market_time on trades(market_id, created_at desc);
create index idx_trades_taker       on trades(taker_id);
create index idx_trades_simulated   on trades(is_simulated);

-- ─── positions ─────────────────────────────────────────────
create table positions (
  id           uuid primary key default gen_random_uuid(),
  player_id    uuid not null references profiles(id),
  market_id    uuid not null references markets(id),
  side         order_side not null,
  shares       numeric not null,
  entry_price  numeric not null,
  entry_value  numeric not null,
  entry_at     timestamptz not null default now(),
  fee_paid     numeric not null,
  status       position_status not null default 'open',
  closed_at    timestamptz,
  realized_pnl numeric
);

create index idx_positions_player on positions(player_id, status);
create index idx_positions_market on positions(market_id);

-- ─── wallet_transactions ───────────────────────────────────
create table wallet_transactions (
  id                 uuid primary key default gen_random_uuid(),
  wallet_id          uuid not null references wallets(id),
  type               transaction_type not null,
  amount             numeric not null,
  related_market_id  uuid references markets(id),
  related_trade_id   uuid references trades(id),
  description        text not null,
  created_at         timestamptz not null default now()
);

create index idx_wallet_tx_wallet_time
  on wallet_transactions(wallet_id, created_at desc);
create index idx_wallet_tx_type
  on wallet_transactions(type);

-- ─── fee_config ────────────────────────────────────────────
-- Keyed by fee_category (not category) per answer A.
create table fee_config (
  id                  uuid primary key default gen_random_uuid(),
  category            fee_category not null unique,
  taker_fee_pct       numeric not null,
  maker_rebate_pct    numeric not null default 25,
  creator_royalty_pct numeric not null default 10,
  updated_at          timestamptz not null default now(),
  updated_by          uuid references profiles(id)
);

-- ─── mm_config (singleton) ─────────────────────────────────
-- Fixed UUID, seeded once in 0004. RPCs only UPDATE this row.
create table mm_config (
  id                      uuid primary key default gen_random_uuid(),
  is_verdikt_acting_as_mm boolean not null default true,
  risk_capacity           numeric not null default 50000,
  margin_pct              numeric not null default 5,
  updated_at              timestamptz not null default now()
);

-- ─── audit_log ─────────────────────────────────────────────
create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  type        audit_type not null,
  description text not null,
  amount      numeric,
  fee         numeric,
  market_id   uuid references markets(id),
  actor_id    uuid references profiles(id),
  created_at  timestamptz not null default now()
);

create index idx_audit_log_time on audit_log(created_at desc);

-- ─── Aggregate views ───────────────────────────────────────
create view v_platform_totals as
select
  coalesce(sum(amount), 0)             as total_volume,
  coalesce(sum(platform_fee_share), 0) as total_platform_fees,
  coalesce(sum(maker_rebate_share), 0) as total_maker_rebates
from trades
where created_at >= current_date;

create view v_operator_revenue as
select
  o.id,
  o.name,
  o.revenue_share_pct,
  coalesce(sum(t.amount), 0)             as volume,
  coalesce(sum(t.platform_fee_share), 0) as fees
from operators o
left join profiles p on p.operator_id = o.id
left join trades t   on t.taker_id = p.id
group by o.id, o.name, o.revenue_share_pct;

-- ─── Trigger: new auth user → profile + wallet ─────────────
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'player')
  );
  insert into wallets (player_id, balance)
  values (new.id, 10000);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ─── updated_at auto-bump ──────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger markets_updated_at
  before update on markets
  for each row execute procedure set_updated_at();

create trigger orders_updated_at
  before update on orders
  for each row execute procedure set_updated_at();

create trigger wallets_updated_at
  before update on wallets
  for each row execute procedure set_updated_at();

create trigger mm_config_updated_at
  before update on mm_config
  for each row execute procedure set_updated_at();
