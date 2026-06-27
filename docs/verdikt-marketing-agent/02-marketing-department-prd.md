# 02 — Marketing Department PRD

**Audience:** Product, Design, Engineering, Compliance · **Read after:** 01-vision · **Read before:** 03-UX, 09-workflows

---

## 1. Overview

The Marketing Department is the first instance of the Verdikt autonomous-department runtime. It turns operator intent into authorised, versioned, multi-channel marketing output. It is composed of **16 functional sub-departments** (§6), driven by a **Master Marketing Agent** and **15 sub-agents** (see 04), operating over **campaigns** as the primary unit of work, gated by **approvals** (P4) and a **per-region compliance engine** (P6).

This PRD defines scope, personas, jobs-to-be-done, modules, lifecycles, functional/non-functional requirements, the **MVP boundary**, out-of-scope items, and acceptance criteria.

## 2. User personas (summary; full detail in 01 §4)

| Persona | Goal in product | Key actions |
|---------|-----------------|-------------|
| Marketing Operator | Ship campaigns fast | Brief → direct agent → review → approve → export |
| Marketing Lead | Strategy + brand + budget | Set brand voice, approve high-risk, view analytics |
| Compliance Officer | Legal sign-off | Configure regions, review gated artifacts, audit |
| Platform Admin | Operate system | Integrations, model routing, costs, evals, kill-switch |

## 3. Jobs to be done

| # | When… | I want to… | So that… |
|---|-------|-----------|----------|
| J1 | a new brand/product launches | onboard brand voice, assets, regions once | every output is on-brand and compliant |
| J2 | a market event/fixture occurs | spin up a campaign in minutes | I capture timely demand |
| J3 | I have a goal but no plan | get a complete strategy + content plan | I don't start from a blank page |
| J4 | I need a content pack | generate blog + social + creatives together | channels are consistent and ready |
| J5 | content is generated | review, compare versions, and edit | quality and brand fit are assured |
| J6 | content is risky/regulated | see compliance results and gate it | I don't breach ad law |
| J7 | content is approved | publish or export to channels | it reaches the audience |
| J8 | a campaign is live | monitor performance | I know what's working |
| J9 | results come in | learn what worked | future campaigns improve |
| J10 | I need oversight | see every action the agent took | I can trust and audit the system |

## 4. Core modules

| Module | Purpose | MVP? |
|--------|---------|------|
| Brand Onboarding | Capture brand kit, voice, assets, regions | ✅ |
| Campaign Management | Create/track campaigns through lifecycle | ✅ |
| Content Generation | Blog, social, email, landing copy | ✅ (blog + social) |
| Creative Generation | Images (MVP), video (V1+) | ✅ (images) |
| Agent Conversation | Control surface to direct the department | ✅ |
| Work Canvas | Render/compare/version artifacts | ✅ |
| Approval & Review | Gate publish/destructive actions | ✅ |
| Asset Library | Store/search reusable assets | ✅ |
| Content Calendar | Schedule artifacts across channels | Read-only stub MVP; full V1 |
| Publishing | Push to channels | V1+ (export in MVP) |
| Analytics | Ingest + reason over performance | V1+ |
| Learning Loop | Feed results back into memory/strategy | V1+ |
| Activity Feed | Stream all actions | ✅ (basic) |
| Compliance Engine | Per-region rules + gating | ✅ (core checks) |

## 5. Lifecycles

### 5.1 Campaign lifecycle (state machine)

```
DRAFT ─submit brief→ PLANNING ─plan approved→ GENERATING
GENERATING ─artifacts produced→ IN_REVIEW
IN_REVIEW ─changes requested→ GENERATING
IN_REVIEW ─approved→ READY
READY ─export/publish→ LIVE        (MVP: export only → COMPLETED)
LIVE ─campaign ends→ COMPLETED
ANY ─cancel→ ARCHIVED
ANY ─compliance hard-block→ BLOCKED ─resolved→ previous state
```

| State | Meaning | Allowed transitions |
|-------|---------|---------------------|
| DRAFT | Brief being authored | PLANNING, ARCHIVED |
| PLANNING | Agent producing strategy/plan | GENERATING, BLOCKED, ARCHIVED |
| GENERATING | Sub-agents producing artifacts | IN_REVIEW, BLOCKED, ARCHIVED |
| IN_REVIEW | Human/eval review | GENERATING, READY, BLOCKED, ARCHIVED |
| READY | Approved, awaiting publish/export | LIVE, COMPLETED, ARCHIVED |
| LIVE | Published to channels (V1+) | COMPLETED, ARCHIVED |
| COMPLETED | Finished; results captured | ARCHIVED |
| BLOCKED | Compliance hard-block | (prior state) |
| ARCHIVED | Terminal | — |

