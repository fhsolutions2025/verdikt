# CLAUDE.md — Verdikt working notes

Single source of truth for how this codebase actually works. Read the relevant
section **before** changing anything in that area. If you discover a new rule or
gotcha, add it here.

---

## 0. Before you change X, know Y (quick index)

| If you're touching… | Read | Key gotcha |
|---|---|---|
| Any LLM call | §5 LLM | Opus 4.8 **rejects `temperature`**; route via `LLMRouter`/proxies, never hard-code keys |
| A market's state | §2 lifecycle | Only `live` markets are tradeable; `ai_ready` must pass Company→MM gates |
| Trading / payouts | §3 trading | `execute_trade`/`resolve_market` are admin-gated SECURITY DEFINER; cron must self-authorize |
| A cron / scheduled job | §3.3, §6 | Runs with **no auth.uid()** → admin-gated RPCs reject it unless it sets `request.jwt.claims` |
| Reading user data | §4 RLS | `owner-or-admin` policies; demo user is admin; use service client server-side for observability |
| Running SQL / migrations | §6 | Container egress **blocks `*.supabase.co`** — apply via MCP, keep repo migration file in sync |
| Edge functions | §6 | Deploy via MCP `deploy_edge_function`; secrets live in Supabase secrets only |
| Testing live | §7 | Can't reach Supabase/providers from container; verify via MCP (DB) or the user's running app |

---

## 1. Project overview

Verdikt — play-money binary **prediction market** + an **autonomous AI Marketing
Department**. Three portals: **/player**, **/mm-desk**, **/company** (admin console).

**Stack:** Next.js (App Router, TS) · Supabase (Postgres + RLS + Edge Functions +
Storage + pg_cron) · Anthropic (Claude) + OpenAI + Ideogram via thin edge-function
proxies. Demo login: `demo@verdikt.io` / `verdikt2025` (role **admin**).
Supabase project id: `mqptajyjasrgsfcxkhnw`.

---

## 2. Market lifecycle (state machine)

```
pending_ai ──normalize──> ai_ready ──┐
        └──────────────(Company approve, either state)──> pending_mm_review ──MM seed──> live
                                                                                          │
                                          live ──closes_at reached / manual──> resolved | voided
```

| Edge | Who / what | Mechanism |
|------|-----------|-----------|
| seed → `pending_ai` | AI generators | `seed-rss/sports/finance-markets` (emit `ai_rationale`) |
| `pending_ai` → `ai_ready` | normalize/pricing | `normalize-byv-market` (Haiku; sets price, confidence, rationale) |
| `pending_ai`/`ai_ready` → `pending_mm_review` | **Company gate** | `company_approve_market` (admin); from the Company → Pipeline "Run now" review panel |
| `pending_ai`/`ai_ready` → `voided` | **Company reject** | `company_reject_market` (admin) |
| `pending_mm_review` → `live` | **MM gate** | `approve_ai_market` → `seed_market` (seeds liquidity). MM desk shows `pending_mm_review` only |
| `live` → `resolved`/`voided` | resolution | `resolve_market(id, outcome)` (admin) or auto-close cron |

- **Only `live` markets are tradeable.** The player feed shows **live only**;
  `ai_ready`/review markets must not appear as tradeable (they failed silently before).
- `creator_type`: `ai_system` (generators) vs `player_mm` (BYV player-created).
- `ai_rationale` (markets col) holds the AI's "why this market" — shown at both gates
  and on player market detail ("Why this market"). Always capture it in generators.

---

## 3. Trading, resolution, auto-close

### 3.1 Trading
- `execute_trade(market_id, taker_id, side, amount, is_simulated, sim_name)` —
  deducts wallet, writes a `trade`, upserts a `positions` row, inserts a
  `wallet_transactions('trade', -total)`. Requires `status='live'`. Returns `position_id`.
- A player with **no wallet row** → wallet writes affect 0 rows (position still created).
  New users get a wallet via `handle_new_user()` trigger; seeded/demo users may need backfill.
