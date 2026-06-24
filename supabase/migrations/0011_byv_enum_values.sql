-- Phase 2 (Bring Your Verdikt): new enum values.
-- 'pending_ai': a raw player submission awaiting AI normalization, before it
-- becomes 'ai_ready' and enters the MM Desk review queue.
-- 'market_submission': audit feed entry when a player submits a market.
--
-- NOTE: enum ADD VALUE must be committed before use; this runs in its own
-- migration so 0012 (which references the values) is a separate transaction.
alter type market_status add value if not exists 'pending_ai' before 'ai_ready';
alter type audit_type    add value if not exists 'market_submission';
