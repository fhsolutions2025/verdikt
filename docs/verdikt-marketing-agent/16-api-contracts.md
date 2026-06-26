# 16 — API Contracts

**Audience:** Backend, Frontend · **Read after:** 14-tech-arch, 15-data-model

---

## 1. Conventions

- Base path: `/api/company/marketing/v2`. REST-style, JSON.
- **Auth:** every endpoint admin-gated via `getAuthContext` (role `admin` in MVP; role-scoped V1). 401 unauthenticated, 403 unauthorised.
- **Errors:** `{ "error": "message", "code": "string", "details"?: {} }` with standard statuses (400 validation, 403 forbidden, 404 not found, 409 state conflict, 422 compliance/guard, 429 rate/budget, 502 provider, 503 not configured).
- **Idempotency:** mutating publish/export accept `Idempotency-Key` header.
- **Pagination:** `?limit&cursor`; lists return `{ data, next_cursor }`.
- All write effects emit `mkt_activity` + `audit_log`.

## 2. Endpoint index

| Area | Method | Path |
|------|--------|------|
| Brands | GET/POST | `/brands`, `/brands/{id}` (GET/PATCH) |
| Campaigns | GET/POST | `/campaigns`, `/campaigns/{id}` (GET/PATCH) |
| Run | POST | `/campaigns/{id}/run`, GET `/runs/{runId}` |
| Tasks | GET | `/runs/{runId}/tasks` |
| Artifacts | GET/POST | `/artifacts`, `/artifacts/{id}` (GET) |
| Versions | GET/POST | `/artifacts/{id}/versions` |
| Approvals | POST/GET | `/approvals`, `/artifacts/{id}/approvals` |
| Publishing/Export | POST | `/artifacts/{id}/export`, `/artifacts/{id}/publish` (V1) |
| Analytics | GET | `/campaigns/{id}/analytics` (V1) |
| Memory | GET/POST | `/memory`, `/memory/{namespace}` |
| Tools | GET | `/tools` (registry), POST `/tools/{id}/invoke` (internal) |
| Notifications | GET/PATCH | `/notifications`, `/notifications/{id}` |
| Activity | GET | `/campaigns/{id}/activity`, `/runs/{runId}/activity` |
| Chat | POST | `/chat` (agent control surface, streaming) |
| Compliance regions | GET/PUT | `/compliance/regions`, `/compliance/regions/{region}` |

## 3. Brands

### POST /brands ✅
- **Purpose:** Create a brand.
- **Request:** `{ name, voice: {tone,do[],dont[],lexicon[]}, brand_kit: {palette[],logo_ref}, regions: string[], competitors?: string[] }`
- **Response 201:** `{ brand: Brand }` (status `active` after confirm; W1).
- **Errors:** 400 (missing name/region), 403.
- **Permissions:** admin/lead.

### GET /brands ✅ → `{ data: Brand[] }`
### GET /brands/{id} ✅ → `{ brand, brand_memory_summary }`
### PATCH /brands/{id} ✅ (voice/kit/regions) → `{ brand }` (voice change → Lead approval; re-summarise memory)

## 4. Campaigns

### POST /campaigns ✅
- **Purpose:** Create campaign from a brief.
- **Request:** `{ brand_id, name, brief: { goal, audience, channels[], region, start_date, end_date, budget_usd, constraints? } }`
- **Response 201:** `{ campaign: Campaign }` (status `DRAFT`/`PLANNING`).
- **Errors:** 400 (missing brief fields → `{error, details:{needs:[]}}`), 404 brand, 422 region blocked.

### GET /campaigns ✅ `?status&brand_id` → `{ data: Campaign[] }`
### GET /campaigns/{id} ✅ → `{ campaign, artifacts_summary, latest_run }`
### PATCH /campaigns/{id} ✅ (name/dates/budget/status transitions within §5.1) → `{ campaign }` (409 on illegal transition)

## 5. Runs

### POST /campaigns/{id}/run ✅
- **Purpose:** Kick the orchestrator (plan or execute).
- **Request:** `{ mode: "plan" | "execute", workflow?: string }` (execute requires approved plan).
- **Response 202:** `{ run: AgentRun }` (async; poll status).
- **Errors:** 409 (no approved plan for execute), 429 (budget/concurrency), 503 (provider not configured).

### GET /runs/{runId} ✅ → `{ run: AgentRun, progress: {done,total}, eta_s }`
### GET /runs/{runId}/tasks ✅ → `{ data: AgentTask[] }`

## 6. Artifacts & versions

### GET /artifacts ✅ `?campaign_id&type&status` → `{ data: Artifact[] }`
### GET /artifacts/{id} ✅ → `{ artifact, latest_version, versions_count }`
### GET /artifacts/{id}/versions ✅ → `{ data: ArtifactVersion[] }` (immutable; includes eval + compliance)
### POST /artifacts/{id}/versions ✅
- **Purpose:** Human edit or regenerate → new version.
- **Request:** `{ source: "human"|"agent", content?: {}, regenerate?: { feedback } }`
- **Response 201:** `{ version: ArtifactVersion }` (re-runs eval + compliance; resets approval).

