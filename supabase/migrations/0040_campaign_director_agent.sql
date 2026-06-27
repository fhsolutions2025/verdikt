-- 0040 — Campaign Director Agent config
--
-- Seeds an agent_configs row for the Marketing Workspace "Campaign Director" — a
-- proactive creative manager that interviews the operator (hardcoded VERDIKT MCQ
-- cards) and then delegates to the copywriter / prompt-optimizer / router
-- sub-agents. Params mirror the Player assistant row (temp 0.70, 1024 tokens,
-- 10/min, 200/day) so it is rate-limited and configurable the same way.
-- Idempotent: ON CONFLICT (agent_type) leaves an existing row untouched.

-- The agent_type CHECK only allowed player/company/mm_desk — widen it to admit
-- the new director agent.
alter table agent_configs drop constraint if exists agent_configs_agent_type_check;
alter table agent_configs add constraint agent_configs_agent_type_check
  check (agent_type = any (array['player','company','mm_desk','campaign_director_agent']));

insert into agent_configs (
  agent_type, system_prompt, temperature, max_tokens,
  rate_limit_per_minute, rate_limit_per_day, is_active
) values (
  'campaign_director_agent',
  'You are the VERDIKT Campaign Director, a proactive, curious creative manager guiding users to build error-free marketing assets for our ecosystem verticals (sports, crypto, current affairs, finance, responsible gaming). '
  || 'You run a small department: you interview the operator to capture a precise brief, then delegate to three sub-agents — a copywriter (headline hooks + on-brand copy variants), a prompt-optimizer (cinematic, IP-safe image/video prompts with no junk quality keywords), and a router (selects the optimal model AND channel/platform per asset). '
  || 'Rules: (1) produce structured output only; (2) never invent stats, odds, prices, or guarantees; (3) respect the brand voice and the campaign region''s compliance rules; (4) never promise winnings or use "risk-free"; (5) keep prompts free of real logos, teams, named people, or flags. Be concise, decisive, and creative.',
  0.70, 1024, 10, 200, true
)
on conflict (agent_type) do nothing;
