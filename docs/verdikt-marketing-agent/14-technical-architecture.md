# 14 — Technical Architecture

**Audience:** Engineering, Architecture · **Read after:** 04-architecture, 08-tools · **Read before:** 15-data-model, 16-API

---

## 1. Overview

The Marketing Department is built on Verdikt's existing stack — **Next.js (App Router) + Supabase (Postgres/RLS/Edge Functions/Storage)** — extended with an agent runtime. It reuses `anthropic-proxy`, `ideogram-proxy`, `getAuthContext`, `ai_call_log`, `audit_log`, and the RLS/`is_admin()` model. The runtime is **department-agnostic**; marketing logic is a plug-in.

```
┌───────────────────────────────────────────────────────────────────────┐
│ Frontend (Next.js)  app/company/marketing/*  +  components/.../marketing │
│   3-panel workspace · conversation · canvas · activity feed              │
└───────────────▲───────────────────────────────────────────────────────┘
                │ REST (16), admin-gated (getAuthContext)
┌───────────────┴───────────────────────────────────────────────────────┐
│ Backend (Next route handlers)                                           │
│   API layer → Orchestrator → Agents → Skills → ToolExecutor             │
│   LLMRouter (multi-provider)   ComplianceEngine   MemoryManager          │
│   Queue/Jobs   Artifact+Version store   Eval harness                     │
└───────┬───────────────┬───────────────┬──────────────┬─────────────────┘
        │               │               │              │
   Supabase Postgres  Supabase Storage  Edge Functions  External providers
   (mkt_* tables,     (assets)          (anthropic-,    (LLM/image/video/
    RLS, audit)                          ideogram-proxy)  search/publish)
```

## 2. Frontend architecture

- **Location:** `app/company/marketing/` (routed workspace) + `components/company/marketing/`.
- **Layout:** three-panel (03) — server components for data fetch (campaigns, artifacts, activity), client components for conversation, canvas interactivity, streaming.
- **State:** server components + React state; SWR/polling for run status in MVP; SSE/streaming for agent progress (reuse `ChatWidget` streaming pattern).
- **Theming:** reuse Verdikt tokens + theme/skin system.
- **Auth:** admin-gated via existing session; routes enforce server-side.

## 3. Backend architecture

- **API layer:** Next route handlers under `app/api/company/marketing/v2/*` (16), each admin-gated with `getAuthContext`, validating input and delegating to services.
- **Services (lib):**
  - `lib/llm/router.ts` — provider-agnostic LLM (11).
  - `lib/marketing/orchestrator.ts` — run/task execution (04, 09).
  - `lib/marketing/agents/*` — sub-agent functions (prompts from 06).
  - `lib/marketing/compliance.ts` — region engine (13).
  - `lib/marketing/memory.ts` — Memory Manager (10).
  - `lib/marketing/tools/*` — ToolExecutor + adapters (08).
  - `lib/marketing/evals.ts` — eval harness (12).
- **Edge functions:** keep LLM/image keys server-side (`anthropic-proxy`, `ideogram-proxy`); add provider proxies as needed (V1).

## 4. Agent orchestration

- **Orchestrator** executes the workflow state machine (09): resolves the task graph, schedules ready tasks (respecting deps), runs them with bounded concurrency, enforces gates, handles retries/escalation (04 §11–13).
- **Determinism:** control flow is code/state-machine; LLM calls are confined to task nodes → testable and replayable.
- **Idempotency:** each task keyed by `(run_id, task_id)`; safe to resume; tool calls carry idempotency keys.

## 5. Queue system & job runners

- **MVP:** runs execute as background work kicked by `POST /campaigns/{id}/run`. For Verdikt's serverless model, long runs use a **job record** (`mkt_agent_runs` as the queue) + a runner that processes ready tasks; the UI polls status. Short tasks run inline within the request budget.
- **V1+:** a durable queue (e.g. Supabase cron + a worker, or an external queue) for parallel fan-out, scheduled workflows (monitoring), and retries with backoff. Video/large jobs are async with callbacks.
- **Concurrency/budget:** per-run concurrency cap + USD budget enforced by the runner (04 §6, 11 §6).

## 6. Tool execution layer

