// Structured memory layer (VERDIKT Marketing Studio spec § Campaign Memory).
//
// The Campaign Director "remembers everything" so it never asks for the same fact
// twice. Memory exists at three+ levels — User, Organization, Brand, Campaign —
// stored as (namespace, brand_id, key, value) rows in mkt_memory and upserted via
// the unique index added in migration 0044.
//
// Durable facts (audience, tone, channels, region, vertical) are kept at BRAND
// scope so a second campaign for the same brand pre-fills them. Campaign-specific
// facts (a one-off goal, notes) are kept at CAMPAIGN scope, keyed by campaign id.

import { createServiceClient } from '@/lib/supabase/server'

type Svc = Awaited<ReturnType<typeof createServiceClient>>

export type MemoryNamespace = 'user' | 'org' | 'brand' | 'campaign'

export interface MemoryScope {
  namespace: MemoryNamespace
  brandId?: string | null
  orgId?: string | null
}

// The brand-level brief fields the Director re-uses across campaigns. Keep this in
// sync with the durable keys written by rememberBrief() below.
export const DURABLE_BRIEF_KEYS = ['vertical', 'audience', 'region', 'tone', 'channels'] as const
export type DurableBriefKey = (typeof DURABLE_BRIEF_KEYS)[number]

export interface RecalledBrief {
  vertical?: string
  audience?: string
  region?: string
  tone?: string
  channels?: string[]
}

// Upsert a bag of facts at a given scope. Values are stored as jsonb; empty values
// are skipped so we never "remember" a blank answer over a real one.
export async function writeMemory(
  svc: Svc,
  scope: MemoryScope,
  facts: Record<string, unknown>,
  opts?: { source?: string; confidence?: number },
): Promise<void> {
  const rows = Object.entries(facts)
    .filter(([, v]) => v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '') && !(Array.isArray(v) && v.length === 0))
    .map(([key, value]) => ({
      namespace: scope.namespace,
      brand_id: scope.brandId ?? null,
      org_id: scope.orgId ?? null,
      key,
      value,
      source: opts?.source ?? 'agent',
      confidence: opts?.confidence ?? 0.7,
      updated_at: new Date().toISOString(),
    }))
  if (!rows.length) return
  await svc.from('mkt_memory').upsert(rows, { onConflict: 'namespace,brand_id,key' })
}

// Read all facts at a scope as a flat { key: value } map.
export async function readMemory(svc: Svc, scope: MemoryScope): Promise<Record<string, unknown>> {
  let q = svc.from('mkt_memory').select('key,value').eq('namespace', scope.namespace)
  q = scope.brandId ? q.eq('brand_id', scope.brandId) : q.is('brand_id', null)
  const { data } = await q
  const out: Record<string, unknown> = {}
  for (const r of data ?? []) out[r.key as string] = (r as { value: unknown }).value
  return out
}

// ── Brief-specific helpers ────────────────────────────────────────────────────

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined
}
function asStringArray(v: unknown): string[] | undefined {
  if (Array.isArray(v)) {
    const arr = v.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    return arr.length ? arr : undefined
  }
  if (typeof v === 'string' && v.trim()) return v.split(',').map(s => s.trim()).filter(Boolean)
  return undefined
}

// Recall the durable brief fields the Director already knows for a brand, so the
// interview can prefill them instead of re-asking.
export async function recallBrief(svc: Svc, brandId: string): Promise<RecalledBrief> {
  const m = await readMemory(svc, { namespace: 'brand', brandId })
  return {
    vertical: asString(m.vertical),
    audience: asString(m.audience),
    region: asString(m.region),
    tone: asString(m.tone),
    channels: asStringArray(m.channels),
  }
}

// Persist the durable parts of a completed brief at brand scope so future
// campaigns for this brand can skip those questions.
export async function rememberBrief(
  svc: Svc,
  brandId: string,
  brief: { vertical?: string; audience?: string; region?: string; tone?: string; channels?: string[] },
): Promise<void> {
  await writeMemory(svc, { namespace: 'brand', brandId }, {
    vertical: brief.vertical,
    audience: brief.audience,
    region: brief.region,
    tone: brief.tone,
    channels: brief.channels,
  }, { source: 'director_interview', confidence: 0.7 })
}
