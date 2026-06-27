# 08 — Tools Registry

**Audience:** Backend, AI Engineering · **Read after:** 07-skills · **Read before:** 09-workflows, 14-tech-arch

---

## 1. Tool model

A **tool** is a typed, permissioned external capability executed through the **ToolExecutor** (14). The ToolExecutor enforces, for every call: input validation, permission check (agent persona allow-list), rate-limit check (`api_rate_limits`), timeout, retry policy, fallback, cost accounting (`ai_call_log`/cost ledger), and logging (`ToolCall` + activity feed).

**Tool contract:** `Purpose · Inputs · Outputs · Permissions · Auth · Rate limits · Cost · Retry policy · Timeout · Fallback · Failure messages · Logging.`

**Multi-provider:** capability classes (text, image, video, search) are abstract; concrete providers are configured and swappable (11). MVP wires the ones marked **MVP**.

## 2. Registry index

| ID | Tool | Class | MVP | Provider(s) |
|----|------|-------|-----|-------------|
| T1 | Web Search | search | V1 | Bing/Brave/SerpAPI |
| T2 | Google Trends | trends | V1 | Trends API/proxy |
| T3 | Meta Ads Library | ads-intel | V1 | Meta Ad Library API |
| T4 | Google Ads | paid | V2 | Google Ads API |
| T5 | SEO Keyword Tool | seo | V1 | DataForSEO/Semrush |
| T6 | Text LLM | text-gen | ✅ | Anthropic (live), OpenAI (iface) |
| T7 | Image Generation | image-gen | ✅ | Ideogram (`ideogram-proxy`) |
| T8 | Video Generation | video-gen | V1 | Runway/Kling/Veo (TBD) |
| T9 | Canva | design | V2 | Canva Connect API |
| T10 | WordPress | cms-publish | V1 | WP REST API |
| T11 | Shopify | commerce-publish | V2 | Shopify Admin API |
| T12 | Instagram | social-publish | V1 | Meta Graph API |
| T13 | Facebook | social-publish | V1 | Meta Graph API |
| T14 | X (Twitter) | social-publish | V1 | X API v2 |
| T15 | LinkedIn | social-publish | V1 | LinkedIn API |
| T16 | YouTube | video-publish | V2 | YouTube Data API |
| T17 | TikTok | social-publish | V2 | TikTok API |
| T18 | Email Provider | email-send | V1 | Resend/SendGrid |
| T19 | WhatsApp Provider | messaging | V2 | WhatsApp Cloud API |
| T20 | Analytics Provider | analytics | V1 | GA4/Plausible |
| T21 | CRM | crm | V1 | HubSpot/internal |
| T22 | Asset Storage | storage | ✅ | Supabase Storage |

---

## 3. Cross-cutting policies

| Concern | Default |
|---------|---------|
| Auth | Secrets in Supabase secrets; never in prompts/client; service-role server-side only |
| Permissions | Agent persona allow-list (05) enforced by ToolExecutor; admin-gated routes |
| Rate limits | Tracked in `api_rate_limits` per tool/minute; ToolExecutor throttles |
| Retry | Transient (timeout/5xx/429): exp backoff 1s/2s/4s, max 3 |
| Timeout | Per tool (below); hard cap 60s for sync, async job for long ops |
| Cost | Logged per call; per-run budget enforced; image/video metered |
| Logging | `ToolCall` row + `tool.called` feed event; redact secrets/PII |
| Fallback | Per tool (below); publishing tools never silently fall back to another channel |

---

## 4. Tool specifications

### T6 — Text LLM (MVP)
- **Purpose:** All text generation/reasoning across agents.
- **Inputs:** `{task, system, messages, schema?, max_tokens, temperature}` (provider/model resolved by router 11).
- **Outputs:** `{text|json, usage{input,output}, model, provider}`.
- **Permissions:** All agents (per task).
- **Auth:** Anthropic key in Supabase secrets via `anthropic-proxy`; OpenAI key (V1).
- **Rate limits:** Provider limits; tracked per provider.
- **Cost:** Per-token by model class (11); logged to `ai_call_log`.
- **Retry:** 3× backoff; then **fallback provider/model** (11).
- **Timeout:** 30s (sync), 55s (long gen).
- **Fallback:** Router fallback chain; if all fail → task fails with diagnostic.
- **Failure msg:** "Text provider unavailable — tried {providers}."
- **Logging:** `ai_call_log` (provider, model, tokens, latency, success).

