# Verdikt

Play-money binary prediction market with a built-in autonomous AI Marketing Department.

Verdikt lets players trade YES/NO on real-world outcomes (sports, crypto, news/current
affairs, finance, responsible-gaming) while an AI marketing team — a Campaign Director
agent plus specialist sub-agents — plans, generates, checks compliance on, and publishes
marketing content for the platform.

## Portals

| Portal | Path | Who |
|---|---|---|
| Player | `/player` | End users — trade markets, manage wallet/positions, view results |
| MM Desk | `/mm-desk` | Market makers — review AI-proposed markets, seed liquidity |
| Company | `/company` | Admins — market pipeline, API health, AI Marketing Workspace, CMS |

Demo login: `demo@verdikt.io` / `verdikt2025` (admin role).

## Stack

- **Frontend:** Next.js 14 (App Router), TypeScript, React 18
- **Backend:** Supabase — Postgres + Row-Level Security, Edge Functions (Deno), Storage,
  `pg_cron`, `pgvector`
- **AI/media:** Anthropic (Claude), OpenAI, Ideogram, fal.ai — reached only through thin
  edge-function proxies that hold provider keys

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Other scripts: `npm run build`, `npm run start`, `npm run lint`.

## Documentation

- [`CLAUDE.md`](./CLAUDE.md) — working notes: market lifecycle, trading/RLS rules, LLM
  routing, migrations/deploy workflow, and the gotchas catalogue. Read before changing
  anything in that area.
- [`docs/verdikt-marketing-agent/`](./docs/verdikt-marketing-agent/) — the AI Marketing
  Department spec (18 files) plus the desktop workspace interaction map.

## Deployment

Deployed on [Vercel](https://vercel.com). Database/edge functions live on Supabase
(project migrations in `supabase/migrations/`, functions in `supabase/functions/`).
