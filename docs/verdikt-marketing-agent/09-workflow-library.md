# 09 — Workflow Library

**Audience:** Product, Backend, AI Engineering · **Read after:** 04-architecture, 07-skills, 08-tools · **Read before:** 14-tech-arch

---

## 1. Workflow model

A **workflow** is a deterministic orchestration (run by the Workflow Orchestrator, 04) of steps, sub-agents, tools, states, and **approval gates** that produces versioned artifacts. Workflows are data (definitions), not code, so they are configurable and reusable across departments.

**Workflow contract:** `Trigger · Actors · Inputs · Steps · Sub-agents · Tools · States · Approval gates · Outputs · Error handling · Acceptance criteria.`

Every step emits activity events; every produced artifact is versioned; every gate is enforced by the runtime (never bypassed by an agent).

## 2. Index

| # | Workflow | MVP | Approval gates |
|---|----------|-----|----------------|
| W1 | Brand onboarding | ✅ | Brand voice confirm |
| W2 | Create campaign | ✅ | Plan approval |
| W3 | Competitor research | V1 | none |
| W4 | Campaign strategy | ✅ | Plan approval |
| W5 | Blog generation | ✅ | Artifact approval (export) |
| W6 | Social pack generation | ✅ | Artifact approval (export) |
| W7 | Image generation | ✅ | Artifact approval (use) |
| W8 | Video generation | V1 | Approval + cost gate |
| W9 | Multi-format resize | V1 | Approval |
| W10 | Approval | ✅ | (is the gate) |
| W11 | Publishing | V1 (export MVP) | Mandatory publish approval |
| W12 | Campaign monitoring | V1 | none |
| W13 | Performance analysis | V1 | none |
| W14 | Learning | V1 | Strategy-change review |

---

## 3. Workflows

### W1 — Brand onboarding (MVP)
- **Trigger:** Operator creates a brand.
- **Actors:** Operator, Research/Learning, Memory Manager.
- **Inputs:** Brand name, kit, voice samples, regions, competitors.
- **Steps:** 1) capture brand fields → 2) S1 Brand analysis → 3) Memory Manager writes Brand Memory → 4) operator reviews summary → 5) confirm → brand active.
- **Sub-agents:** Research/Learning, Memory Manager.
- **Tools:** web_search (optional).
- **States:** `capturing → analyzing → review → active`.
- **Gates:** Brand-voice confirmation by operator/Lead.
- **Outputs:** Active brand + Brand Memory record.
- **Errors:** Sparse inputs → partial memory with flagged gaps.
- **Acceptance:** Brand active; Brand Memory exists; voice editable.

### W2 — Create campaign (MVP)
- **Trigger:** Operator command (`/campaign`) or "New Campaign".
- **Actors:** Operator, Master Agent, Campaign Planner.
- **Inputs:** Brief (goal, audience, channels, region, dates, budget).
- **Steps:** 1) Master parses intent → fills/asks gaps → 2) invoke W4 (strategy) → 3) present plan → 4) **plan approval** → 5) hand task graph to orchestrator → triggers W5/W6/W7 as planned.
- **Sub-agents:** Master, Campaign Planner (+ downstream).
- **Tools:** none directly.
- **States:** `DRAFT → PLANNING → awaiting_plan_approval → GENERATING`.
- **Gates:** Plan approval (auto if low risk + policy).
- **Outputs:** Campaign with plan + task graph + scheduled artifacts.
- **Errors:** Missing brief fields → needs[]; infeasible budget → reduce + note.
- **Acceptance:** AC-2/AC-3 (02).

### W3 — Competitor research (V1)
- **Trigger:** Campaign planning or scheduled refresh.
- **Actors:** Research Agent.
- **Inputs:** Competitor list, region, channels.
- **Steps:** S2 competitor research → matrix artifact → write Competitor Memory.
- **Tools:** web_search, meta_ads_library.
- **States:** `running → done`.
- **Gates:** none.
- **Outputs:** Competitor matrix + memory.
- **Errors:** Blocked sources → coverage gaps noted.
- **Acceptance:** Cited matrix; memory updated.

### W4 — Campaign strategy (MVP)
- **Trigger:** From W2.
- **Actors:** Campaign Planner (+ optional Research).
- **Inputs:** Brief, brand/competitor memory, budget, region.
- **Steps:** S5 planning → objectives, pillars, channels, content_items, task graph, KPIs, schedule, budget.
- **Tools:** research (optional).
- **States:** `planning → plan_ready`.
- **Gates:** Plan approval (in W2).
- **Outputs:** Plan artifact.
- **Errors:** Missing fields → needs[].
- **Acceptance:** Campaign-completeness eval ≥0.85.

### W5 — Blog generation (MVP)
- **Trigger:** Plan task `copy.blog`.
- **Actors:** SEO Agent, Copywriter, Reviewer, Compliance.
- **Inputs:** Topic/brief, brand voice, region.
- **Steps:** 1) S8 SEO keywords/outline → 2) S9 blog draft → 3) Reviewer eval → (regenerate ≤2 if fail) → 4) Compliance check (region) → 5) version + needs_review.
- **Sub-agents:** SEO, Copywriter, Reviewer, Compliance.
- **Tools:** seo_keyword_tool (V1; heuristic MVP), text LLM.
- **States:** `seo → drafting → review → compliance → needs_review`.
- **Gates:** Artifact approval before export.
- **Outputs:** Blog artifact (versioned) + meta + compliance result.
- **Errors:** Eval fail ×N → escalate; compliance block → stop+escalate.
- **Acceptance:** SEO+clarity+voice evals pass; compliance attached.

