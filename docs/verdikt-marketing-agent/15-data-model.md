# 15 — Data Model

**Audience:** Backend, Engineering · **Read after:** 14-tech-arch · **Read before:** 16-API

---

## 1. Conventions

- Postgres (Supabase). Table prefix **`mkt_`** (department-namespaced; HR would be `hr_`, etc.).
- All tables: `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`, RLS enabled, admin-gated via `is_admin()` (reuse migration 0026). V1 adds `org_id` for multi-tenancy.
- Writes are service-role (server) only; reads admin-gated.
- **MVP** tables marked ✅; others are V1+ (specified now for completeness/reuse).

## 2. Entity map

```
Organization 1─* User
Organization 1─* Brand 1─* Campaign 1─* CampaignBrief
Brand 1─* BrandMemory
Campaign 1─* AgentRun 1─* AgentTask
Campaign 1─* Artifact 1─* ArtifactVersion
Artifact 1─* Approval        Artifact 1─* Comment
AgentTask 1─* ToolCall
Workflow 1─* WorkflowRun
* MemoryRecord (namespaced)   * AnalyticsSnapshot
Campaign/Artifact 1─* PublishingJob ─* ChannelConnection
* EvaluationRun   * Notification   * AuditLog
ComplianceRegion (config)
```

## 3. Entities

### Organization (V1)
- **Purpose:** Tenant boundary.
- **Fields:** `id, name, plan, settings jsonb, created_at`.
- **Relationships:** 1–* User/Brand.
- **Indexes:** pk.
- **Lifecycle:** created → active → suspended/archived.

### User ✅(admin) / V1 roles
- **Purpose:** Operator/lead/compliance/admin.
- **Fields:** `id (= profiles.id), org_id, role (operator|lead|compliance|admin), prefs jsonb`.
- **Relationships:** belongs to Org; approver of Approvals.
- **Indexes:** `(org_id)`, `(role)`.
- **Lifecycle:** invited → active → disabled. (MVP reuses Verdikt `profiles`/admin.)

### Brand ✅ (`mkt_brands`)
- **Purpose:** A marketed brand/product.
- **Fields:** `id, org_id, name, voice jsonb, brand_kit jsonb (palette/logo refs), regions text[], competitors text[], status (draft|active|archived), created_by, created_at`.
- **Relationships:** 1–* Campaign, BrandMemory.
- **Indexes:** `(org_id)`, `(status)`.
- **Lifecycle:** draft → active → archived (§W1).

### BrandMemory ✅ (rows in `mkt_memory`, namespace=brand) — see MemoryRecord
- Stored as MemoryRecord with `namespace='brand'`, scoped by `brand_id`.

### Campaign ✅ (`mkt_campaigns`)
- **Purpose:** Primary unit of work.
- **Fields:** `id, org_id, brand_id, name, goal, status (DRAFT|PLANNING|GENERATING|IN_REVIEW|READY|LIVE|COMPLETED|BLOCKED|ARCHIVED), region, start_date, end_date, budget_usd, plan jsonb, created_by, created_at`.
- **Relationships:** *–1 Brand; 1–* Brief/AgentRun/Artifact/PublishingJob.
- **Indexes:** `(brand_id)`, `(status)`, `(org_id, created_at desc)`.
- **Lifecycle:** §5.1 (02) state machine.

### CampaignBrief ✅ (`mkt_campaign_briefs`)
- **Purpose:** Structured intent that seeds a campaign.
- **Fields:** `id, campaign_id, goal, audience, channels text[], region, dates, budget_usd, constraints jsonb, raw_input text, created_at`.
- **Relationships:** *–1 Campaign.
- **Indexes:** `(campaign_id)`.
- **Lifecycle:** created → consumed by planner (immutable thereafter; edits create new brief).

### AgentRun ✅ (`mkt_agent_runs`)
- **Purpose:** One orchestrated execution (also the job/queue record).
- **Fields:** `id, campaign_id, workflow, status (queued|planning|awaiting_plan_approval|running|review|completed|partial|failed|cancelled|budget_capped), budget_usd, spent_usd, started_at, finished_at, error text`.
- **Relationships:** *–1 Campaign; 1–* AgentTask.
- **Indexes:** `(campaign_id)`, `(status)`.
- **Lifecycle:** 04 §7 run states.