### T7 — Image Generation (MVP)
- **Purpose:** Generate marketing images.
- **Inputs:** `{prompt, style, aspect_ratio}` (post IP-guard).
- **Outputs:** `{url, seed}` → re-hosted to Storage (T22), returns public URL.
- **Permissions:** Image Gen agent only.
- **Auth:** `ideogram_api_key` (Supabase secrets) via `ideogram-proxy`.
- **Rate limits:** Provider; per-run image cap.
- **Cost:** $0.08/image (Ideogram V_2); per-day cap (reuse Page Design cap pattern).
- **Retry:** 2× on 5xx/timeout.
- **Timeout:** 60s.
- **Fallback:** Alternate image provider (V1); else placeholder + reason.
- **Failure msg:** "Image generation failed — {provider error}."
- **Logging:** Cost ledger + feed event.

### T22 — Asset Storage (MVP)
- **Purpose:** Persist generated assets durably (Ideogram URLs are temporary).
- **Inputs:** `{bytes, contentType, path}`.
- **Outputs:** `{storage_path, public_url}`.
- **Permissions:** Image/Video/Publisher agents.
- **Auth:** Supabase service-role.
- **Rate limits:** n/a (storage).
- **Cost:** Storage cost (negligible).
- **Retry:** 2× on upload error.
- **Timeout:** 30s fetch + upload.
- **Fallback:** Retain source URL + flag re-host failure.
- **Failure msg:** "Failed to store asset — {error}."
- **Logging:** Asset record (reuse `marketing_assets` pattern).

### T1 — Web Search (V1)
- **Purpose:** Research/grounding.
- **Inputs:** `{query, region, recency, num}`. **Outputs:** `[{title,url,snippet,date}]`.
- **Permissions:** Research/SEO. **Auth:** provider key. **Rate:** provider QPS.
- **Cost:** per query. **Retry:** 3× backoff. **Timeout:** 15s. **Fallback:** alternate search provider → degrade to no-grounding + flag.
- **Failure msg:** "Search unavailable — proceeding without fresh sources (flagged)."

### T2 — Google Trends (V1)
- **Purpose:** Trend/seasonality signals. **Inputs:** `{terms[], region, timeframe}`. **Outputs:** `[{term, interest_over_time, rising[]}]`.
- **Permissions:** Research. **Auth:** API/proxy. **Rate:** provider. **Cost:** low. **Retry:** 3×. **Timeout:** 15s. **Fallback:** search-derived heuristic + flag.

### T3 — Meta Ads Library (V1)
- **Purpose:** Competitor ad intel. **Inputs:** `{advertiser/keyword, region}`. **Outputs:** `[{ad_creative, copy, dates}]`.
- **Permissions:** Research. **Auth:** Meta token. **Rate:** Meta limits. **Cost:** free/low. **Retry:** 3×. **Timeout:** 20s. **Fallback:** skip + note coverage gap.

### T5 — SEO Keyword Tool (V1)
- **Purpose:** Keyword volume/difficulty/related. **Inputs:** `{seed[], region}`. **Outputs:** `[{kw, volume, difficulty, intent}]`.
- **Permissions:** SEO. **Auth:** provider key. **Rate:** provider. **Cost:** per-row/credits. **Retry:** 3×. **Timeout:** 20s. **Fallback:** LLM heuristic keyword set + flag low-confidence.

### T4 — Google Ads (V2)
- **Purpose:** Paid search planning/spend (spend V2). **Inputs:** campaign/ad-group/keywords/budget. **Outputs:** plan/estimates.
- **Permissions:** Publisher + **L5 approval for spend**. **Auth:** OAuth. **Rate:** API. **Cost:** ad spend (gated). **Retry:** 3× read; **never auto-retry spend**. **Timeout:** 30s. **Fallback:** none for spend (escalate).

### T8 — Video Generation (V1)
- **Purpose:** Video creatives. **Inputs:** `{prompt, duration, aspect}`. **Outputs:** `{url, thumbnail}`.
- **Permissions:** Video Gen. **Auth:** provider key. **Rate:** provider. **Cost:** high (per second) → **cost gate**. **Retry:** 1× (expensive). **Timeout:** async job (minutes). **Fallback:** alternate provider → fail with cost note.

