# Verdikt Marketing Agent — Documentation Index

**Status:** Draft v0.1 · **Owner:** Verdikt Platform / AI Engineering · **Audience:** Product, Design, Engineering, AI Engineering, Compliance

---

## 1. What this package is

This is the implementation-ready specification for the **Verdikt Autonomous Marketing Department** — an AI-operated marketing function embedded in the Verdikt company console. It is **not** a chatbot and **not** a content-generation toy. It is a system in which a **Master Marketing Agent** plans, decomposes, and executes marketing work through specialised sub-agents; every output is a **versioned artifact**; every action is recorded in an **activity feed**; and every publish or destructive action passes an **approval gate** unless an automation rule explicitly permits it.

The conversation panel is the **control surface**. The **workspace** (campaigns, artifacts, calendar, asset library, analytics) is where the work actually appears and is reviewed.

The framework is deliberately **department-agnostic**. Marketing is the first department. HR, Finance, Sales, Legal, and Support are intended to reuse the same agent runtime, memory system, tools registry, evals harness, approval model, and data model.

## 2. Core principles (apply to every document)

| # | Principle | Implication |
|---|-----------|-------------|
| P1 | Conversation is a control surface, not the product | Work is rendered in the canvas; chat issues commands and reports status |
| P2 | Every output is a versioned artifact | No ephemeral results; `Artifact` + `ArtifactVersion` are mandatory |
| P3 | Every action is visible | All agent/tool/human actions emit to the activity feed and `AuditLog` |
| P4 | Publish/destructive needs approval | Approval gates by default; automation rules may waive within policy |
| P5 | Multi-provider by design | LLM/image/video providers sit behind a routing layer; no hard vendor lock |
| P6 | Compliance is configurable per region | A `ComplianceRegion` ruleset decides framing and hard blocks per jurisdiction |
| P7 | Modular for future departments | Marketing-specific logic is isolated from the reusable agent runtime |
| P8 | Human authority is explicit | Each agent has bounded decision rights; escalation paths are defined |

## 3. Who should read what

| Role | Read first | Then |
|------|-----------|------|
| Product Manager | 01, 02, 17 | 03, 09, 12 |
| Designer | 03, 02 | 09, 05 |
| Frontend Engineer | 03, 16, 14 | 15, 09 |
| Backend Engineer | 14, 15, 16, 08 | 04, 10 |
| AI Engineer | 04, 05, 06, 07, 11, 12 | 10, 13 |
| Compliance / Legal | 13, 02 | 05, 12 |
| Eng Lead / Architect | 14, 04, 15, 17 | all |

## 4. Recommended reading order

1. **01 – Product Vision** — why this exists, what it is not.
2. **02 – Marketing Department PRD** — scope, departments, lifecycle, requirements.
3. **03 – Workspace UX Spec** — how it looks and behaves.
4. **04 – Agent Architecture** — the master/sub-agent system.
5. **05 – Agent Personas** — authority and decision rights per agent.
6. **06 – System Prompts** — exact prompt specifications.
7. **07 – Skills Library** — reusable capabilities.
8. **08 – Tools Registry** — external integrations.
9. **09 – Workflow Library** — end-to-end orchestrations.
10. **10 – Memory System** — what the system remembers.
11. **11 – LLM Config** — model routing and parameters.
12. **12 – Evals & Quality Gates** — how quality is measured.
13. **13 – Guardrails & Compliance** — what is forbidden and gated.
14. **14 – Technical Architecture** — the runtime.
15. **15 – Data Model** — entities and lifecycles.
16. **16 – API Contracts** — endpoints.
17. **17 – Roadmap** — MVP → Enterprise.

## 5. How the documents relate

```
01 Vision ─┐
           ├─> 02 PRD ─┬─> 03 UX ──────────────┐
           │           ├─> 09 Workflows ───────┤
           │           └─> 13 Compliance ──────┤
04 Agent Arch ─┬─> 05 Personas ─> 06 Prompts ──┤
               ├─> 07 Skills ────> 08 Tools ────┤──> 14 Tech Arch ─> 15 Data Model ─> 16 API
               ├─> 10 Memory                    │
               └─> 11 LLM Config ─> 12 Evals ───┘
                                                17 Roadmap (sequences all of the above)
```

- **02** sets requirements that **03/09/13** satisfy.
- **04** defines the runtime that **05/06/07/08/10/11** parameterise.
- **12** validates **06/07/09** outputs against rubrics.
- **14/15/16** are the buildable substrate; **17** sequences delivery.

## 6. Glossary — core terms

| Term | Definition |
|------|------------|
| **Workspace** | The full UI surface (nav + conversation + canvas + activity feed) where marketing work is created, reviewed, approved, and stored. The product, as opposed to the chat. |
| **Agent** | An LLM-driven actor with a defined role, system prompt, bounded authority, tool access, and decision rights. The **Master Marketing Agent** orchestrates; **sub-agents** specialise. |
| **Sub-agent** | A specialised agent invoked by the master or workflow orchestrator to perform one class of task (e.g. Copywriter, SEO, Compliance). |
| **Artifact** | A durable, typed marketing output (blog, social post, image, campaign brief, ad, email). Always versioned via `ArtifactVersion`. |
| **Artifact Version** | An immutable snapshot of an artifact's content at a point in time, with provenance (agent, run, model, prompt, evals). |
| **Campaign** | A goal-scoped container of briefs, tasks, artifacts, approvals, schedule, and results. The primary unit of marketing work. |
| **Brief** | The structured statement of intent (goal, audience, channels, constraints, budget, region) that seeds a campaign. |
| **Workflow** | A deterministic orchestration of steps, sub-agents, tools, states, and approval gates that produces artifacts. |
| **Tool** | A typed, permissioned external capability (web search, image gen, publisher API, analytics) the runtime can execute with logging, retries, and fallbacks. |
| **Skill** | A reusable, model-driven capability (e.g. SEO writing, competitor research) with inputs, process, output schema, and quality checklist. Skills compose into workflows. |
| **Memory** | Durable, retrievable knowledge (brand, user, campaign, asset, competitor, conversation, publishing, performance, learning, approval) with update/retrieval/retention rules. |
| **Approval Gate** | A checkpoint where a human (or an automation rule within policy) must authorise progression — always required for publish and destructive actions. |
| **Evaluation (Eval)** | An automated or human scoring of an artifact/run against a rubric and threshold; gates promotion/publish and detects regressions. |
| **Activity Feed** | The append-only, human-readable stream of every agent action, tool call, state change, and approval, backed by `AuditLog`. |
| **Compliance Region** | A configurable ruleset for a jurisdiction that sets product framing (gambling vs prediction-market) and hard content rules. |
| **Automation Rule** | A scoped policy that allows the system to skip a manual gate (e.g. auto-approve a blog draft below risk threshold) within defined bounds. |

## 7. Conventions used in these docs

- **"shall"** denotes a hard requirement; **"should"** a strong recommendation; **"may"** an option.
- Tables, state machines, and acceptance criteria are used in preference to prose.
- Every functional area lists **edge cases**, **risks**, and **dependencies**.
- IDs use `mkt_*` table prefixes (Marketing) to keep the department namespace clean and reusable for `hr_*`, `fin_*`, etc.
- References to existing Verdikt components are named explicitly (e.g. `anthropic-proxy`, `ideogram-proxy`, `getAuthContext`, `ai_call_log`).

## 8. Document status

| Doc | State | Build dependency |
|-----|-------|------------------|
| 00–17 | Draft v0.1 | MVP build (Phase B) implements the subset marked **MVP** in 02 and 17 |
