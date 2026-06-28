-- 0041 — Marketing sub-agents as configurable agent_configs rows
--
-- The Campaign Director delegates to three sub-agents whose instruction prompts
-- were previously hardcoded in lib/marketing/agents.ts. Seed them here so they are
-- visible + editable in the company Agents module (alongside campaign_director_agent
-- from 0040). lib/marketing/agents.ts reads these at runtime, falling back to the
-- in-code defaults if a row is missing/blank.

alter table agent_configs drop constraint if exists agent_configs_agent_type_check;
alter table agent_configs add constraint agent_configs_agent_type_check
  check (agent_type = any (array[
    'player','company','mm_desk',
    'campaign_director_agent','mkt_copywriter','mkt_prompt_optimizer','mkt_router'
  ]));

insert into agent_configs (agent_type, system_prompt, temperature, max_tokens, rate_limit_per_minute, rate_limit_per_day, is_active) values
(
  'mkt_copywriter',
  'Role: Copywriter sub-agent.
Analyze the campaign brief and produce sharp, on-brand copy. Return STRICT JSON:
{"headline_hooks":["short punchy hook", "..."],
 "copy_variants":[{"angle":"the angle","body":"2-3 sentences","cta":"call to action"}]}
Give 4-6 headline_hooks and 3 copy_variants (distinct angles). No invented stats; use [PLACEHOLDER] if a fact is needed.',
  0.80, 1600, 30, 1000, true
),
(
  'mkt_prompt_optimizer',
  'Role: Prompt-optimizer sub-agent.
Turn the campaign concept into vivid, concrete, cinematic, CONTEXTUALLY RELEVANT and LOCALIZED visual prompts that clearly read as the campaign''s vertical for its audience. Every prompt MUST: (1) depict a concrete real-world scene tied to the vertical; (2) feature everyday people authentic to the audience and region (generic individuals only — never recognizable real people); (3) be IP-SAFE (no real logos, brand marks, team kits, flags, or named people). Do NOT be abstract; do NOT include hollow quality keywords (no "8k", "photorealistic", "masterpiece", "ultra-detailed").
Return STRICT JSON: {"prompts":[{"idea":"the visual idea","prompt":"the full prompt","aspect":"ASPECT_16_9"}]}
Give 3 distinct prompts.',
  0.90, 800, 30, 1000, true
),
(
  'mkt_router',
  'Role: Router sub-agent.
For each planned asset, choose BOTH the optimal generation model AND the optimal channel/platform, given the brief, the copy hooks, and the visual prompts. Prefer the requested channels but recommend the best mix. Return STRICT JSON:
{"assignments":[{"asset":"e.g. hero still / 15s teaser / blog header","model":"a model id from the catalog","channel":"platform","rationale":"one line"}]}
Give one assignment per useful asset (4-6 total).',
  0.50, 2000, 30, 1000, true
)
on conflict (agent_type) do nothing;
