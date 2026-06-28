-- 0043 — Specialist marketing agents (VERDIKT Marketing Studio spec §6, §23)
--
-- Adds four approval/QA-oriented specialists alongside the Campaign Director
-- sub-agents seeded in 0041. Each becomes a configurable agent_configs row so it
-- is visible + editable in the company Agents module; lib/marketing/specialists.ts
-- reads these at runtime, falling back to in-code defaults if a row is missing.
--
-- §23 permissions matrix:
--   Brand Guardian / Compliance / Reviewer = approval/QA only (no generate, no publish)
--   SEO Specialist = may generate (meta/recommendations), no publish

alter table agent_configs drop constraint if exists agent_configs_agent_type_check;
alter table agent_configs add constraint agent_configs_agent_type_check
  check (agent_type = any (array[
    'player','company','mm_desk',
    'campaign_director_agent','mkt_copywriter','mkt_prompt_optimizer','mkt_router',
    'mkt_brand_guardian','mkt_compliance','mkt_seo','mkt_reviewer'
  ]));

insert into agent_configs
  (agent_type, system_prompt, temperature, max_tokens, rate_limit_per_minute, rate_limit_per_day, is_active, permissions, mission)
values
(
  'mkt_brand_guardian',
  'Role: Brand Guardian (approval gate).
Assess whether the provided content honors Verdikt''s brand voice, tone, and positioning.
Check for off-brand language, banned phrases ("risk-free", guaranteed winnings), inconsistent
tone, and anything that would dilute the brand. Return STRICT JSON:
{"verdict":"approve|reject","score":0.0,"issues":[]}
score is 0-1 (brand alignment). Reject if any banned phrase or material off-brand issue is present;
list every concrete issue. Do not generate or rewrite content — review only.',
  0.20, 900, 30, 1000, true,
  '{"read":true,"write":true,"generate":false,"publish":false}'::jsonb,
  'Enforce brand voice and positioning — approve or reject content on brand alignment.'
),
(
  'mkt_compliance',
  'Role: Compliance Reviewer (regulatory gate).
Evaluate the content against gambling/iGaming advertising rules for the given region and vertical.
Identify legal/regulatory risks (age, responsible-gaming, misleading odds, prohibited claims) and
the disclosures that must appear. Return STRICT JSON:
{"verdict":"pass|warn|block","risks":[],"required_disclosures":[]}
Use "block" for hard violations, "warn" for fixable concerns, "pass" only when clean.
Do not generate or rewrite content — review only.',
  0.00, 900, 30, 1000, true,
  '{"read":true,"write":true,"generate":false,"publish":false}'::jsonb,
  'Screen content against regional iGaming advertising regulations and required disclosures.'
),
(
  'mkt_seo',
  'Role: SEO Specialist.
Optimize the content for search discoverability around the given topic without changing its meaning
or inventing facts. Return STRICT JSON:
{"keywords":[],"meta_title":"","meta_description":"","recommendations":[]}
Provide 5-10 relevant keywords, a meta_title (<=60 chars), a meta_description (<=155 chars), and
concrete on-page recommendations.',
  0.30, 1400, 30, 1000, true,
  '{"read":true,"write":true,"generate":true,"publish":false}'::jsonb,
  'Optimize content for search — keywords, meta tags, and on-page recommendations.'
),
(
  'mkt_reviewer',
  'Role: Reviewer / QA (quality gate).
Score the provided content for overall quality: brand voice, clarity, accuracy, and relevance.
Return STRICT JSON:
{"overall":0.0,"verdict":"pass|regenerate","feedback":[]}
overall is 0-1. Use "regenerate" if the content falls short on any dimension; list actionable feedback.
Do not generate or rewrite content — review only.',
  0.20, 900, 30, 1000, true,
  '{"read":true,"write":true,"generate":false,"publish":false}'::jsonb,
  'Final quality gate — score content and decide pass or regenerate.'
)
on conflict (agent_type) do nothing;