### 5.2 Brand onboarding (steps)
1. Create brand → 2. Capture voice (tone, do/don't, lexicon) → 3. Upload/colour/logo brand kit → 4. Select operating regions (binds compliance rulesets) → 5. Seed competitor list → 6. Agent generates a **Brand Memory** summary → 7. Operator confirms → brand is **active**.

### 5.3 Content generation (per artifact)
`requested → drafting (sub-agent) → eval (auto) → compliance check (region) → needs_review → (approved | changes_requested) → ready → exported/published`. Every transition creates an `ArtifactVersion` and an activity event.

### 5.4 Learning loop (V1+)
`publish → collect metrics → Analytics Agent analysis → Learning Agent extracts insights → write Performance/Learning Memory → bias next Campaign Planner runs`.

## 6. Marketing sub-departments matrix

For each: **Responsibilities · Inputs · Outputs · KPIs · Human involvement · Agent involvement · Approval gates.** "Lead agent" names the primary sub-agent (see 04/05).

### 6.1 Brand Management
- **Responsibilities:** Own brand voice, visual identity, consistency across all output.
- **Inputs:** Brand kit, voice guide, prior approved assets, competitor positioning.
- **Outputs:** Brand Memory record, voice rules, do/don't lexicon, style tokens.
- **KPIs:** Brand-voice eval score; consistency across artifacts; on-brand approval rate.
- **Human:** Lead defines/approves voice; reviews drift.
- **Agent:** Research + Learning agents summarise/maintain Brand Memory; all agents consume it.
- **Gates:** Brand voice changes require Lead approval.

### 6.2 Campaign Management
- **Responsibilities:** Plan, schedule, track campaigns; coordinate sub-departments.
- **Inputs:** Brief (goal, audience, channels, budget, region, dates).
- **Outputs:** Campaign plan, task graph, schedule, status.
- **KPIs:** Cycle time; on-time delivery; goal attainment.
- **Human:** Operator submits brief; approves plan.
- **Agent:** Campaign Planner + Workflow Orchestrator. Lead agent: **Campaign Planner**.
- **Gates:** Plan approval before generation (configurable auto-approve below risk threshold).

### 6.3 Content Marketing
- **Responsibilities:** Long-form/blog, thought leadership, content pillars.
- **Inputs:** Topic/keyword, brief, brand voice, SEO targets, region rules.
- **Outputs:** Blog artifacts (versioned), meta, internal links.
- **KPIs:** SEO eval score; organic traffic (V1+); dwell time.
- **Human:** Review/approve.
- **Agent:** Lead: **Copywriter**; SEO Agent for optimisation; Compliance Agent.
- **Gates:** Approval before publish/export.

### 6.4 SEO
- **Responsibilities:** Keyword strategy, on-page optimisation, content gaps.
- **Inputs:** Seed keywords, competitor content, search/keyword tool data.
- **Outputs:** Keyword maps, briefs, on-page recommendations, meta.
- **KPIs:** SEO quality eval; ranking lift (V1+); coverage of target keywords.
- **Human:** Approve strategy.
- **Agent:** Lead: **SEO Agent**.
- **Gates:** None for recommendations; approval if it triggers publishing.

### 6.5 Social Media
- **Responsibilities:** Platform-native posts, threads, stories, captions, hashtags.
- **Inputs:** Campaign, channel, brand voice, trends.
- **Outputs:** Social post artifacts per platform (versioned), caption + media refs.
- **KPIs:** Engagement (V1+); platform-policy pass rate; on-brand rate.
- **Human:** Approve before publish.
- **Agent:** Lead: **Copywriter** (social mode) + Creative Director for media.
- **Gates:** Approval before publish; platform-policy compliance check.

### 6.6 Creative Design
- **Responsibilities:** Static creatives, banners, social images, multi-format resizes.
- **Inputs:** Creative brief, brand kit, slot dimensions, copy.
- **Outputs:** Image artifacts (re-hosted in Storage), variant sets.
- **KPIs:** Creative relevance eval; image-prompt quality; reuse rate.
- **Human:** Approve creatives.
- **Agent:** Lead: **Creative Director** → **Image Generation Agent** (`ideogram-proxy`).
- **Gates:** Approval before use/publish; IP/brand-safety check (reuse `lib/promptGuard.ts`).

### 6.7 Video Production (V1+)
- **Responsibilities:** Short-form video, reels, ad cuts.
- **Inputs:** Script/prompt, brand kit, duration/aspect.
- **Outputs:** Video artifacts + thumbnails.
- **KPIs:** Video-prompt quality eval; completion rate (V1+).
- **Human:** Approve.
- **Agent:** Lead: **Video Generation Agent** (provider TBD, multi-provider).
- **Gates:** Approval; cost gate (video is expensive).

### 6.8 Paid Ads (planning MVP; spend V1+)
- **Responsibilities:** Ad concepts, copy variants, targeting plans, budget plans.
- **Inputs:** Goal, budget, audience, channel ad policies.
- **Outputs:** Ad artifacts, targeting/budget plan (not live spend in MVP).
- **KPIs:** Plan completeness; (V1+) ROAS, CPA.
- **Human:** Approve all spend.
- **Agent:** Copywriter + Creative Director + Compliance.
- **Gates:** **Mandatory** human approval for any spend; platform ad-policy compliance.

### 6.9 CRM & Email
- **Responsibilities:** Email/lifecycle copy, segmentation use, sequences.
- **Inputs:** Segment (reuse `app/api/company/marketing/segments`), goal, voice.
- **Outputs:** Email artifacts (subject, preview, body), sequence plan.
- **KPIs:** Open/CTR (V1+); compliance pass; personalisation quality.
- **Human:** Approve before send.
- **Agent:** Lead: **Copywriter** (email mode).
- **Gates:** Approval before send; anti-spam/consent compliance.

### 6.10 Community
- **Responsibilities:** Community posts, responses, AMAs, responsible-gaming messaging.
- **Inputs:** Community context, brand voice, region rules.
- **Outputs:** Community artifacts, response drafts.
- **KPIs:** Sentiment (V1+); response quality; compliance.
- **Human:** Approve sensitive responses.
- **Agent:** Copywriter + Compliance.
- **Gates:** Approval for public responses; responsible-gaming rules enforced.

### 6.11 PR
- **Responsibilities:** Press releases, media pitches, statements.
- **Inputs:** Announcement brief, facts, region rules.
- **Outputs:** PR artifacts.
- **KPIs:** Factual-accuracy eval; pickup (V1+).
- **Human:** Mandatory approval (high reputational risk).
- **Agent:** Copywriter + Research + Compliance.
- **Gates:** Mandatory human approval; factual-accuracy eval must pass.

### 6.12 Influencer Marketing
- **Responsibilities:** Influencer briefs, outreach copy, disclosure rules.
- **Inputs:** Influencer profile, campaign, region disclosure law.
- **Outputs:** Brief/outreach artifacts; disclosure checklist.
- **KPIs:** Brief completeness; disclosure compliance.
- **Human:** Approve outreach.
- **Agent:** Copywriter + Compliance.
- **Gates:** Approval; mandatory disclosure-rule check.

### 6.13 Affiliate Marketing
- **Responsibilities:** Affiliate assets, terms copy, tracking-link guidance.
- **Inputs:** Affiliate program, campaign, region rules.
- **Outputs:** Affiliate asset packs.
- **KPIs:** Asset completeness; compliance.
- **Human:** Approve terms-related copy.
- **Agent:** Copywriter + Compliance.
- **Gates:** Approval for terms/claims.

### 6.14 Market Research
- **Responsibilities:** Audience, competitor, trend, and market analysis.
- **Inputs:** Web search, trends, competitor data, internal performance.
- **Outputs:** Research artifacts (audience insights, competitor matrix, trends).
- **KPIs:** Research usefulness (eval); freshness.
- **Human:** Review.
- **Agent:** Lead: **Research Agent**.
- **Gates:** None (read-only output).

### 6.15 Analytics (V1+)
- **Responsibilities:** Performance measurement and reasoning.
- **Inputs:** Channel metrics, campaign data.
- **Outputs:** Analytics snapshots, insight artifacts.
- **KPIs:** Analytics-reasoning eval; decision impact.
- **Human:** Review insights.
- **Agent:** Lead: **Analytics Agent**.
- **Gates:** None (advisory).

### 6.16 Marketing Operations
- **Responsibilities:** Workflow config, automation rules, integrations, cost/eval governance.
- **Inputs:** Operator config, integration credentials, budgets.
- **Outputs:** Workflow definitions, automation rules, integration connections.
- **KPIs:** System uptime; cost per artifact; eval pass rate; automation safety.
- **Human:** Admin configures; approves automation rules.
- **Agent:** Workflow Orchestrator + Notification Agent.
- **Gates:** Admin approval to enable any automation rule that waives a manual gate.

## 7. Functional requirements (selected; "shall")

| ID | Requirement |
|----|-------------|
| FR-1 | The system **shall** let an operator create a brand with voice, kit, and ≥1 region. |
| FR-2 | The system **shall** create a campaign from a structured brief and track it through the §5.1 state machine. |
| FR-3 | The operator **shall** direct the department via a conversation control surface that issues commands and reports status. |
| FR-4 | The Master Agent **shall** decompose a campaign into sub-agent tasks and execute them, emitting activity events for each. |
| FR-5 | Every generated output **shall** be persisted as an `Artifact` with at least one `ArtifactVersion` carrying provenance (agent, run, model, prompt, evals). |
| FR-6 | Each artifact **shall** be evaluated (auto) and **shall** receive a region-scoped compliance result before it can be approved. |
| FR-7 | No artifact **shall** be published or exported until it is `approved`, unless a within-policy automation rule applies. |
| FR-8 | The system **shall** record every agent action, tool call, and human decision in the activity feed and `AuditLog`. |
| FR-9 | The system **shall** support image generation (MVP) and store assets in the Asset Library. |
| FR-10 | The system **shall** support manual export (download) of approved blog/social artifacts (MVP). |
| FR-11 | Model selection **shall** be resolved via a provider-agnostic router by task (11). |
| FR-12 | Compliance framing and hard blocks **shall** be configurable per region. |
| FR-13 | The system **shall** enforce a per-run cost budget and log spend to `ai_call_log`. |
| FR-14 | All routes/actions **shall** be admin-gated (MVP) via `getAuthContext`. |

## 8. Non-functional requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | First artifact latency | < 90s p50 |
| NFR-2 | Workspace interactivity | < 200ms UI action feedback; streaming agent status |
| NFR-3 | Availability | Best-effort MVP; graceful degradation on provider outage (fallbacks) |
| NFR-4 | Auditability | 100% of actions logged; immutable versions |
| NFR-5 | Security | Admin-gated, RLS-enforced, secrets in Supabase secrets, no PII in prompts (strip) |
| NFR-6 | Cost control | Per-run budget cap; model routing; caching; visible spend |
| NFR-7 | Observability | Run/task tracing; eval scores; per-tool logs |
| NFR-8 | Modularity | Reusable runtime; department logic isolated |
| NFR-9 | Accessibility | WCAG 2.1 AA (see 03) |
| NFR-10 | Internationalisation | Multi-region content; localisation skill (07) |

## 9. MVP scope (the boundary)

**In:** brand setup; campaign creation; agent conversation; campaign workspace (3-panel); blog generation; social-post generation; image generation; asset library; approval flow; manual export; basic activity feed; core per-region compliance checks; provider-agnostic router (Anthropic path live).

**Acceptance is defined in §11.**

## 10. Out of scope (MVP)

Live publishing to channels; paid-ad spend/bidding; analytics ingestion + learning loop; video generation; full content calendar scheduling/automation; multi-tenant org/role model; OpenAI/other live providers (interface only); A/B test execution; influencer/affiliate live workflows (templates only).

## 11. Acceptance criteria (MVP)

| # | Given | When | Then |
|---|-------|------|------|
| AC-1 | An admin in the workspace | they create a brand (voice + region) | brand is active and stored; Brand Memory summary exists |
| AC-2 | An active brand | operator submits a campaign brief via chat | a campaign enters PLANNING and a plan artifact is produced |
| AC-3 | A planned campaign | operator approves the plan | campaign → GENERATING; sub-agent tasks appear in the activity feed |
| AC-4 | Generation runs | it completes | ≥1 blog + ≥3 social posts + ≥1 image exist as versioned artifacts |
| AC-5 | An artifact in a region | it is generated | a region-scoped compliance result is attached |
| AC-6 | An unapproved artifact | export is attempted | export is **blocked** until approval |
| AC-7 | An approved artifact | operator exports | a downloadable file is produced; export logged in feed |
| AC-8 | Any run | inspected | every action is in the activity feed and `ai_call_log` shows spend |
| AC-9 | Build | `tsc --noEmit` + `npm run build` | both pass; all new routes admin-gated |

## 12. Edge cases

- Empty brief / missing region → block with guided prompt (no silent default region).
- Provider outage mid-run → router fallback; if none, task fails gracefully, run marked partial, feed shows error.
- Compliance hard-block on one artifact → other artifacts proceed; campaign not blocked unless plan-level.
- Duplicate artifact (same brief twice) → versioning, not overwrite; dedupe eval flags near-duplicates.
- Cost cap hit mid-run → stop further fan-out, mark run capped, surface in feed.
- Operator edits an artifact → new version with `source = human`.

## 13. Risks & dependencies

| Risk | Mitigation |
|------|------------|
| Regulatory breach | Compliance engine + mandatory gates + audit (13) |
| Cost overrun | Budget caps + routing + caching (11) |
| Hallucinated claims | Evals + Compliance Agent + approval (12/13) |
| Scope creep | Hard MVP boundary (§9/§10) |

**Dependencies:** 03 (UX), 04 (agents), 09 (workflows), 11 (routing), 13 (compliance), 14–16 (build substrate); Verdikt stack + provider keys.