### AgentTask ✅ (`mkt_agent_tasks`)
- **Purpose:** A unit of work for a sub-agent.
- **Fields:** `id, run_id, agent, type, depends_on uuid[], inputs jsonb, outputs jsonb, status (pending|ready|running|succeeded|failed|reviewed|blocked), retries int, cost_usd, started_at, finished_at, error`.
- **Relationships:** *–1 Run; 1–* ToolCall; may produce Artifact.
- **Indexes:** `(run_id)`, `(status)`.
- **Lifecycle:** 04 §7 task states; idempotent on `(run_id,id)`.

### Artifact ✅ (`mkt_artifacts`)
- **Purpose:** A marketing output identity.
- **Fields:** `id, campaign_id, type (blog|social|image|email|ad|plan|research|video), channel, status (draft|needs_review|approved|changes_requested|rejected|exported|published), latest_version_id, title, created_by_agent, created_at`.
- **Relationships:** *–1 Campaign; 1–* ArtifactVersion/Approval/Comment.
- **Indexes:** `(campaign_id)`, `(type)`, `(status)`.
- **Lifecycle:** 02 §5.3 content lifecycle.

### ArtifactVersion ✅ (`mkt_artifact_versions`)
- **Purpose:** Immutable content snapshot + provenance.
- **Fields:** `id, artifact_id, version int, content jsonb, asset_url, source (agent|human), provenance jsonb (agent, run_id, task_id, model, provider, prompt_id, params, tool_calls, cost), eval_scores jsonb, compliance_result jsonb, created_at`.
- **Relationships:** *–1 Artifact.
- **Indexes:** `(artifact_id, version desc)` unique.
- **Lifecycle:** immutable once written; new edits → new version.

### Approval ✅ (`mkt_approvals`)
- **Purpose:** Authorisation record (gate).
- **Fields:** `id, artifact_id, artifact_version_id, gate (plan|artifact|publish), decision (pending|approved|changes_requested|rejected), approver_id, comment, justification (override), created_at`.
- **Relationships:** *–1 Artifact/Version; *–1 User.
- **Indexes:** `(artifact_id)`, `(decision)`.
- **Lifecycle:** pending → decided (append-only; overrides recorded).

### Comment (V1) (`mkt_comments`)
- **Purpose:** Review discussion.
- **Fields:** `id, artifact_id, version_id, author_id, body, created_at`.
- **Indexes:** `(artifact_id)`.

### ToolCall ✅ (`mkt_tool_calls`)
- **Purpose:** Record of an external tool invocation.
- **Fields:** `id, task_id, tool, inputs jsonb (redacted), output_summary jsonb, status, latency_ms, cost_usd, error, created_at`.
- **Relationships:** *–1 AgentTask.
- **Indexes:** `(task_id)`, `(tool)`.
- **Lifecycle:** one per call; immutable.

### Workflow (config) (`mkt_workflows`)
- **Purpose:** Workflow definition (09).
- **Fields:** `id, key, name, version, definition jsonb (steps/gates), enabled, created_at`.
- **Indexes:** `(key, version)`.
- **Lifecycle:** versioned; eval-gated changes.

### WorkflowRun
- **Note:** In MVP, `AgentRun` carries the workflow execution (field `workflow`). A separate `mkt_workflow_runs` may be split out in V1 for scheduled/standalone workflows (monitoring). Fields mirror AgentRun + `workflow_id`.

### MemoryRecord ✅ (`mkt_memory`)
- **Purpose:** All memory namespaces (10).
- **Fields:** `id, org_id, brand_id, namespace (brand|user|campaign|asset|competitor|conversation|publishing|performance|learning|approval), key, value jsonb, confidence numeric, source, embedding vector (V1), updated_at, created_at`.
- **Indexes:** `(namespace, brand_id, key)`, `(namespace, key)`; vector index V1.
- **Lifecycle:** per-namespace update/retention (10); versioned on change.

