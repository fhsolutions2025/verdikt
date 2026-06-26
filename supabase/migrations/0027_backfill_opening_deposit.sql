-- 0027 — backfill an opening deposit for demo wallets
--
-- Wallets were seeded by setting wallets.balance directly, with no matching
-- 'deposit' transaction. The Account Statement therefore showed Deposited = 0
-- and could not express a meaningful % return (there was no recorded capital
-- base). This inserts a one-time opening deposit equal to each wallet's starting
-- capital — i.e. the balance that existed before its first transaction:
--
--   opening = current_balance − Σ(all existing transaction amounts)
--
-- Idempotent: only fires for wallets that have no 'deposit' row yet, and only
-- when the computed opening is positive. The deposit is dated just before the
-- earliest existing transaction so it sorts to the start of history.

insert into wallet_transactions (wallet_id, type, amount, description, created_at)
select
  w.id,
  'deposit',
  w.balance - coalesce(tx.total, 0),
  'Opening deposit',
  coalesce(tx.first_at - interval '1 second', now())
from wallets w
left join (
  select wallet_id, sum(amount) as total, min(created_at) as first_at
  from wallet_transactions
  group by wallet_id
) tx on tx.wallet_id = w.id
where not exists (
  select 1 from wallet_transactions d
  where d.wallet_id = w.id and d.type = 'deposit'
)
and (w.balance - coalesce(tx.total, 0)) > 0;