- **ToolExecutor** (08): single chokepoint for all external calls — validate → permission (persona allow-list) → rate-limit (`api_rate_limits`) → timeout → call → retry/fallback → cost log (`ai_call_log`/ledger) → `ToolCall` record + feed event. Secrets server-side only; outputs validated; PII/secret redaction in logs.

## 7. Artifact storage & versioning

- **Artifacts:** `mkt_artifacts` (identity/type/status) + `mkt_artifact_versions` (immutable content + provenance). Text content stored inline (jsonb/markdown); binary (images/video) in **Supabase Storage** with a DB pointer (reuse `marketing_assets` re-host pattern).
- **Versioning:** every generation/edit/regeneration creates a new immutable version; latest pointer on the artifact; full history retained for compare/rollback.
- **Provenance:** each version records agent, run/task, model+provider, prompt version, params, tool calls, eval scores, compliance result, cost.

## 8. Notifications

- `mkt_activity` (feed) + `Notification` records; Notification Agent emits feed events and user notifications (approvals, completions, errors). At-least-once with event-id dedup. Reuse Toast/notification UI patterns.

## 9. Audit logs

- Reuse `audit_log` (+ marketing event types): every state change, agent/tool action, approval, override, config/region change. Immutable; queryable; powers the activity feed and compliance audit (13).

## 10. Observability

- **Tracing:** run → tasks → tool/LLM calls correlated by `run_id`/`task_id`.
- **Metrics:** latency, eval pass rates, regeneration rate, cost per artifact, provider mix, error rates — surfaced in the workspace + existing API Health.
- **Logs:** structured, correlated, redacted.

## 11. Cost monitoring

- All LLM/image/video/tool spend → `ai_call_log` + a per-run cost ledger; per-run + per-day caps (11). Dashboard shows cost per approved artifact and per campaign. Caps enforced by router + orchestrator.

## 12. Error handling

- Centralised error taxonomy: transient (retry/fallback), quality (regenerate/escalate), compliance (block), budget (cap), auth/policy (escalate), validation (fail with diagnostic). Errors are user-actionable in UI (03) and logged.

## 13. Security

- Admin-gated routes (`getAuthContext`); Supabase **RLS** + `is_admin()` on all `mkt_*` tables; secrets in Supabase secrets; service-role only server-side; PII stripped at ingress; injection guard on operator input; tenant isolation (V1). Publishing requires approval tokens.

## 14. Multi-tenant architecture (V1+)

- MVP is single-tenant (Verdikt company console). V1 introduces `Organization` scoping: every `mkt_*` row carries `org_id`; RLS enforces org isolation; roles (operator/lead/compliance/admin) gate actions; per-org integrations, regions, budgets, and brand. The runtime is unchanged; tenancy is a data + policy layer.

## 15. Reusability for future departments

- The runtime packages (`llm`, `orchestrator`, `tools`, `memory`, `evals`, `compliance` core, artifact/version store, activity/audit) are **department-agnostic**. A new department ships under its own namespace (`lib/hr/*`, `app/company/hr/*`) supplying personas/prompts/skills/tools/workflows/regions; it reuses everything else. Table prefixes (`mkt_`, `hr_`, …) keep data namespaced.

## 16. Future scalability
- Durable queue + workers for high fan-out; embeddings store for semantic memory; caching tier; provider-load-balancing in the router; horizontal scaling of stateless runners; archival of old versions to cold storage.

## 17. Edge cases, risks, dependencies
- **Edge:** serverless execution time limits → job/queue model for long runs; chunk tasks.
- **Risk:** orchestration bugs causing stuck runs → idempotent resumable tasks + watchdog escalation.
- **Risk:** cost/throughput → caps, caching, routing.
- **Dependencies:** Supabase, `anthropic-proxy`/`ideogram-proxy`, `getAuthContext`, `ai_call_log`/`audit_log`/`api_rate_limits`, 15 (schema), 16 (API).

## 18. Acceptance criteria
- All marketing routes admin-gated; all `mkt_*` tables RLS-protected.
- Every external call goes through ToolExecutor with logging + cost.
- Runs are resumable/idempotent; artifacts versioned with full provenance.
- Runtime contains no marketing-specific logic (department isolation verified).