### PublishingJob (V1) (`mkt_publishing_jobs`)
- **Purpose:** Track publish/export.
- **Fields:** `id, artifact_version_id, channel, status (queued|publishing|published|failed|exported), scheduled_at, receipt_url, idempotency_key, error, created_at`.
- **Relationships:** *–1 ArtifactVersion; *–1 ChannelConnection.
- **Indexes:** `(status)`, unique `(idempotency_key)`.
- **Lifecycle:** queued → publishing → published/failed (MVP: exported).

### ChannelConnection (V1) (`mkt_channel_connections`)
- **Purpose:** Stored channel credentials/config.
- **Fields:** `id, org_id, channel, account_ref, token_ref (secret pointer), scopes, status, created_at`.
- **Indexes:** `(org_id, channel)`.
- **Lifecycle:** connected → active → expired/revoked.

### AnalyticsSnapshot (V1) (`mkt_analytics_snapshots`)
- **Purpose:** Performance over time.
- **Fields:** `id, campaign_id, artifact_id, channel, metrics jsonb, captured_at`.
- **Indexes:** `(campaign_id, captured_at)`.

### EvaluationRun ✅ (`mkt_evaluation_runs`)
- **Purpose:** Eval results (12).
- **Fields:** `id, target_version_id, eval_id, scores jsonb, verdict (pass|regenerate|escalate|block), model, dataset_version, created_at`.
- **Relationships:** *–1 ArtifactVersion.
- **Indexes:** `(target_version_id)`, `(eval_id)`.
- **Lifecycle:** immutable per run.

### Notification ✅ (`mkt_notifications`)
- **Purpose:** User-facing alerts.
- **Fields:** `id, user_id, type, payload jsonb, read boolean, created_at`.
- **Indexes:** `(user_id, read)`.

### AuditLog ✅ (reuse `audit_log` + mkt event types)
- **Purpose:** Immutable record of all actions.
- **Fields (existing):** `id, actor, action, target, metadata jsonb, created_at` (+ marketing event taxonomy).
- **Indexes:** `(target)`, `(created_at desc)`.
- **Lifecycle:** append-only.

### ComplianceRegion ✅ (`mkt_compliance_regions`)
- **Purpose:** Per-region ruleset (13).
- **Fields:** `id, region, framing, min_age, rules jsonb, platform_policy_pack text[], mandatory_disclaimers text[], human_approval, version, enabled, updated_at`.
- **Indexes:** `(region)` unique-active.
- **Lifecycle:** versioned; change re-evaluates in-flight artifacts.

### mkt_activity ✅ (activity feed)
- **Purpose:** Human-readable action stream (03 §5).
- **Fields:** `id, run_id, campaign_id, type, actor, text, target_ref, severity, created_at`.
- **Indexes:** `(campaign_id, created_at desc)`, `(run_id)`.
- **Lifecycle:** append-only (mirrors AuditLog subset for UI).

## 4. MVP table set (Phase B1 migration `0029_marketing_dept.sql`)
`mkt_brands`, `mkt_campaigns`, `mkt_campaign_briefs`, `mkt_agent_runs`, `mkt_agent_tasks`, `mkt_artifacts`, `mkt_artifact_versions`, `mkt_approvals`, `mkt_tool_calls`, `mkt_memory`, `mkt_evaluation_runs`, `mkt_activity`, `mkt_compliance_regions`, `mkt_notifications`. (Asset library reuses `marketing_assets`.) All RLS admin-gated; `org_id` nullable in MVP (single-tenant), enforced V1.

## 5. Indexing & performance
- Hot paths: campaign list by status; artifacts by campaign+type; activity by campaign desc; latest version per artifact; memory by `(namespace, brand_id, key)`. Indexes above cover these.

## 6. Data lifecycle & retention
- Versions/approvals/audit retained long (compliance). Conversation memory session-scoped. Low-confidence learning decays. Soft-delete for assets/brands (archive, not hard-delete) to preserve provenance.

## 7. Acceptance criteria
- MVP migration creates the §4 tables with RLS + `is_admin()` and the indexes above.
- Artifact↔Version is 1–* with immutable versions and a `latest_version_id` pointer.
- Every state-changing entity emits an `mkt_activity` + `audit_log` row.
- Compliance result + eval scores are attached to each `ArtifactVersion`.
