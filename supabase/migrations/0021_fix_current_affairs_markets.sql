-- RCA fix: current_affairs markets were stuck at pending_mm_review (not shown
-- to players) and no ai_ready/live current_affairs markets existed.
-- This migration:
--   1. Promotes existing seed market to ai_ready
--   2. Seeds 3 additional live current_affairs markets with realistic prices

-- Fix Kenya market: pending_mm_review → ai_ready (it's ai_system content, no
-- human MM review needed; normalize-byv already set confidence = 62)
update markets
set
  status       = 'ai_ready',
  ai_confidence = 62
where id = '30000000-0000-0000-0000-000000000004';

-- Seed additional current_affairs markets as live so the tab has content
-- immediately. These are globally verifiable near-future outcomes.
insert into markets (
  question,
  category,
  fee_category,
  yes_price,
  no_price,
  spread_cents,
  ai_confidence,
  status,
  creator_type,
  resolution_source,
  closes_at,
  volume
) values
  (
    'Will the EU enforce its first AI Act penalty against a major tech company by end of 2026?',
    'current_affairs',
    'current_affairs',
    38,
    62,
    2,
    71,
    'live',
    'ai_system',
    'EU AI Office official announcements / Reuters',
    '2026-12-31',
    0
  ),
  (
    'Will India hold its Union Budget before February 2027 without a coalition collapse?',
    'current_affairs',
    'current_affairs',
    82,
    18,
    2,
    78,
    'live',
    'ai_system',
    'Indian Parliament official records / Times of India',
    '2027-02-28',
    0
  ),
  (
    'Will the UN Security Council pass a binding ceasefire resolution in any active conflict by September 2026?',
    'current_affairs',
    'current_affairs',
    28,
    72,
    2,
    66,
    'live',
    'ai_system',
    'UN Security Council resolutions database',
    '2026-09-30',
    0
  );
