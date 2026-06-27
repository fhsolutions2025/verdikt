-- 0029 — Marketing Department MVP data model
--
-- Implements the MVP subset of docs/verdikt-marketing-agent/15-data-model.md.
-- All tables are admin-gated via the existing is_admin() SECURITY DEFINER function
-- (migration 0026). Writes happen via the service-role key in admin routes
-- (RLS is bypassed by service role); reads are restricted to admins.
--
-- Namespacing: mkt_* prefix keeps the department isolated so future departments
-- (hr_*, fin_*, ...) can reuse the same runtime. org_id is nullable in MVP
-- (single-tenant) and becomes enforced in V1 multi-tenant.

-- ── Brands ────────────────────────────────────────────────────────────────────
create table if not exists mkt_brands (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid,
  name        text not null,
  voice       jsonb not null default '{}'::jsonb,   -- {tone, do[], dont[], lexicon[]}
  brand_kit   jsonb not null default '{}'::jsonb,   -- {palette[], logo_ref}
  regions     text[] not null default '{}',
  competitors text[] not null default '{}',
  status      text not null default 'draft',        -- draft | active | archived
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now()
);
create index if not exists mkt_brands_status_idx on mkt_brands(status);

-- ── Campaigns ─────────────────────────────────────────────────────────────────
create table if not exists mkt_campaigns (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid,
  brand_id    uuid not null references mkt_brands(id) on delete cascade,
  name        text not null,
  goal        text,
  status      text not null default 'DRAFT',        -- DRAFT|PLANNING|GENERATING|IN_REVIEW|READY|LIVE|COMPLETED|BLOCKED|ARCHIVED
  region      text,
  start_date  date,
  end_date    date,
  budget_usd  numeric not null default 0,
  plan        jsonb,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now()
);
create index if not exists mkt_campaigns_brand_idx  on mkt_campaigns(brand_id);
create index if not exists mkt_campaigns_status_idx  on mkt_campaigns(status);
create index if not exists mkt_campaigns_created_idx on mkt_campaigns(created_at desc);

-- ── Campaign briefs ───────────────────────────────────────────────────────────
create table if not exists mkt_campaign_briefs (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references mkt_campaigns(id) on delete cascade,
  goal        text,
  audience    text,
  channels    text[] not null default '{}',
  region      text,
  start_date  date,
  end_date    date,
  budget_usd  numeric not null default 0,
  constraints jsonb not null default '{}'::jsonb,
  raw_input   text,
  created_at  timestamptz not null default now()
);
create index if not exists mkt_briefs_campaign_idx on mkt_campaign_briefs(campaign_id);

-- ── Agent runs (also the MVP job/queue record) ────────────────────────────────
create table if not exists mkt_agent_runs (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references mkt_campaigns(id) on delete cascade,
  workflow    text,
  status      text not null default 'queued',       -- queued|planning|awaiting_plan_approval|running|review|completed|partial|failed|cancelled|budget_capped
  budget_usd  numeric not null default 0,
  spent_usd   numeric not null default 0,
  started_at  timestamptz,
  finished_at timestamptz,
  error       text,
  created_at  timestamptz not null default now()
);
create index if not exists mkt_runs_campaign_idx on mkt_agent_runs(campaign_id);
create index if not exists mkt_runs_status_idx   on mkt_agent_runs(status);

-- ── Agent tasks ───────────────────────────────────────────────────────────────
create table if not exists mkt_agent_tasks (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references mkt_agent_runs(id) on delete cascade,
  agent       text not null,
  type        text not null,
  depends_on  uuid[] not null default '{}',
  inputs      jsonb not null default '{}'::jsonb,
  outputs     jsonb,
  status      text not null default 'pending',      -- pending|ready|running|succeeded|failed|reviewed|blocked
  retries     int  not null default 0,
  cost_usd    numeric not null default 0,
  started_at  timestamptz,
  finished_at timestamptz,
  error       text,
  created_at  timestamptz not null default now()
);
create index if not exists mkt_tasks_run_idx    on mkt_agent_tasks(run_id);
create index if not exists mkt_tasks_status_idx on mkt_agent_tasks(status);

-- ── Artifacts ─────────────────────────────────────────────────────────────────
create table if not exists mkt_artifacts (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references mkt_campaigns(id) on delete cascade,
  type              text not null,                  -- blog|social|image|email|ad|plan|research|video
  channel           text,
  status            text not null default 'draft',  -- draft|needs_review|approved|changes_requested|rejected|exported|published
  latest_version_id uuid,
  title             text,
  created_by_agent  text,
  created_at        timestamptz not null default now()
);
create index if not exists mkt_artifacts_campaign_idx on mkt_artifacts(campaign_id);
create index if not exists mkt_artifacts_type_idx     on mkt_artifacts(type);
create index if not exists mkt_artifacts_status_idx   on mkt_artifacts(status);

-- ── Artifact versions (immutable) ─────────────────────────────────────────────
create table if not exists mkt_artifact_versions (
  id                 uuid primary key default gen_random_uuid(),
  artifact_id        uuid not null references mkt_artifacts(id) on delete cascade,
  version            int  not null,
  content            jsonb,
  asset_url          text,
  source             text not null default 'agent', -- agent | human
  provenance         jsonb not null default '{}'::jsonb,
  eval_scores        jsonb,
  compliance_result  jsonb,
  created_at         timestamptz not null default now(),
  unique (artifact_id, version)
);
create index if not exists mkt_versions_artifact_idx on mkt_artifact_versions(artifact_id, version desc);

-- latest_version_id references the versions table (added after both exist)
alter table mkt_artifacts
  drop constraint if exists mkt_artifacts_latest_version_fk;
alter table mkt_artifacts
  add constraint mkt_artifacts_latest_version_fk
  foreign key (latest_version_id) references mkt_artifact_versions(id) on delete set null;