- Sells: `sell_position` (instant MM buyback at mid).

### 3.2 Resolution (payouts)
- `resolve_market(market_id, outcome market_outcome)` sets `resolved`, settles every
  open position (won → payout = shares; lost → 0; void → refund entry), writes
  `wallet_transactions('payout', …)`. **Admin-gated** (see §3.3).

### 3.3 Auto-close + auto-resolve  ⚠ gotcha
- `close_due_markets()` (migration 0032) + pg_cron `close-due-markets` every 10 min:
  resolves every `live` market past `closes_at` using a **price-implied** outcome
  (`yes_price >= 50 ⇒ YES else NO`) — there is no external oracle.
- `resolve_market` is **admin-gated**: it requires `request.jwt.claims.role='service_role'`
  OR `auth.uid()` is an admin. **pg_cron has neither**, so `close_due_markets()` does
  `perform set_config('request.jwt.claims','{"role":"service_role"}', true)` before
  calling it. Any other system/cron function calling an admin-gated RPC must do the same.
- Manual MM/company resolution before the cron wins (market is no longer `live`).

---

## 4. RLS / auth

- `getAuthContext()` (`lib/auth.ts`) → `{ user, role }`; role read with the **service
  client** to dodge profiles-RLS recursion. `isAdmin()` helper.
- `is_admin()` SQL fn (migration 0026) is SECURITY DEFINER and reads profiles bypassing
  RLS — use it in policies; never `EXISTS(select from profiles…)` inline (caused recursion).
- Pattern: `*: owner or admin` SELECT policies (`player_id = auth.uid() or is_admin()`)
  on positions/wallets/wallet_transactions; admin-only read on observability tables.
- **Server components for observability** (ai_call_log, api_rate_limits, marketing,
  pipeline) use `createServiceClient()` (bypasses RLS); user-scoped pages use the
  cookie `createClient()`.

---

## 5. LLM / agents

- **Never hard-code provider keys or model ids in app code.** Use:
  - `lib/llm/router.ts` `complete({task,...})` — task→provider/model/temp routing table,
    retries, fallback, cost logging to `ai_call_log` (`call_type='marketing:<task>'`).
  - Edge proxies (keys in Supabase secrets): `anthropic-proxy`, `openai-proxy`,
    `openai-image-proxy`, `ideogram-proxy`. App routes call these with the service-role bearer.
- **Model ids:** Opus `claude-opus-4-8`, Sonnet `claude-sonnet-4-6`, Haiku
  `claude-haiku-4-5-20251001`; OpenAI `gpt-4o` / `gpt-4o-mini`, images `gpt-image-1`.
- ⚠ **Opus 4.8 rejects `temperature`** ("temperature is deprecated for this model").
  `anthropicComplete` omits it for `claude-opus-4-*` (`modelRejectsTemperature`). Apply the
  same if you add another reasoning model.
- API Health (`ApiHealthMonitor` + `app/company/page.tsx`): per-provider cost/usage from
  `ai_call_log`; "today" uses a **UTC** day boundary; provider error is **self-clearing**
  (only shows if the most recent call failed).

---

## 6. Migrations, edge functions, secrets, egress  ⚠

- **The container cannot reach `*.supabase.co`** (egress policy → `403 CONNECT tunnel
  failed`). So:
  - Apply DDL/data via **MCP** `apply_migration` / `execute_sql`, AND keep a matching file
    in `supabase/migrations/00NN_*.sql` so the repo stays the source of truth.
  - Deploy edge functions via **MCP** `deploy_edge_function` (also keep the repo file).
  - `npm run build`/`tsc` work locally; **runtime calls to Supabase do not**.
- Node's built-in `fetch` ignores `HTTPS_PROXY` unless `NODE_USE_ENV_PROXY=1` (Node ≥22.21)
  — but Supabase host is egress-blocked anyway, so prefer MCP.
- pg_cron + pg_net enabled (0008/0010). Schedule with `cron.schedule`, unschedule first
  for idempotency.

