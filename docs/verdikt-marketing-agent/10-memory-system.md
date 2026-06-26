# 10 — Memory System

**Audience:** AI Engineering, Backend · **Read after:** 04-architecture · **Read before:** 11-llm-config, 15-data-model

---

## 1. Overview

Memory is the department's durable, retrievable knowledge. It makes the system consistent and improving (P5). All memory is managed by the **Memory Manager Agent** (05) through typed **namespaces**, each with its own schema, source of truth, and update/retrieval/retention/conflict rules.

**Storage model:** structured records in Postgres (`MemoryRecord` with `namespace`, `key`, `value jsonb`, `confidence`, `source`, timestamps) + optional embeddings for semantic retrieval (V1+). MVP: structured + keyword retrieval.

**Memory contract (per namespace):** `What is stored · Source of truth · Update rules · Retrieval rules · Retention · Privacy · Conflict resolution · Example record.`

## 2. Namespaces index

| Namespace | Scope | MVP | Source of truth |
|-----------|-------|-----|-----------------|
| Brand Memory | per brand | ✅ | Operator + approved assets |
| User Memory | per user | V1 | User behaviour/preferences |
| Campaign Memory | per campaign | ✅ | Campaign records |
| Asset Memory | per asset | ✅ | Asset library |
| Competitor Memory | per brand | V1 | Research artifacts |
| Conversation Memory | per session | ✅ | Chat thread |
| Publishing Memory | per channel | V1 | Publish receipts |
| Performance Memory | per campaign/channel | V1 | Analytics |
| Learning Memory | per brand/global | V1 | Learning Agent |
| Approval Memory | per artifact | ✅ | Approval records |

---

## 3. Namespace specifications