-- ── Approvals ─────────────────────────────────────────────────────────────────
create table if not exists mkt_approvals (
  id                  uuid primary key default gen_random_uuid(),
  artifact_id         uuid references mkt_artifacts(id) on delete cascade,
  artifact_version_id uuid references mkt_artifact_versions(id) on delete cascade,
  campaign_id         uuid references mkt_campaigns(id) on delete cascade,
  gate                text not null,                -- plan | artifact | publish
  decision            text not null default 'pending', -- pending|approved|changes_requested|rejected
  approver_id         uuid references profiles(id),
  comment             text,
  justification       text,                          -- required for compliance-block override
  created_at          timestamptz not null default now()
);
create index if not exists mkt_approvals_artifact_idx on mkt_approvals(artifact_id);
create index if not exists mkt_approvals_decision_idx on mkt_approvals(decision);

-- ── Tool calls ────────────────────────────────────────────────────────────────
create table if not exists mkt_tool_calls (
  id             uuid primary key default gen_random_uuid(),
  task_id        uuid references mkt_agent_tasks(id) on delete cascade,
  tool           text not null,
  inputs         jsonb,                              -- redacted
  output_summary jsonb,
  status         text not null default 'ok',
  latency_ms     int,
  cost_usd       numeric not null default 0,
  error          text,
  created_at     timestamptz not null default now()
);
create index if not exists mkt_tool_calls_task_idx on mkt_tool_calls(task_id);

-- ── Memory ────────────────────────────────────────────────────────────────────
create table if not exists mkt_memory (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid,
  brand_id   uuid references mkt_brands(id) on delete cascade,
  namespace  text not null,                          -- brand|user|campaign|asset|competitor|conversation|publishing|performance|learning|approval
  key        text not null,
  value      jsonb not null default '{}'::jsonb,
  confidence numeric not null default 1,
  source     text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists mkt_memory_lookup_idx on mkt_memory(namespace, brand_id, key);

-- ── Evaluation runs ───────────────────────────────────────────────────────────
create table if not exists mkt_evaluation_runs (
  id                uuid primary key default gen_random_uuid(),
  target_version_id uuid references mkt_artifact_versions(id) on delete cascade,
  eval_id           text not null,
  scores            jsonb,
  verdict           text,                            -- pass|regenerate|escalate|block
  model             text,
  dataset_version   text,
  created_at        timestamptz not null default now()
);
create index if not exists mkt_evals_version_idx on mkt_evaluation_runs(target_version_id);

-- ── Activity feed ─────────────────────────────────────────────────────────────
create table if not exists mkt_activity (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid references mkt_campaigns(id) on delete cascade,
  run_id      uuid references mkt_agent_runs(id) on delete cascade,
  type        text not null,
  actor       text,
  text        text,
  target_ref  text,
  severity    text not null default 'info',
  created_at  timestamptz not null default now()
);
create index if not exists mkt_activity_campaign_idx on mkt_activity(campaign_id, created_at desc);
create index if not exists mkt_activity_run_idx      on mkt_activity(run_id);

-- ── Notifications ─────────────────────────────────────────────────────────────
create table if not exists mkt_notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references profiles(id),
  type       text not null,
  payload    jsonb not null default '{}'::jsonb,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists mkt_notifications_user_idx on mkt_notifications(user_id, read);

-- ── Compliance regions (config) ───────────────────────────────────────────────
create table if not exists mkt_compliance_regions (
  id                   uuid primary key default gen_random_uuid(),
  region               text not null,
  framing              text not null default 'prediction_market', -- regulated_gambling|prediction_market|restricted|blocked
  min_age              int  not null default 18,
  rules                jsonb not null default '{}'::jsonb,
  platform_policy_pack text[] not null default '{}',
  mandatory_disclaimers text[] not null default '{}',
  human_approval       text not null default 'required_high_risk', -- required_for_all|required_high_risk|standard
  version              int  not null default 1,
  enabled              boolean not null default true,
  updated_at           timestamptz not null default now()
);
create unique index if not exists mkt_regions_active_idx on mkt_compliance_regions(region) where enabled;

-- ── RLS: admin read; writes via service role only ─────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'mkt_brands','mkt_campaigns','mkt_campaign_briefs','mkt_agent_runs','mkt_agent_tasks',
    'mkt_artifacts','mkt_artifact_versions','mkt_approvals','mkt_tool_calls','mkt_memory',
    'mkt_evaluation_runs','mkt_activity','mkt_notifications','mkt_compliance_regions'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "%s: admin read" on %I;', t, t);
    execute format('create policy "%s: admin read" on %I for select using (is_admin());', t, t);
  end loop;
end $$;

-- ── Seed compliance regions (configurable per region) ─────────────────────────
insert into mkt_compliance_regions (region, framing, min_age, rules, mandatory_disclaimers, human_approval)
values
  ('NG', 'regulated_gambling', 18,
   '{"gambling_claims":{"guarantees":"block","risk_free":"block","easy_money":"block"},"financial_claims":{"returns_promise":"block"},"targeting_minors":"block","celebrity_likeness":"block","medical_claims":"block"}'::jsonb,
   array['18+','Play responsibly','T&Cs apply'], 'required_for_all'),
  ('EU', 'prediction_market', 18,
   '{"gambling_claims":{"guarantees":"block","risk_free":"block"},"financial_claims":{"investment_framing":"block","returns_promise":"block"},"targeting_minors":"block","celebrity_likeness":"block"}'::jsonb,
   array['18+','Play responsibly'], 'required_high_risk'),
  ('US', 'blocked', 21,
   '{"all":"block"}'::jsonb,
   array['Not available in your region'], 'required_for_all')
on conflict do nothing;