---

## 7. Testing in this environment

- **DB-level checks:** MCP `execute_sql` (reaches the DB). Multi-statement calls only
  return the **last** statement's rows — split queries or use one combined SELECT.
- **Live LLM/image/trade flows:** can't run from the container (egress). Verify in the
  user's running app, or simulate at the DB layer via MCP (e.g., fast-forward `closes_at`
  then `select close_due_markets()` and assert payouts).
- Always run `npx tsc --noEmit` then `npm run build` before committing UI/route changes.

---

## 8. Git / workflow

- Develop on branch **`claude/loving-feynman-gf3vji`**; merge to `main` only when the user
  says so. Keep both in sync after a merge.
- `git config user.email noreply@anthropic.com && user.name Claude` before commits.
- Commit messages end with the Co-Authored-By / Claude-Session trailers.
- Push with retries/backoff on network errors.

---

## 9. Key paths

- Player: `app/player/*`, `components/player/*` (MarketCard, PlayerFeedClient, TradeTicket,
  PositionsClient, WalletStatement). Time-to-expire: `lib/marketTime.ts`.
  - **Header menu**: the player header (`components/shared/PersonaSwitcher.tsx`) shows a
    **hamburger** → `PlayerMenuDrawer` (theme `ThemeToggle`, display `SkinToggle`, links,
    Log Out). Results is a **slide-over** (`ResultsDrawer`, self-fetches) not a tab/route;
    `SideDrawer` is the shared right slide-over primitive. mm-desk keeps inline toggles.
  - **Home banner** = `BannerCarousel` (Visual skin only) over `promo_banners` (active,
    ordered); falls back to the `hero_cta_banner` page asset when none. VisualHero is gone.
  - **CMS info pages**: `/player/info/[slug]` renders published `cms_pages` via
    `lib/markdownLite.tsx` (dependency-free). Slugs: about/privacy/terms/support/rewards.
    `/player/profile` is the user's own account (not CMS).
- Company: `app/company/page.tsx`, `components/company/*` (CompanyDashboard, ApiHealthMonitor,
  MarketsPipelineTab, PendingReviewSection, marketing/*). Marketing workspace: `app/company/marketing/*`.
  - **Content** tab (`ContentPagesTab` → `/api/company/cms`) edits `cms_pages`; **Banners**
    tab (`BannersTab` → `/api/company/banners` + `/banners/image`) manages the carousel,
    generating art via the Ideogram + Storage re-host pipeline (bucket `marketing-media`).
  - Admin writes use the **service client** (RLS bypass); player/anon reads are gated to
    `is_published` / `is_active` (mirrors `page_assets`).
- MM desk: `components/mm-desk/*` (AiReadyMarketCard, MmDeskClient).
- Agent/marketing libs: `lib/llm/*`, `lib/marketing/*`. Image/IP guard: `lib/promptGuard.ts`.
- Generators / jobs: `supabase/functions/*`. RPCs/schema: `supabase/migrations/*`.
- Marketing dept spec: `docs/verdikt-marketing-agent/*` (18 files).

---

## 10. Gotchas catalogue (things that have bitten us)

1. Opus rejects `temperature` → omit it for `claude-opus-4-*`.
2. Admin-gated RPCs (`resolve_market`, `approve`, seed) reject cron → self-authorize as
   `service_role` via `set_config`.
3. Container egress blocks Supabase → use MCP; don't "fix" with proxy hacks.
4. Player feed must filter to `live`; `ai_ready` markets aren't tradeable (silent failures).
5. RLS recursion if a policy self-queries `profiles` → use `is_admin()`.
6. Markets don't auto-close without the cron (0032); `closes_at` alone does nothing.
7. API Health "today" must be a UTC boundary; provider error must self-clear.
8. MCP `execute_sql` returns only the last statement's result set.
9. New/seeded users may lack a wallet row → trades skip wallet writes.
10. Plan-mode/tool-permission hiccups can drop you mid-task → re-exit plan mode and resume.