### T9 — Canva (V2)
- **Purpose:** Templated design/resize. **Inputs:** template+content. **Outputs:** design URLs.
- **Permissions:** Creative. **Auth:** Canva Connect OAuth. **Rate:** API. **Cost:** plan. **Retry:** 3×. **Timeout:** 30s. **Fallback:** native image gen resize.

### T10 — WordPress (V1, publish)
- **Purpose:** Publish blogs. **Inputs:** `{title, html, meta, status}` (approved only). **Outputs:** `{post_id, url}`.
- **Permissions:** Publisher + **approval**. **Auth:** WP app password/OAuth. **Rate:** site. **Cost:** none. **Retry:** 2× idempotent (slug key). **Timeout:** 30s. **Fallback:** export .html + escalate. **Failure msg:** "WordPress publish failed — exported instead."

### T11 — Shopify (V2, publish)
- Blog/product content. Permissions: Publisher + approval. Auth: Admin API token. Idempotent. Fallback: export + escalate.

### T12–T15 — Instagram / Facebook / X / LinkedIn (V1, social-publish)
- **Purpose:** Publish social artifacts. **Inputs:** `{caption, media_url, schedule}` (approved + compliant only). **Outputs:** `{post_id, url}`.
- **Permissions:** Publisher + **approval**. **Auth:** platform OAuth tokens (`ChannelConnection`). **Rate:** platform limits. **Cost:** none. **Retry:** 2× idempotent. **Timeout:** 30s. **Fallback:** **none across channels** — fail + escalate (never repost to a different channel). **Failure msg:** "{platform} publish failed — {error}; artifact remains approved, not posted."

### T16/T17 — YouTube / TikTok (V2, video-publish)
- As social-publish, video-specific; large uploads async.

### T18 — Email Provider (V1, send)
- **Purpose:** Send campaign/lifecycle email. **Inputs:** `{from, segment, subject, html, consent_proof}` (approved only). **Outputs:** `{message_id, accepted}`.
- **Permissions:** Publisher + **approval**. **Auth:** provider key. **Rate:** provider. **Cost:** per email. **Retry:** 2× idempotent (idempotency key). **Timeout:** 30s. **Fallback:** queue + escalate. **Compliance:** consent + unsubscribe mandatory.

### T19 — WhatsApp (V2, messaging)
- Template-gated, opt-in only, region rules; approval mandatory.

### T20 — Analytics Provider (V1, read)
- **Purpose:** Pull performance. **Inputs:** `{property, metrics, dateRange}`. **Outputs:** metric series.
- **Permissions:** Analytics (read). **Auth:** OAuth/key. **Rate:** provider. **Cost:** low. **Retry:** 3×. **Timeout:** 20s. **Fallback:** partial data + flag.

### T21 — CRM (V1)
- **Purpose:** Segments/contacts (reuse existing `segments` route in MVP-adjacent). **Inputs:** segment query. **Outputs:** segment sizes/definitions (no raw PII to prompts). **Permissions:** Copywriter (sizes only). **Auth:** CRM key. **Retry:** 3×. **Fallback:** cached segment sizes.

## 5. Permission matrix (agent → tools)

| Agent | Allowed tools |
|-------|---------------|
| Research | T1,T2,T3,T6 |
| SEO | T5,T1,T6 |
| Copywriter | T6,(T21 sizes) |
| Creative Director | T6 |
| Image Gen | T6,T7,T22 |
| Video Gen | T6,T8,T22 |
| Publisher | T10–T19 (approved only),T22 |
| Analytics | T20,T6 |
| Compliance/Reviewer | T6 |
| Memory/Orchestrator/Notification | internal only |

## 6. Edge cases, risks, dependencies
- **Edge:** token expiry mid-publish → refresh or escalate, never partial-post silently.
- **Edge:** provider returns success but empty → treat as failure (validate output).
- **Risk:** secret leakage → secrets server-side only; redact in logs.
- **Risk:** runaway cost (image/video/search) → per-run + per-day caps; routing (11).
- **Dependencies:** 11 (provider routing), 13 (publish gating), 14 (ToolExecutor), `api_rate_limits`, `ai_call_log`, Supabase secrets + Storage.

## 7. Acceptance criteria
- Every tool call is validated, permission-checked, logged, and cost-accounted.
- Publishing tools act only on approved+compliant artifacts and never cross-channel fallback.
- MVP tools (T6, T7, T22) function end-to-end; others are interface-stubbed per roadmap.
