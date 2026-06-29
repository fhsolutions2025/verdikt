-- 0047 — Register the remaining spec agents as first-class registry entries
-- (Knowledge Researcher, Creative Designer, Video Producer) + the QA agent that
-- lib/marketing/qa.ts already reads. They become editable in the §23 AI Agents screen.

alter table agent_configs drop constraint if exists agent_configs_agent_type_check;
alter table agent_configs add constraint agent_configs_agent_type_check
  check (agent_type = any (array[
    'player','company','mm_desk',
    'campaign_director_agent','mkt_copywriter','mkt_prompt_optimizer','mkt_router',
    'mkt_brand_guardian','mkt_compliance','mkt_seo','mkt_reviewer',
    'mkt_knowledge_researcher','mkt_creative_designer','mkt_video_producer','qa_agent'
  ]));

insert into agent_configs
  (agent_type, system_prompt, temperature, max_tokens, rate_limit_per_minute, rate_limit_per_day, is_active, permissions, mission)
values
(
  'mkt_knowledge_researcher',
  'Role: Knowledge Researcher.
Use uploaded documents and organizational knowledge to assemble the factual context a
campaign needs. Retrieve and synthesize — never invent facts. Cite which knowledge a claim
came from. Return concise, structured findings the Copywriter and Director can rely on.',
  0.30, 1400, 30, 1000, true,
  '{"read":true,"write":true,"generate":false,"publish":false}'::jsonb,
  'Retrieve and synthesize brand/organizational knowledge to ground every campaign in fact.'
),
(
  'mkt_creative_designer',
  'Role: Creative Designer (visual creative direction).
Define the campaign''s visual identity and translate concepts into concrete, on-brand,
IP-safe art direction (composition, palette, mood, style). Keep visuals consistent across
assets. Never use real logos, brand marks, or recognizable real people.',
  0.70, 1200, 30, 1000, true,
  '{"read":true,"write":true,"generate":true,"publish":false}'::jsonb,
  'Own campaign visual identity and turn creative concepts into finished, on-brand art direction.'
),
(
  'mkt_video_producer',
  'Role: Video Producer.
Convert a campaign brief into a platform-optimized script + storyboard (hook -> problem ->
product -> benefits -> proof -> CTA), then a cinematic shot list for rendering. Respect the
platform aspect and duration. Never invent stats/odds; never promise winnings.',
  0.60, 1600, 30, 1000, true,
  '{"read":true,"write":true,"generate":true,"publish":false}'::jsonb,
  'Turn approved concepts into platform-optimized video scripts, storyboards and renders.'
),
(
  'qa_agent',
  'Role: QA Inspector (quality gate).
Rigorously inspect one generated asset and decide whether it is safe to surface or publish.
Detect broken/incomplete output, missing fields, unreadable text, weak CTA, and brand or
compliance red flags. Score 0-100 and set blocking flags for critical issues.',
  0.20, 900, 30, 1000, true,
  '{"read":true,"write":true,"generate":false,"publish":false}'::jsonb,
  'Final automated quality gate — score every asset and block anything unsafe to surface/publish.'
)
on conflict (agent_type) do nothing;
