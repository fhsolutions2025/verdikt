# 01 — Product Vision

**Audience:** Product, Leadership, AI Engineering, Compliance · **Read after:** 00-index · **Read before:** 02-PRD

---

## 1. Vision

Verdikt shall operate an **autonomous marketing department** that a single operator can run like a team. The operator states intent in natural language; the system plans the work, executes it across specialised agents, produces reviewable and versioned artifacts, enforces brand and regional compliance, and surfaces every action for oversight and approval. The operator's job shifts from *doing* marketing to *directing and approving* it.

> One operator + the Verdikt Marketing Agent shall produce the output of a 6–10 person marketing team, at controlled cost, with full auditability, while never publishing anything a human (or an explicit automation rule) has not authorised.

## 2. Why Verdikt Marketing exists

Verdikt is a prediction-market / iGaming platform operating across Africa, Europe, and global markets. Marketing for this category is **high-volume, multi-channel, fast-moving, and heavily regulated**:

- Campaigns must ship continuously (sports fixtures, market events, promotions) across blog, social, email, paid, and community.
- Every asset must respect **regional gambling/financial advertising law**, responsible-gaming rules, age-gating, and platform ad policies — which differ by jurisdiction.
- Creative volume (resized variants per platform) is large and repetitive.
- The current Verdikt Marketing tab is a single-shot copy + image generator with no campaign structure, no versioning, no approvals, and no memory.

A generic AI tool cannot solve this because it has no brand memory, no compliance engine, no approval gating, no artifact lifecycle, and no auditability. Verdikt needs a **system of record and a system of action**, not a prompt box.

## 3. Problem statement

| Problem | Today | Consequence |
|---------|-------|-------------|
| No campaign structure | One-off generations | No continuity, no reuse, no reporting |
| No versioning | Outputs are ephemeral | Cannot iterate, compare, or roll back |
| No approvals | Anything generated is "done" | Compliance and brand risk |
| No regional compliance | Manual judgement | Legal exposure in regulated markets |
| No memory | Re-explain brand every time | Inconsistent voice, wasted effort |
| No orchestration | Human stitches steps | Slow, error-prone, not scalable |
| No observability | No record of what ran | No cost control, no audit, no trust |

## 4. Target users

| Persona | Role | Primary need |
|---------|------|--------------|
| **Marketing Operator (Alex)** | Runs day-to-day marketing solo or in a small team | Direct the agent, review/approve artifacts, ship campaigns fast |
| **Marketing Lead** | Owns strategy, brand, budget | Set brand voice, approve high-risk work, see performance |
| **Compliance Officer** | Owns legal/regulatory sign-off | Configure region rules, review gated artifacts, audit trail |
| **Platform Admin / Eng** | Operates the system | Manage integrations, model routing, costs, evals, kill-switch |
| **(Future) Department Heads** | HR/Finance/Sales/Legal/Support | Reuse the same agent framework for their function |

All users in MVP are **admin-gated** (Verdikt company console). Multi-tenant, role-scoped access is a V1+ concern (see 17).

## 5. Product principles

1. **Workspace over chat.** Chat commands; the canvas holds the work. (P1)
2. **Everything is an artifact, everything is versioned.** (P2)
3. **Nothing ships without authorisation.** Approval gates by default. (P4)
4. **Compliance is a first-class engine, configured per region.** (P6)
5. **Brand memory makes the system improve over time.** (P5/10)
6. **Observable by construction.** Every action is logged and visible. (P3)
7. **Multi-provider, no lock-in.** Route to the best/cheapest capable model. (P5)
8. **Modular.** Marketing is one department on a reusable runtime. (P7)
9. **Cost-aware.** Per-run budgets, caching, model routing by task value.
10. **Human authority is explicit and bounded.** (P8)

## 6. What makes this different

| Tool | What it is | What it lacks vs Verdikt Marketing |
|------|-----------|-----------------------------------|
| **ChatGPT / generic LLM** | Conversational generator | No brand memory, no artifacts/versioning, no approvals, no compliance engine, no orchestration, no auditability |
| **Canva** | Design editor | No autonomous planning, no copy/SEO, no compliance, no campaign lifecycle, human-driven |
| **HubSpot** | CRM + marketing automation | Not generative/autonomous; humans create content; no agent orchestration; no creative generation |
| **Hootsuite / Buffer** | Social scheduling | Scheduling only; no content creation, no strategy, no compliance reasoning |
| **Jasper / Copy.ai** | AI copy tools | Copy only; no creative/video, no campaign orchestration, weak compliance, no approval/audit, no memory of results |

**Verdikt's wedge:** an *autonomous department* that combines planning + multi-modal creation + **regional compliance** + **versioned artifacts** + **approval gates** + **memory + learning** + **full observability**, purpose-built for a regulated, high-velocity iGaming/prediction-market operator — on a **reusable, multi-department agent runtime**.

## 7. Success metrics

### North-star
- **Authorised artifacts shipped per operator per week** (volume of *approved* output per human).

### Supporting product metrics
| Metric | Definition | MVP target |
|--------|------------|-----------|
| Time-to-first-artifact | Brief submitted → first reviewable artifact | < 90s |
| Campaign cycle time | Brief → approved campaign pack | < 1 day (from days) |
| Approval pass rate | Artifacts approved without major edit | ≥ 70% |
| Compliance block precision | Gated/blocked items that were genuinely risky | ≥ 90% |
| Brand-voice eval score | Automated voice consistency (12-eval) | ≥ 0.85 |
| Cost per approved artifact | LLM+image+tool spend / approved artifacts | Tracked, downward |
| Rework rate | Artifacts requiring > 2 regenerations | < 20% |

### Business metrics (V1+)
- Campaign reach / CTR / conversion vs human baseline; cost per acquisition; channel ROI; content velocity.

## 8. Non-goals

The product **shall not** (in this spec scope):

- Replace the compliance officer's legal judgement — it **assists and gates**, never self-certifies legal sign-off.
- Auto-publish high-risk content without an approval or an explicit, bounded automation rule.
- Be a general-purpose chatbot or open-ended assistant.
- Manage paid-ad **budgets/bidding** autonomously in MVP (planning only; spend is V1+).
- Provide a full design editor (it generates and versions creatives; fine pixel editing is out).
- Guarantee factual correctness without evals + human review (hallucination is mitigated, not eliminated).
- Build the non-marketing departments now — only keep the runtime reusable for them.

## 9. Risks & dependencies

| Risk | Mitigation |
|------|------------|
| Regulatory exposure (gambling ads) | Configurable compliance engine + mandatory approval gates + audit (13) |
| Hallucinated claims | Evals (12) + Compliance Agent + human approval |
| Cost blow-out from agent fan-out | Per-run budget caps, model routing (11), caching, `ai_call_log` |
| Brand drift | Brand Memory + voice evals (10, 12) |
| Vendor lock / outage | Multi-provider routing + fallbacks (08, 11) |
| Scope creep beyond MVP | Hard MVP boundary in 02/17 |

**Dependencies:** Verdikt Supabase stack, `anthropic-proxy` + `ideogram-proxy`, admin auth (`getAuthContext`), `ai_call_log`/`audit_log`, and provider API keys (Anthropic + Ideogram live; OpenAI/publisher keys for V1+).
