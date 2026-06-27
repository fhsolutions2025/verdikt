# 11 — LLM Configuration

**Audience:** AI Engineering, Backend · **Read after:** 06-prompts, 08-tools · **Read before:** 12-evals

---

## 1. Goals

Route each task to the **cheapest model that meets the quality bar**, behind a **provider-agnostic interface**, with deterministic fallback, structured output, caching, and full cost accounting. No agent hard-codes a provider/model; the **LLMRouter** resolves it from the task.

## 2. Provider-agnostic routing

`LLMRouter.complete({ task, system, messages, schema?, max_tokens?, overrides? })`:
1. Look up the **routing table** (§5) by `task` → `{provider, model_class, temperature, reasoning, output_type, fallback_chain}`.
2. Resolve `model_class` → a concrete model per provider config (§3).
3. Execute via the provider adapter (Anthropic live; OpenAI/others adapters behind same interface).
4. On failure → walk `fallback_chain`.
5. Log usage/cost to `ai_call_log`; enforce per-run budget.

**Adapters:** `AnthropicAdapter` (via `anthropic-proxy`) — **MVP live**. `OpenAIAdapter`, image/video adapters — interface defined, wired V1+. Adapters normalise request/response so callers are provider-blind.

## 3. Model classes (abstract → concrete)

| Class | Use | Anthropic | OpenAI (V1) |
|-------|-----|-----------|-------------|
| `reasoning-high` | Strategy, analysis, compliance edge | Claude Opus | o-series |
| `reasoning-mid` | Most generation, review | Claude Sonnet | GPT-class mid |
| `fast-cheap` | Short copy, summarise, classify, memory | Claude Haiku | GPT-mini |
| `image` | Image gen | — (Ideogram via `ideogram-proxy`) | image model |
| `video` | Video gen (V1) | — | video model |

Concrete model IDs live in **config**, not code/prompts, so upgrades are config-only.

## 4. Parameter strategy

| Concern | Policy |
|---------|--------|
| Temperature | By task (§5): low for compliance/SEO/analysis; mid for blog; higher for ideation/social/image prompts |
| Reasoning level | `high` for strategy/compliance/analysis; `mid` for generation; `low` for fast utility |
| Max tokens | Per task ceiling (blog ≫ social ≫ classify); hard cap per call; truncate context to budget |
| Structured output | Enforce JSON schema (06); use provider JSON mode where available; repair-parse + one re-ask on invalid |
| Determinism | Lower temperature + fixed prompts for evals/compliance to keep regression tests stable |

## 5. Routing table

| Task | Agent | Provider (MVP→V1) | Model Class | Temp | Reasoning | Output | Notes |
|------|-------|-------------------|-------------|------|-----------|--------|-------|
| Research | Research | Anthropic→multi | reasoning-mid | 0.4 | mid | JSON | grounded by tools; cite sources |
| Strategy | Campaign Planner/Master | Anthropic→multi | reasoning-high | 0.5 | high | JSON | plan quality matters; higher cost OK |
| Copywriting | Copywriter | Anthropic→multi | reasoning-mid | 0.8 | mid | JSON | brand-voice critical |
| SEO | SEO | Anthropic→multi | reasoning-mid | 0.3 | mid | JSON | precision; low temp |
| Blog writing | Copywriter | Anthropic→multi | reasoning-mid | 0.7 | mid | JSON | long max_tokens |
| Social posts | Copywriter | Anthropic→multi | fast-cheap | 0.9 | low | JSON | many cheap calls; creative |
| Image prompts | Image Gen | Anthropic→multi | fast-cheap | 0.9 | low | JSON | then Ideogram |
| Video prompts | Video Gen | Anthropic→multi | reasoning-mid | 0.8 | mid | JSON | V1 |
| Review | Reviewer | Anthropic→multi | reasoning-mid | 0.2 | mid | JSON | stable scoring |
| Compliance | Compliance | Anthropic→multi | reasoning-high | 0.0 | high | JSON | fail-closed; deterministic |
| Analytics | Analytics | Anthropic→multi | reasoning-high | 0.3 | high | JSON | V1; careful reasoning |
| Learning | Learning | Anthropic→multi | reasoning-mid | 0.4 | mid | JSON | V1 |
| Memory summarization | Memory Manager | Anthropic→multi | fast-cheap | 0.2 | low | JSON | cheap, frequent |

## 6. Cost optimisation

- **Route by value:** fast-cheap for high-volume/low-risk (social, summaries, classification); premium only for strategy/compliance/analysis.
- **Caching:** cache by `hash(prompt_version + inputs + model)` for idempotent calls (research lookups, repeated briefs); prompt-prefix caching where provider supports it; cache eval runs on unchanged inputs.
- **Batching:** generate the social pack with parallel cheap calls rather than one huge call.
- **Budget caps:** per-run USD cap (Master enforces); per-day department cap; image/video metered caps (reuse Page Design daily cap pattern).
- **Token discipline:** context assembled to a budget (10 §4); trim memory; avoid dumping full history.
- **Observability:** every call → `ai_call_log` (provider, model, tokens, latency, cost, success); dashboard shows cost per artifact (ties to existing API Health).

## 7. Fallback rules

| Condition | Action |
|-----------|--------|
| Transient error/timeout/429 | Retry same model: backoff 1s/2s/4s (max 3) |
| Model/provider down | Next entry in `fallback_chain` (e.g. Sonnet→Haiku, Anthropic→OpenAI when live) |
| Invalid structured output | Repair-parse → one re-ask with schema → fail task |
| Budget cap | Stop; mark run `budget_capped`; partial results |
| Compliance task failure | **Never** silently downgrade quality; escalate (fail-closed) |

**Fallback chains (example):** strategy: `Opus → Sonnet`; copy: `Sonnet → Haiku`; compliance: `Opus → (Opus retry) → human escalate` (no cheap fallback for compliance).

## 8. Configuration surface

- Routing table, concrete model IDs, fallback chains, caps, and provider keys live in **config** (DB `agent_configs`-style + env/secrets), editable by admin in Settings (03) — no code deploy to retune.
- Changes to routing/models are **eval-gated** (12): must not regress golden datasets.

## 9. Edge cases, risks, dependencies
- **Edge:** provider deprecates a model → swap concrete ID in config; class abstraction shields callers.
- **Edge:** schema drift between providers → adapters normalise; schema validation catches.
- **Risk:** cost spikes from fan-out → caps + routing + caching.
- **Risk:** quality regression on model swap → eval gate.
- **Dependencies:** `anthropic-proxy` (live), `ideogram-proxy`, `ai_call_log`, `api_rate_limits`, Supabase secrets; OpenAI/video keys for V1.

## 10. Acceptance criteria
- Callers never reference a concrete model/provider; all go through `LLMRouter`.
- Every task resolves a routing entry; unknown tasks fail loudly (no silent default).
- Compliance runs deterministically (temp 0, high reasoning) and never cheap-falls-back.
- Every call is cost-logged; per-run budget enforced.
