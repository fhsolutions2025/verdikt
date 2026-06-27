-- 0037 — marketing_assets.media_type (image | video)
--
-- fal.ai adds text-to-video generation. Video clips are re-hosted into the same
-- marketing-media bucket (under video/) and saved as marketing_assets rows; this
-- column lets the gallery render a <video> instead of an <img>. Existing rows are
-- images.

alter table marketing_assets
  add column if not exists media_type text not null default 'image';