### 3.1 Brand Memory (MVP)
- **Stores:** Voice (tone, lexicon, do/don't), positioning, value props, palette/visual tokens, regions, prohibited claims.
- **Source of truth:** Operator-confirmed brand setup + approved artifacts.
- **Update:** Updated on brand edit, or when Learning proposes a voice refinement (Lead-approved). New facts supersede older if higher confidence + newer.
- **Retrieval:** Injected into every content/creative agent prompt (`{{brand_voice}}`, `{{brand_kit}}`).
- **Retention:** Lifetime of brand; versioned on change.
- **Privacy:** Brand-internal; no end-user PII.
- **Conflict:** Operator-confirmed > inferred; newer + higher-confidence wins; irreconcilable → escalate to Lead.
- **Example:**
```json
{"namespace":"brand","key":"voice","value":{"tone":"energetic, trustworthy, inclusive","do":["responsible-gaming framing"],"dont":["guarantees","risk-free"],"lexicon":["predict","trade","markets"]},"confidence":0.95,"source":"operator"}
```

### 3.2 User Memory (V1)
- **Stores:** Operator preferences (preferred channels, tone tweaks, approval style, working hours).
- **Source:** Behaviour + explicit settings.
- **Update:** On repeated behaviour or explicit setting; decay stale prefs.
- **Retrieval:** Personalise suggestions and defaults.
- **Retention:** Until changed; user-clearable.
- **Privacy:** Per-user; access-controlled; exportable/deletable (GDPR).
- **Conflict:** Explicit setting > inferred.
- **Example:** `{"namespace":"user","key":"defaults","value":{"channels":["instagram","x"],"auto_approve_low_risk":false}}`.

### 3.3 Campaign Memory (MVP)
- **Stores:** Brief, plan, decisions, task outcomes, status history.
- **Source:** Campaign + run records.
- **Update:** Append on each state change/decision.
- **Retrieval:** Context for follow-on artifacts in the same campaign; reporting.
- **Retention:** Lifetime + archive.
- **Privacy:** Brand-internal.
- **Conflict:** Latest state authoritative; history immutable.
- **Example:** `{"namespace":"campaign","key":"<id>:plan","value":{...},"source":"planner"}`.

### 3.4 Asset Memory (MVP)
- **Stores:** Asset metadata (prompt, alt, tags, dimensions, usage, performance link).
- **Source:** Asset library (reuse `marketing_assets`/`page_assets` patterns).
- **Update:** On generation/reuse; usage counter.
- **Retrieval:** Reuse search ("find an approved hero image for sports").
- **Retention:** Until deleted; soft-delete keeps history.
- **Privacy:** Brand-internal; IP provenance retained.
- **Conflict:** n/a (append/usage).
- **Example:** `{"namespace":"asset","key":"<asset_id>","value":{"alt":"...","tags":["sports"],"uses":3}}`.

### 3.5 Competitor Memory (V1)
- **Stores:** Competitor positioning, offers, creative styles, claims, last-seen.
- **Source:** Research artifacts (W3).
- **Update:** On research refresh; mark freshness.
- **Retrieval:** Planning + differentiation.
- **Retention:** Rolling; stale entries decayed/flagged.
- **Privacy:** Public data only; cite sources.
- **Conflict:** Newer research supersedes; keep change log.
- **Example:** `{"namespace":"competitor","key":"<name>","value":{"positioning":"...","offers":["..."],"seen":"2026-06"}}`.

### 3.6 Conversation Memory (MVP)
- **Stores:** Rolling summary of the operator↔agent session + key decisions.
- **Source:** Chat thread (reuse `chat_messages` pattern).
- **Update:** Summarised window (keep recent verbatim, summarise older).
- **Retrieval:** Maintain continuity within a session/campaign.
- **Retention:** Session; promoted facts move to Brand/Campaign memory.
- **Privacy:** Strip PII (reuse chat PII patterns) before storage.
- **Conflict:** Latest instruction wins; durable facts promoted explicitly.
- **Example:** `{"namespace":"conversation","key":"<session>","value":{"summary":"Operator wants RG Week, NG, no bonuses."}}`.

### 3.7 Publishing Memory (V1)
- **Stores:** What was published where/when, receipts, idempotency keys.
- **Source:** Publish receipts.
- **Update:** On publish/export.
- **Retrieval:** Prevent duplicates; reporting; rollback reference.
- **Retention:** Long (audit).
- **Privacy:** Brand-internal.
- **Conflict:** Receipt is authoritative; dedupe by idempotency key.

### 3.8 Performance Memory (V1)
- **Stores:** Per artifact/campaign/channel metrics over time.
- **Source:** Analytics snapshots.
- **Update:** On each pull.
- **Retrieval:** Learning + planning bias.
- **Retention:** Long; aggregated.
- **Privacy:** Aggregate; no individual PII.

### 3.9 Learning Memory (V1)
- **Stores:** Generalised insights ("short captions outperform on X for sports, NG"), with evidence + confidence + scope.
- **Source:** Learning Agent (W14).
- **Update:** Add insights; supersede on stronger evidence; flag conflicts.
- **Retrieval:** Bias Campaign Planner + Copywriter defaults.
- **Retention:** Long; low-confidence decays.
- **Conflict:** Higher evidence/confidence wins; unresolved → escalate.
- **Example:** `{"namespace":"learning","key":"social.length.x.sports.ng","value":{"insight":"<=120 chars +18% eng","confidence":0.7,"evidence":"3 campaigns"}}`.

### 3.10 Approval Memory (MVP)
- **Stores:** Approval decisions, approvers, comments, rationale, overrides.
- **Source:** Approval records (`mkt_approvals`).
- **Update:** On each decision.
- **Retrieval:** Audit; auto-approve-rule calibration; "who approved what".
- **Retention:** Long (audit/compliance).
- **Privacy:** Internal; immutable.
- **Conflict:** n/a (append-only ledger).

## 4. Retrieval strategy
- **MVP:** namespace + key lookups + simple keyword/tag filter; inject Brand + Campaign + Conversation memory into prompts.
- **V1+:** embeddings + semantic search for Asset/Competitor/Learning ("find similar past insight"); relevance-ranked context assembly with token budget.
- **Context assembly rule:** always include Brand voice + region rules + active campaign summary; add task-specific memory up to a token budget (11).

## 5. Write governance
- Only the Memory Manager writes memory (other agents *propose*).
- Every write logged; strategy-altering writes (Brand/Learning) gated by Lead review.
- PII stripped before any memory write (reuse chat PII patterns).

## 6. Privacy & retention summary
| Concern | Rule |
|---------|------|
| End-user PII | Never stored in prompts/memory; stripped at ingress |
| User data | Per-user, exportable + deletable (GDPR/region) |
| Retention | Brand/Campaign/Approval long; Conversation session-scoped; low-confidence learning decays |
| Access | Admin-gated MVP; role-scoped V1+ |

## 7. Acceptance criteria
- Brand/Campaign/Conversation/Asset/Approval memory operate in MVP.
- Memory writes are logged and PII-free; strategy writes are gated.
- Conflict resolution prefers confirmed/newer/higher-confidence; unresolved conflicts escalate.
- Retrieval injects brand voice + region rules into every content/creative prompt.
