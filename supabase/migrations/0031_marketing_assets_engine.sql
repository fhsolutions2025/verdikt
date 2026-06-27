-- 0031 — record which image engine produced a marketing asset
-- Lets API Health separate Ideogram spend from OpenAI (gpt-image-1) spend in the
-- gallery totals. Existing rows default to 'ideogram' (the only prior engine).
alter table marketing_assets
  add column if not exists image_engine text not null default 'ideogram';