### W6 — Social pack generation (MVP)
- **Trigger:** Plan task `copy.social`.
- **Actors:** Copywriter, Creative Director, Reviewer, Compliance.
- **Inputs:** Campaign, platforms[], voice, trends.
- **Steps:** for each platform (parallel): S10 social copy → optional creative hint → Reviewer → Compliance → version. Aggregate into a pack.
- **Tools:** text LLM (+ trends V1).
- **States:** `drafting(parallel) → review → compliance → needs_review`.
- **Gates:** Artifact approval before export.
- **Outputs:** N social artifacts (one per platform) + pack.
- **Errors:** Per-platform isolation (one fail ≠ pack fail).
- **Acceptance:** ≥3 platform posts; platform-policy pass.

### W7 — Image generation (MVP)
- **Trigger:** Plan task `image.generate` (or `/image`).
- **Actors:** Creative Director, Image Gen, Compliance.
- **Inputs:** Creative brief, aspect, style, brand kit.
- **Steps:** 1) S15 creative brief → 2) S13 prompt → **IP guard** → 3) `ideogram-proxy` generate → 4) re-host to Storage → 5) Compliance/brand-safety → 6) version + asset record.
- **Tools:** image_generation (T7), asset_storage (T22).
- **States:** `briefing → prompting → guard → generating → storing → compliance → needs_review`.
- **Gates:** Approval before use; IP guard (hard).
- **Outputs:** Image artifact + asset (alt, tags, dimensions).
- **Errors:** Guard trip → rewrite/escalate; provider error → fallback/placeholder; cost cap → stop.
- **Acceptance:** AC-4/AC-5; image-prompt + creative-relevance evals.

### W8 — Video generation (V1)
- As W7 with video provider + shotlist; **cost gate** before generation; async job.
- **States:** `briefing → prompting → queued → generating → storing → compliance → needs_review`.
- **Gates:** Approval + cost gate.

### W9 — Multi-format resize (V1)
- **Trigger:** Approved master creative + target formats.
- **Actors:** Creative Director, Image Gen / Canva.
- **Steps:** For each target dimension: regenerate/resize → store as variant version linked to master.
- **Gates:** Approval (inherits master approval unless content changes).
- **Outputs:** Variant set.

### W10 — Approval (MVP)
- **Trigger:** Artifact reaches `needs_review`; or plan ready.
- **Actors:** Reviewer (auto), Human approver, Compliance.
- **Inputs:** Artifact version + eval + compliance result.
- **Steps:** 1) ensure eval pass + compliance pass/warn → 2) route to human (or auto-approve rule if low-risk + policy) → 3) decision recorded → 4) on approve, unlock export/publish.
- **States:** `pending → approved | changes_requested | rejected`.
- **Gates:** This **is** the gate (P4).
- **Outputs:** Approval record; state change; feed event.
- **Errors:** High-risk type → force human; compliance block → cannot approve.
- **Acceptance:** AC-6/AC-7 (02); unapproved cannot export.

### W11 — Publishing (V1; export MVP)
- **Trigger:** Approved artifact + publish/export action.
- **Actors:** Publisher, Compliance (final), Notification.
- **Inputs:** Approved+compliant artifact, channel/format, slot.
- **Steps (MVP export):** transform → generate downloadable file → receipt → feed.
- **Steps (V1 publish):** verify approval token → channel transform → idempotent publish → receipt → feed; on failure escalate (no cross-channel fallback).
- **States:** `ready → exporting|publishing → done|failed`.
- **Gates:** Mandatory publish approval (V1).
- **Outputs:** Export file / publish receipt.
- **Errors:** Auth/policy fail → escalate; idempotency prevents double-post.
- **Acceptance:** Approved-only; publishing-accuracy eval.

### W12 — Campaign monitoring (V1)
- **Trigger:** Campaign LIVE; scheduled.
- **Actors:** Analytics Agent, Notification.
- **Steps:** Pull metrics (T20) → snapshot → detect anomalies → notify.
- **Outputs:** AnalyticsSnapshot; alerts.
- **Gates:** none.

### W13 — Performance analysis (V1)
- **Trigger:** Campaign end or scheduled.
- **Actors:** Analytics Agent.
- **Steps:** S20 analysis → insight artifact.
- **Outputs:** Insight artifact.
- **Gates:** none (advisory).

### W14 — Learning (V1)
- **Trigger:** After W13.
- **Actors:** Learning Agent, Memory Manager.
- **Steps:** S22 learning → Performance/Learning Memory; flag conflicts; strategy-changing insights → Lead review.
- **Gates:** Strategy-change review.
- **Outputs:** Learning Memory; biases future W4 plans.

## 4. Cross-workflow rules
- Every workflow step is **idempotent and resumable** (orchestrator can re-run from last good state).
- Every artifact transition creates a **version** and a **feed event**.
- **No** workflow may publish/export an unapproved or blocked artifact.
- Parallel steps are bounded by run concurrency + budget (04/13).

## 5. End-to-end example (MVP happy path)
`W2 → W4 (plan) → [approval] → W5 (blog) + W6 (social ×3) + W7 (image) in parallel → each: eval + compliance → W10 (approve) → W11 (export)`. Activity feed shows every step; `ai_call_log` shows spend; all outputs versioned.

## 6. Acceptance criteria
- W1, W2, W4, W5, W6, W7, W10, and W11(export) run end-to-end in MVP.
- Gates are enforced; blocked/unapproved artifacts cannot progress.
- Failures isolate (one artifact failing does not fail the campaign).