## 7. Approvals

### POST /approvals ✅
- **Purpose:** Decide a gate.
- **Request:** `{ artifact_id, artifact_version_id, gate: "plan"|"artifact"|"publish", decision: "approved"|"changes_requested"|"rejected", comment?, justification? }`
- **Response 201:** `{ approval: Approval, artifact_status }`.
- **Rules:** cannot `approved` if compliance `block` (422 unless `justification` + L5 override, audited); high-risk types require explicit single approval.
- **Errors:** 409 (already decided), 422 (compliance block).

### GET /artifacts/{id}/approvals ✅ → `{ data: Approval[] }`

## 8. Publishing / export

### POST /artifacts/{id}/export ✅ (MVP)
- **Purpose:** Download approved artifact as a file.
- **Request:** `{ format: "md"|"txt"|"json"|"png" }`
- **Response 200:** file stream (or `{ url }`).
- **Errors:** 409 (not approved), 422 (compliance not pass).

### POST /artifacts/{id}/publish (V1)
- **Request:** `{ channel, schedule_at?, approval_token }` (Idempotency-Key required).
- **Response 202:** `{ publishing_job }`.
- **Rules:** approved + compliant only; mandatory approval; no cross-channel fallback.
- **Errors:** 409 (not approved), 422 (compliance), 502 (channel), 409 (duplicate idempotency key → returns existing job).

## 9. Analytics (V1)
### GET /campaigns/{id}/analytics → `{ snapshots: AnalyticsSnapshot[], insights: Artifact[] }`

## 10. Memory
### GET /memory ✅ `?namespace&brand_id&key` → `{ data: MemoryRecord[] }`
### POST /memory/{namespace} ✅ (proposed write; Memory Manager applies rules)
- **Request:** `{ brand_id?, key, value, confidence, source }` → **Response 201:** `{ record, operation }` (strategy namespaces require Lead approval → 202 pending).

## 11. Tools
### GET /tools ✅ → `{ data: ToolDefinition[] }` (registry view for Settings)
### POST /tools/{id}/invoke (internal; not operator-facing) — used by ToolExecutor; admin/service only.

## 12. Notifications
### GET /notifications ✅ `?read` → `{ data: Notification[] }`
### PATCH /notifications/{id} ✅ `{ read: true }` → `{ notification }`

## 13. Activity
### GET /campaigns/{id}/activity ✅ `?limit&cursor` → `{ data: ActivityEvent[], next_cursor }`
### GET /runs/{runId}/activity ✅ → `{ data: ActivityEvent[] }`

## 14. Chat (control surface)
### POST /chat ✅ (streaming)
- **Purpose:** Operator commands the department; returns status + artifact references.
- **Request:** `{ campaign_id?, message, attachments? }`
- **Response:** streamed events: `status`, `plan_ready`, `artifact_created` (`{artifact_id}`), `needs_input` (`{needs[]}`), `error`. Each references canvas artifacts (never the sole copy).
- **Guardrails:** injection/PII strip on input (reuse chat guardrails); admin-gated.

## 15. Compliance regions
### GET /compliance/regions ✅ → `{ data: ComplianceRegion[] }`
### PUT /compliance/regions/{region} ✅ (admin/compliance)
- **Request:** full `ComplianceRegion` (13 §2). **Response:** `{ region }` (new version; re-evaluates in-flight artifacts).

## 16. Error responses (examples)
```json
422 { "error": "Compliance block: gambling guarantee in NG", "code": "compliance_block",
      "details": { "violations": [{"rule":"gambling_claims.guarantees","severity":"high","excerpt":"guaranteed win"}] } }
409 { "error": "Artifact not approved", "code": "not_approved" }
429 { "error": "Run budget cap reached", "code": "budget_capped" }
400 { "error": "Brief incomplete", "code": "needs_input", "details": { "needs": ["region","dates"] } }
```

## 17. Permissions matrix (MVP)

| Endpoint group | admin | lead (V1) | compliance (V1) | operator (V1) |
|----------------|-------|-----------|-----------------|---------------|
| Brands write | ✅ | ✅ | — | — |
| Campaigns/run | ✅ | ✅ | — | ✅ |
| Approvals (artifact) | ✅ | ✅ | ✅ | ✅ (low-risk) |
| Approvals (high-risk/override) | ✅ | ✅ | ✅ | — |
| Publish/export | ✅ | ✅ | ✅ (compliance) | ✅ (export) |
| Compliance regions | ✅ | — | ✅ | — |
| Tools/config | ✅ | — | — | — |

## 18. Acceptance criteria
- Every endpoint admin-gated; unauthorised → 403; unauthenticated → 401.
- Export/publish return 409/422 when not approved/compliant.
- `/chat` streams and references canvas artifacts; input is guardrailed.
- Region PUT versions the ruleset and triggers re-evaluation.
- All mutations emit activity + audit rows.
