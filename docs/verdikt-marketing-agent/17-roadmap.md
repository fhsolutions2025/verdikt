# 17 — Roadmap

**Audience:** Product, Leadership, Engineering · **Read after:** all

---

## 1. Staging overview

| Stage | Theme | Outcome |
|-------|-------|---------|
| **MVP** | Single operator, assisted | Plan→generate→review→approve→export, one brand, core compliance |
| **V1** | Live channels + learning | Real publishing, analytics, learning loop, more tools/providers |
| **V2** | Scale + paid + video | Paid ads, video, more channels, A/B, automation rules |
| **Enterprise** | Multi-tenant + governance | Orgs, roles, SSO, audit/compliance suite, SLAs |
| **Future** | Multi-department | Reuse runtime for HR/Finance/Sales/Legal/Support |

## 2. MVP (Phase B of this spec) — keep it small

**Goal:** prove the loop end-to-end for one operator, one brand, export-only.

**In scope:**
- Brand setup (voice + region) + Brand Memory.
- Campaign creation from a brief.
- Agent conversation (control surface, streaming).
- Campaign workspace (three-panel: nav / conversation / canvas + activity feed).
- Blog generation (SEO heuristic + copy).
- Social-post generation (≥3 platforms).
- Image generation (Ideogram, IP-guarded, re-hosted).
- Asset library (images; reuse `marketing_assets` storage).
- Approval flow (plan + artifact gates).
- Manual export (download approved blog/social).
- Basic activity feed.
- Core per-region compliance (2–3 seeded regions, fail-closed, mandatory disclaimers, hard claim/IP/PII checks).
- Provider-agnostic `LLMRouter` (Anthropic live; OpenAI interface stub).
- Per-run budget cap + `ai_call_log` cost.

**Explicitly NOT in MVP:** live publishing, paid-ad spend, analytics ingestion, learning loop, video, full calendar scheduling, multi-tenant orgs/roles, live OpenAI/other providers, A/B execution, influencer/affiliate live flows.

**MVP exit criteria:** AC-1…AC-9 (02 §11) pass; `tsc` + `build` clean; one full campaign run demoable.

## 3. V1 — Live channels & learning

| Capability | Notes |
|-----------|-------|
| Publishing (W11) | WordPress + Instagram/Facebook/X/LinkedIn; approval-gated, idempotent, no cross-channel fallback |
| Channel connections | `ChannelConnection` + OAuth token mgmt |
| Analytics (W12/W13) | GA4/native pulls → snapshots → insight artifacts |
| Learning loop (W14) | Performance/Learning Memory bias planning |
| More tools | Web search, Trends, Meta Ads Library, SEO keyword tool, email provider, CRM |
| Second live provider | Activate OpenAI adapter; routing fallback across providers |
| Email/CRM | Lifecycle email with consent compliance; segment reuse |
| Full content calendar | Drag-to-schedule + publish queue |
| Roles | operator/lead/compliance/admin within single org |
| Durable queue | Worker for parallel fan-out + scheduled workflows |

**V1 exit:** a campaign can be published live to ≥2 channels with approval + compliance, and results feed back into memory.

## 4. V2 — Scale, paid, video

| Capability | Notes |
|-----------|-------|
| Paid ads | Google/Meta planning → **gated spend**; ROAS/CPA tracking |
| Video generation (W8) | Provider integration; cost gates; YouTube/TikTok publish |
| A/B testing (S21) | Variant generation + test plans + result reads |
| Automation rules | Scoped auto-approval within policy; scheduled campaigns |
| Localization at scale | Region variant generation (S16) across many markets |
| More channels | Shopify, WhatsApp, Pinterest |
| Cost/perf | Caching tier, provider load-balancing, embeddings memory |

## 5. Enterprise — multi-tenant & governance

| Capability | Notes |
|-----------|-------|
| Multi-tenant orgs | `org_id` everywhere; RLS isolation (14 §14) |
| SSO + RBAC | Enterprise auth; granular roles/permissions |
| Compliance suite | Region rule libraries, approval workflows, full audit export, retention policies |
| SLAs & quotas | Per-org budgets, rate limits, uptime |
| Data residency | Regional storage/processing options |
| Eval governance | Org-level golden datasets, sign-off workflows |

## 6. Future — autonomous department expansion

The runtime (orchestrator, LLM router, tools, memory, evals, compliance core, artifact/version store, activity/audit) is **department-agnostic**. New departments reuse it by supplying their own personas/prompts/skills/tools/workflows/regions under their namespace:

| Department | First use cases | Reuses |
|-----------|-----------------|--------|
| **Support** | Drafted responses, macros, KB articles (approval-gated) | Same runtime; support tools (helpdesk) |
| **Sales** | Outreach sequences, proposals, battlecards | CRM tools; same gates |
| **HR** | JDs, policies, internal comms (high compliance) | Strong approval + compliance |
| **Finance** | Reports, summaries, reconciliations (read-heavy, advisory) | Analytics + strict guardrails |
| **Legal** | Clause drafting, review, redlines (always human-gated) | Compliance-first; L5 mandatory |

**Expansion pattern:** new `*_` table prefix, new `app/company/<dept>/` workspace, new `lib/<dept>/*` personas/skills, reuse `lib/llm`, `lib/*/orchestrator` core, tools, memory, evals, compliance, approvals, audit.

## 7. Sequencing (build order for MVP — Phase B)

1. **B1** migration `0029_marketing_dept.sql` (15 §4) + seed 2–3 compliance regions.
2. **B2** `lib/llm/router.ts`, `lib/marketing/orchestrator.ts`, `lib/marketing/compliance.ts`, sub-agent functions (06).
3. **B3** routes `/api/company/marketing/v2/*` (16, MVP subset).
4. **B4** workspace `app/company/marketing/` (three-panel) + components.
5. **B5** wire features; verify AC-1…AC-9; `tsc` + `build`.
6. Replace old Marketing tab with a launcher into the new workspace.

## 8. Risks & dependencies (programme-level)
- **Regulatory:** compliance engine must lead publishing (never publish before V1 compliance maturity). 
- **Cost:** caps + routing from day one.
- **Scope:** hold the MVP boundary; defer publish/analytics/video.
- **Provider:** keep router abstraction honest so V1 multi-provider is config, not rewrite.
- **Dependencies:** Verdikt Supabase stack; provider keys per stage (Anthropic+Ideogram now; OpenAI/channels/analytics for V1; paid/video for V2).

## 9. Success milestones

| Milestone | Signal |
|-----------|--------|
| MVP live | One operator runs a full campaign to export with approvals + compliance |
| V1 live | First autonomous campaign published to live channels, results in memory |
| V2 live | Paid + video + A/B operating under automation rules within policy |
| Enterprise | First external org onboarded with isolation + RBAC + audit |
| Multi-dept | Second department (e.g. Support) live on the same runtime |
