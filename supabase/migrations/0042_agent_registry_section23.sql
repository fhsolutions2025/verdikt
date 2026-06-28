-- 0042 — Agent registry → full Section 23 shape + version history
--
-- Section 23 ("AI Agent Configurations") defines each agent by a fixed attribute
-- set. agent_configs already holds system_prompt/temperature/max_tokens/rate
-- limits/tools/is_active/version; this migration adds the remaining §23 fields so
-- the AI Agents screen becomes a faithful, runtime-driving registry (not cosmetic).
-- All additive + idempotent. No existing column is altered.

alter table agent_configs
  add column if not exists provider              text,                                                   -- 'anthropic' | 'openai' | null (router default)
  add column if not exists model                 text,                                                   -- concrete model id; null = task-router default
  add column if not exists mission               text not null default '',
  add column if not exists responsibilities      jsonb not null default '[]'::jsonb,
  add column if not exists capabilities          jsonb not null default '[]'::jsonb,
  add column if not exists permissions           jsonb not null default '{"read":true,"write":true,"generate":false,"publish":false}'::jsonb,
  add column if not exists restrictions          jsonb not null default '[]'::jsonb,
  add column if not exists output_schema         jsonb,                                                  -- §18/§23 structured-output contract
  add column if not exists escalation_target     text,                                                   -- agent_type or model to escalate to
  add column if not exists supported_asset_types jsonb not null default '[]'::jsonb,
  add column if not exists supported_languages   jsonb not null default '[]'::jsonb,
  add column if not exists execution_priority    integer not null default 100,
  add column if not exists streaming             boolean not null default true,
  add column if not exists timeout_seconds       integer not null default 60,
  add column if not exists retry_policy          jsonb not null default '{"max_attempts":3,"backoff_seconds":[1,2,4]}'::jsonb,
  add column if not exists memory_sources        jsonb not null default '[]'::jsonb;

-- Immutable version history (§23: "no production agent config modified without versioning").
create table if not exists agent_config_versions (
  id          uuid primary key default gen_random_uuid(),
  agent_type  text not null,
  version     integer not null,
  snapshot    jsonb not null,
  changed_by  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists agent_config_versions_type_idx on agent_config_versions (agent_type, version desc);

alter table agent_config_versions enable row level security;
drop policy if exists "agent_config_versions: admin read" on agent_config_versions;
create policy "agent_config_versions: admin read"
  on agent_config_versions for select using (is_admin());
-- Writes happen via the service-role admin routes (bypass RLS).

-- Seed §23 permissions matrix + identity for the agents we already run.
update agent_configs set permissions = '{"read":true,"write":true,"generate":false,"publish":false}'::jsonb,
  mission = 'Operate as the central orchestration engine — plan campaigns, decompose work, assign specialists, aggregate results.'
  where agent_type = 'campaign_director_agent' and mission = '';
update agent_configs set permissions = '{"read":true,"write":true,"generate":true,"publish":false}'::jsonb,
  mission = 'Generate persuasive, on-brand marketing copy (headline hooks + copy variants).'
  where agent_type = 'mkt_copywriter' and mission = '';
update agent_configs set permissions = '{"read":true,"write":true,"generate":true,"publish":false}'::jsonb,
  mission = 'Turn campaign concepts into cinematic, localized, IP-safe image/video prompts.'
  where agent_type = 'mkt_prompt_optimizer' and mission = '';
update agent_configs set permissions = '{"read":true,"write":true,"generate":false,"publish":false}'::jsonb,
  mission = 'Select the optimal generation model and channel/platform per planned asset.'
  where agent_type = 'mkt_router' and mission = '';
