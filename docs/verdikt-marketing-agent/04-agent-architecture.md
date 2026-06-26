# 04 — Agent Architecture

**Audience:** AI Engineering, Backend, Architecture · **Read after:** 02-PRD · **Read before:** 05-personas, 06-prompts, 09-workflows

---

## 1. Overview

The department is a **hierarchical multi-agent system**: a **Master Marketing Agent** (planner/orchestrator) that decomposes operator intent into tasks and delegates to **15 specialised sub-agents**, coordinated by a deterministic **Workflow Orchestrator**, over a shared **memory** and **tools** substrate, with **human-in-the-loop checkpoints** and **approval gates**.

Design tenets: deterministic orchestration around non-deterministic agents; every step observable; bounded authority per agent (05); provider-agnostic model access (11); reusable across future departments (P7).

## 2. Agent roster

| Agent | Class | Primary job |
|-------|-------|-------------|
| **Master Marketing Agent** | Orchestrator/planner | Interpret intent, plan, decompose, delegate, report |
| Campaign Planner | Planner | Turn brief → strategy + task graph + schedule |
| Research Agent | Worker | Audience/competitor/market/trend research |
| SEO Agent | Worker | Keyword strategy, on-page optimisation |
| Copywriter Agent | Worker | Blog/social/email/landing/ad copy |
| Creative Director | Planner/worker | Creative briefs, art direction, variant plans |
| Image Generation Agent | Worker | Image prompts → image provider |
| Video Generation Agent | Worker | Video prompts → video provider (V1+) |
| Publisher Agent | Worker | Publish/export to channels (export MVP) |
| Analytics Agent | Worker | Performance analysis (V1+) |
| Compliance Agent | Gate/worker | Region-scoped compliance checks |
| Reviewer Agent | Gate/worker | Quality review against rubrics/evals |
| Learning Agent | Worker | Extract insights from results → memory (V1+) |
| Memory Manager Agent | System | Read/write/summarise/retrieve memory |
| Workflow Orchestrator | System | Execute workflow state machines deterministically |
| Notification Agent | System | Emit notifications/feed events, request approvals |

## 3. Orchestration model

```
Operator intent (chat)
        │
        ▼
  Master Marketing Agent ──plan──> Campaign plan (artifact) ──[approval gate]──┐
        │                                                                       │
        ▼ (on approval)                                                         │
  Workflow Orchestrator ── selects workflow (09) ──> task graph                 │
        │                                                                       │
        ├── delegates tasks (parallel where independent) ──> sub-agents          │
        │        each sub-agent: read memory → call tools/LLM → produce artifact │
        │        → Reviewer eval → Compliance check → versioned                  │
        ▼                                                                       │
  Notification Agent ── feed events + approval requests ──────────────────────┘
        │
        ▼
  Memory Manager ── persists provenance + learnings
```

- **Master** does *planning and delegation*, not bulk content creation.
- **Workflow Orchestrator** runs the deterministic state machine (states, retries, gates) so control flow is auditable and testable independent of LLM variance.
- Sub-agents are **stateless workers**: all context comes from memory + task inputs; all output is an artifact.

## 4. Planning model

The Master Agent uses **plan-then-execute** (not free-form ReAct) for campaigns:
1. Parse intent → structured **brief** (fill gaps by asking the operator).
2. Retrieve Brand + Campaign + Competitor memory.
3. Produce a **plan artifact**: objectives, audience, channels, content list, sub-agent task graph (with dependencies), schedule, budget estimate, region.
4. Submit plan to approval gate (auto-approve allowed only below a configured risk/cost threshold).
5. On approval, hand the task graph to the Orchestrator.

Sub-agents may use bounded **ReAct** internally (think → tool → observe) within their task, capped by step/cost limits (11/13).

## 5. Task decomposition

A plan yields a **task graph** of `AgentTask` nodes:

```
Task { id, campaign_id, run_id, agent, type, inputs, depends_on[], status, budget }
```
- **Type examples:** `research.competitors`, `seo.keywords`, `copy.blog`, `copy.social`, `creative.brief`, `image.generate`, `compliance.check`, `review.eval`.
- **Dependencies:** e.g. `copy.blog depends_on seo.keywords`; `image.generate depends_on creative.brief`; `compliance.check depends_on <artifact>`.
- The Orchestrator topologically schedules tasks, running independent branches in parallel.

## 6. Parallel execution

