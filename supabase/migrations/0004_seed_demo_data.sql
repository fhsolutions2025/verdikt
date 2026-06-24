-- ============================================================
-- Seed data — single demo account (answer D) + demo markets
-- Demo user: demo@verdikt.io / verdikt2025
-- Password hash generated with pgcrypto crypt()
-- ============================================================

-- ─── Demo auth user ────────────────────────────────────────
-- Insert directly into auth.users with a known UUID
do $$
declare
  v_user_id uuid := '00000000-0000-0000-0000-000000000001';
begin
  -- Only insert if not already present (idempotent)
  if not exists (select 1 from auth.users where id = v_user_id) then
    insert into auth.users (
      id, instance_id, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      aud, role
    ) values (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'demo@verdikt.io',
      crypt('verdikt2025', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Verdikt Demo","role":"admin"}'::jsonb,
      'authenticated',
      'authenticated'
    );
  end if;
end;
$$;

-- The on_auth_user_created trigger creates the profile + wallet automatically.
-- Override role to 'admin' and set starting balance.
update profiles set role = 'admin', display_name = 'Verdikt Demo'
where id = '00000000-0000-0000-0000-000000000001';

update wallets set balance = 50000
where player_id = '00000000-0000-0000-0000-000000000001';

-- ─── Demo operator ─────────────────────────────────────────
insert into operators (id, name, revenue_share_pct)
values
  ('10000000-0000-0000-0000-000000000001', 'Betika Kenya',    25),
  ('10000000-0000-0000-0000-000000000002', 'SportPesa Nigeria', 20)
on conflict do nothing;

-- ─── fee_config — keyed by fee_category (answer A) ─────────
insert into fee_config (category, taker_fee_pct, maker_rebate_pct, creator_royalty_pct)
values
  ('sports',          0.75, 25, 10),
  ('finance',         1.00, 25, 10),
  ('politics',        1.00, 25, 10),
  ('current_affairs', 1.00, 25, 10),
  ('custom',          1.25, 25, 10),
  ('user_created',    1.25, 25, 10),
  ('bundle',          0.75, 25, 10)
on conflict (category) do nothing;

-- ─── mm_config singleton ───────────────────────────────────
-- Fixed UUID (answer E). Only ever UPDATE this row, never INSERT.
insert into mm_config (id, is_verdikt_acting_as_mm, risk_capacity, margin_pct)
values ('20000000-0000-0000-0000-000000000001', true, 50000, 2)
on conflict (id) do nothing;

-- ─── Demo markets ──────────────────────────────────────────
-- Mix of live (with orders seeded) and ai_ready (pending approval)

-- Sports: Arsenal vs Chelsea
insert into markets (
  id, question, category, fee_category, yes_price, ai_confidence,
  status, resolution_source, closes_at, est_volume, spread_cents,
  creator_type
) values (
  '30000000-0000-0000-0000-000000000001',
  'Will Arsenal beat Chelsea in their next Premier League match?',
  'sports', 'sports', 58, 91,
  'live', 'BBC Sport / official Premier League result',
  now() + interval '3 days', 34000, 2,
  'ai_system'
) on conflict do nothing;

-- Sports: AFCON — Nigeria qualifier
insert into markets (
  id, question, category, fee_category, yes_price, ai_confidence,
  status, resolution_source, closes_at, est_volume, spread_cents,
  creator_type
) values (
  '30000000-0000-0000-0000-000000000002',
  'Will Nigeria qualify for AFCON 2027 from Group B?',
  'sports', 'sports', 72, 88,
  'live', 'CAF official qualification standings',
  now() + interval '14 days', 28000, 2,
  'ai_system'
) on conflict do nothing;

-- Finance: USD/KES
insert into markets (
  id, question, category, fee_category, yes_price, ai_confidence,
  status, resolution_source, closes_at, est_volume, spread_cents,
  creator_type
) values (
  '30000000-0000-0000-0000-000000000003',
  'Will USD/KES exceed 135 before end of Q3 2026?',
  'finance', 'finance', 43, 76,
  'live', 'Central Bank of Kenya official exchange rate',
  now() + interval '30 days', 19000, 2,
  'ai_system'
) on conflict do nothing;

-- Politics: Kenyan election
insert into markets (
  id, question, category, fee_category, yes_price, ai_confidence,
  status, resolution_source, closes_at, est_volume, spread_cents,
  creator_type
) values (
  '30000000-0000-0000-0000-000000000004',
  'Will the Kenyan opposition accept the 2027 election results?',
  'politics', 'politics', 38, 62,
  'pending_mm_review', 'IEBC official announcement',
  now() + interval '45 days', 12000, 2,
  'ai_system'
) on conflict do nothing;

-- Sports: AI ready — awaiting MM approval
insert into markets (
  id, question, category, fee_category, yes_price, ai_confidence,
  status, resolution_source, closes_at, est_volume, spread_cents,
  creator_type
) values (
  '30000000-0000-0000-0000-000000000005',
  'Will Mo Salah score in Liverpool''s next Champions League match?',
  'sports', 'sports', 65, 87,
  'ai_ready', 'UEFA official match report',
  now() + interval '5 days', 41000, 2,
  'ai_system'
) on conflict do nothing;

-- Finance: AI ready
insert into markets (
  id, question, category, fee_category, yes_price, ai_confidence,
  status, resolution_source, closes_at, est_volume, spread_cents,
  creator_type
) values (
  '30000000-0000-0000-0000-000000000006',
  'Will Bitcoin close above $75,000 on 1 Aug 2026?',
  'finance', 'finance', 51, 71,
  'ai_ready', 'CoinGecko daily close price',
  now() + interval '38 days', 55000, 2,
  'ai_system'
) on conflict do nothing;

-- ─── Seed resting orders for live markets ──────────────────
-- Arsenal vs Chelsea (market 001)
insert into orders (market_id, maker_id, side, price, shares, status)
values
  ('30000000-0000-0000-0000-000000000001', null, 'yes', 59, 500, 'open'),
  ('30000000-0000-0000-0000-000000000001', null, 'yes', 60, 300, 'open'),
  ('30000000-0000-0000-0000-000000000001', null, 'yes', 61, 200, 'open'),
  ('30000000-0000-0000-0000-000000000001', null, 'yes', 62, 150, 'open'),
  ('30000000-0000-0000-0000-000000000001', null, 'no',  43, 480, 'open'),
  ('30000000-0000-0000-0000-000000000001', null, 'no',  44, 320, 'open'),
  ('30000000-0000-0000-0000-000000000001', null, 'no',  45, 210, 'open'),
  ('30000000-0000-0000-0000-000000000001', null, 'no',  46, 160, 'open')
on conflict do nothing;

-- Nigeria AFCON (market 002)
insert into orders (market_id, maker_id, side, price, shares, status)
values
  ('30000000-0000-0000-0000-000000000002', null, 'yes', 73, 400, 'open'),
  ('30000000-0000-0000-0000-000000000002', null, 'yes', 74, 250, 'open'),
  ('30000000-0000-0000-0000-000000000002', null, 'yes', 75, 180, 'open'),
  ('30000000-0000-0000-0000-000000000002', null, 'yes', 76, 120, 'open'),
  ('30000000-0000-0000-0000-000000000002', null, 'no',  27, 380, 'open'),
  ('30000000-0000-0000-0000-000000000002', null, 'no',  28, 240, 'open'),
  ('30000000-0000-0000-0000-000000000002', null, 'no',  29, 170, 'open'),
  ('30000000-0000-0000-0000-000000000002', null, 'no',  30, 110, 'open')
on conflict do nothing;

-- USD/KES (market 003)
insert into orders (market_id, maker_id, side, price, shares, status)
values
  ('30000000-0000-0000-0000-000000000003', null, 'yes', 44, 350, 'open'),
  ('30000000-0000-0000-0000-000000000003', null, 'yes', 45, 220, 'open'),
  ('30000000-0000-0000-0000-000000000003', null, 'yes', 46, 150, 'open'),
  ('30000000-0000-0000-0000-000000000003', null, 'yes', 47, 100, 'open'),
  ('30000000-0000-0000-0000-000000000003', null, 'no',  58, 340, 'open'),
  ('30000000-0000-0000-0000-000000000003', null, 'no',  59, 210, 'open'),
  ('30000000-0000-0000-0000-000000000003', null, 'no',  60, 140, 'open'),
  ('30000000-0000-0000-0000-000000000003', null, 'no',  61,  90, 'open')
on conflict do nothing;

-- ─── Seed price_ticks for sparklines ───────────────────────
-- Arsenal (58 → slight movement over ~20 ticks)
insert into price_ticks (market_id, price, recorded_at)
select
  '30000000-0000-0000-0000-000000000001',
  58 + (sin(s * 0.4) * 3)::numeric,
  now() - ((20 - s) * interval '15 minutes')
from generate_series(1, 20) s
on conflict do nothing;

-- Nigeria AFCON
insert into price_ticks (market_id, price, recorded_at)
select
  '30000000-0000-0000-0000-000000000002',
  72 + (sin(s * 0.3) * 4)::numeric,
  now() - ((20 - s) * interval '20 minutes')
from generate_series(1, 20) s
on conflict do nothing;

-- USD/KES
insert into price_ticks (market_id, price, recorded_at)
select
  '30000000-0000-0000-0000-000000000003',
  43 + (cos(s * 0.5) * 5)::numeric,
  now() - ((20 - s) * interval '30 minutes')
from generate_series(1, 20) s
on conflict do nothing;

-- ─── Seed some historic trades for audit log + volume ──────
insert into trades (
  market_id, taker_id, side, price, shares, amount, fee,
  platform_fee_share, maker_rebate_share,
  is_simulated, simulated_trader_name, created_at
) values
  ('30000000-0000-0000-0000-000000000001', null, 'yes', 57, 50, 500, 3.75, 2.81, 0.94, true, 'HedgeBot',    now() - interval '2 hours'),
  ('30000000-0000-0000-0000-000000000001', null, 'no',  43, 40, 400, 3.00, 2.25, 0.75, true, 'ArsenalFan',  now() - interval '1 hour 45 min'),
  ('30000000-0000-0000-0000-000000000001', null, 'yes', 58, 30, 300, 2.25, 1.69, 0.56, true, 'ScoutPro',    now() - interval '1 hour 20 min'),
  ('30000000-0000-0000-0000-000000000002', null, 'yes', 71, 60, 600, 4.50, 3.38, 1.13, true, 'NaijaPredict',now() - interval '3 hours'),
  ('30000000-0000-0000-0000-000000000002', null, 'no',  29, 45, 450, 3.38, 2.53, 0.84, true, 'QuietMoney',  now() - interval '2 hours 30 min'),
  ('30000000-0000-0000-0000-000000000003', null, 'yes', 42, 35, 350, 3.50, 2.63, 0.88, true, 'ForexWatch',  now() - interval '4 hours'),
  ('30000000-0000-0000-0000-000000000003', null, 'no',  58, 28, 280, 2.80, 2.10, 0.70, true, 'HedgeBot',    now() - interval '3 hours 10 min')
on conflict do nothing;

-- Update market volumes to reflect seeded trades
update markets set volume = 800  where id = '30000000-0000-0000-0000-000000000001';
update markets set volume = 1050 where id = '30000000-0000-0000-0000-000000000002';
update markets set volume = 630  where id = '30000000-0000-0000-0000-000000000003';

-- ─── Seed audit log entries ────────────────────────────────
insert into audit_log (type, description, amount, fee, market_id, created_at)
values
  ('seed',    'AI markets seeded — Arsenal, Nigeria AFCON, USD/KES', null, null, null, now() - interval '5 hours'),
  ('trade',   'Simulated trade [HedgeBot] YES 500 on Arsenal market',    500, 3.75, '30000000-0000-0000-0000-000000000001', now() - interval '2 hours'),
  ('trade',   'Simulated trade [NaijaPredict] YES 600 on Nigeria market', 600, 4.50, '30000000-0000-0000-0000-000000000002', now() - interval '3 hours'),
  ('trade',   'Simulated trade [ForexWatch] YES 350 on USD/KES market',   350, 3.50, '30000000-0000-0000-0000-000000000003', now() - interval '4 hours')
on conflict do nothing;
