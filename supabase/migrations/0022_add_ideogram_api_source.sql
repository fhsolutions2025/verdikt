-- Add Ideogram to api_sources so it appears in the API Health panel.
-- Ideogram V_2 is metered at $0.08/image; key stored in Supabase secrets.
insert into api_sources (name, category, license_tier, commercial_note, rate_limit_per_minute)
values (
  'Ideogram V_2',
  'creative_ai',
  'metered',
  '$0.08/image (V_2). API key in Supabase secrets as ideogram_api_key. Calls proxied via ideogram-proxy Edge Function.',
  null
)
on conflict (name) do nothing;