- Independent tasks (e.g. 5 social posts, N image variants, research vs SEO) run concurrently up to a concurrency cap.
- A per-run **budget** and **concurrency limit** bound fan-out (13). Each task logs to `ai_call_log`.
- Aggregation tasks (e.g. assemble campaign pack) wait on their dependencies.

## 7. State transitions (run + task)

### Run states
`queued → planning → awaiting_plan_approval → running → (review) → completed | failed | partial | cancelled | budget_capped`

### Task states
`pending → ready (deps met) → running → (succeeded | failed → retrying | failed_final) → reviewed → compliant|blocked`

Every transition emits a `mkt_activity` event. State lives in `mkt_agent_runs` / `mkt_agent_tasks`.

## 8. Human-in-the-loop checkpoints

| Checkpoint | Default | Configurable |
|-----------|---------|--------------|
| Plan approval | Required | Auto-approve below risk/cost threshold |
| Artifact approval (publish/export) | Required | Auto-approve low-risk types within policy |
| High-risk types (PR, paid spend, claims, terms) | **Always required** | Not waivable |
| Compliance hard-block | Mandatory stop | Not waivable; needs resolution |
| Brand-voice change | Required (Lead) | No |

## 9. Artifact creation (contract)

Every worker sub-agent **shall**:
1. Produce a typed artifact and an immutable `ArtifactVersion` with provenance: `{agent, run_id, task_id, model, provider, prompt_id, params, tool_calls[], eval_scores, compliance_result, cost}`.
2. Emit `artifact.created` / `artifact.versioned` feed events.
3. Never mutate a prior version; edits/regenerations create new versions.

## 10. Tool-use rules

- Tools are invoked only through the **ToolExecutor** (08/14): typed inputs, permission check, rate-limit check, timeout, retry policy, fallback, and logging.
- An agent may only call tools listed in its persona's tool access (05).
- Destructive/publishing tools require an approved artifact + passing compliance (P4).
- Every tool call → `tool.called` feed event + `ToolCall` record.

## 11. Failure handling

| Failure | Handling |
|---------|----------|
| LLM provider error/timeout | Router retry (same provider) → fallback provider (11) → task fail if exhausted |
| Tool error | Retry per tool policy (08) → fallback behaviour → mark task failed, run `partial` |
| Eval fail (below threshold) | Auto-regenerate up to N times (config) → escalate to human if still failing |
| Compliance hard-block | Stop artifact, mark `blocked`, request human resolution; do not retry blindly |
| Budget cap reached | Halt further fan-out, mark run `budget_capped`, surface partial results |
| Invalid structured output | Repair-parse → one re-ask with schema → fail task with diagnostic |

## 12. Retries

- **Transient (network/5xx/timeout):** exponential backoff (e.g. 1s, 2s, 4s), max 3, per call.
- **Quality (eval miss):** bounded regeneration (default max 2) with the reviewer's feedback injected.
- **Never** auto-retry a compliance hard-block or a human rejection.

## 13. Escalations

- Repeated eval failure, compliance ambiguity, missing brief data, provider total outage, or budget exhaustion → **Notification Agent** raises a human escalation (feed + Approvals + notification), pausing the affected branch while others continue.
- Escalation records who/what/why for audit.

## 14. Reusability for other departments

The **Orchestrator, ToolExecutor, Memory Manager, Reviewer, Compliance, Notification, and the run/task/artifact data model are department-agnostic.** A new department supplies: its sub-agent personas (05-style), prompts (06), skills (07), tools subset (08), workflows (09), memory namespaces (10), routing entries (11), evals (12), and compliance rules (13). Marketing-specific code lives under a `marketing` namespace; the runtime does not.

## 15. Acceptance criteria

| # | Criterion |
|---|-----------|
| AA-1 | A brief produces a plan artifact gated by approval before any generation |
| AA-2 | Approved plan yields a task graph executed with correct dependency ordering and parallelism |
| AA-3 | Every artifact carries full provenance and ≥1 immutable version |
| AA-4 | Every agent/tool/state action emits a feed event |
| AA-5 | Failures follow §11–§13; no compliance block is auto-retried |
| AA-6 | Runtime components (orchestrator/executor/memory/reviewer/compliance) contain no marketing-specific logic |

## 16. Risks & dependencies

- **Risk:** orchestration complexity → keep control flow deterministic and testable; agents only inside nodes.
- **Risk:** runaway fan-out cost → budget + concurrency caps (13).
- **Dependencies:** 05 (authority), 06 (prompts), 08 (tools), 09 (workflows), 10 (memory), 11 (routing), 14 (runtime), 15 (data model).
