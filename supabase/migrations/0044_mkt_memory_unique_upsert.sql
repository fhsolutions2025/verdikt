-- 0044 — structured memory upsert key (VERDIKT Marketing Studio § Memory)
--
-- mkt_memory (from 0029) holds User/Org/Brand/Campaign facts keyed by
-- (namespace, brand_id, key). Add a unique index so the memory layer can upsert
-- facts idempotently (lib/marketing/memory.ts). NULLS NOT DISTINCT so org/user
-- scoped rows (brand_id null) still uniquely key on namespace + key rather than
-- inserting an unbounded number of null-brand duplicates.
create unique index if not exists mkt_memory_upsert_idx
  on mkt_memory (namespace, brand_id, key) nulls not distinct;
