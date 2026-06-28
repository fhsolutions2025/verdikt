// Quality Assurance & Self-Healing layer (VERDIKT Marketing Studio spec §25).
//
// Two reusable pieces:
//  1. runQa()                 — an LLM "QA inspector" that scores a generated asset
//                               and returns the exact §25 output contract.
//  2. generateWithSelfHeal()  — a provider-agnostic generate→review→repair loop that
//                               feeds the reviewer's issues back into the next
//                               generation attempt so an agent can self-heal.
//
// Both lean on the existing patterns in lib/marketing/agents.ts: completeJson() from
// the LLM router for structured output, and getAgentPrompt() for an operator-editable
// instruction override stored in agent_configs.

import { completeJson } from '@/lib/llm/router'
import { getAgentPrompt } from '@/lib/marketing/agents'

// ── §25 output contract ─────────────────────────────────────────────────────────
export interface QaResult {
  status: 'pass' | 'fail' | 'needs_revision'
  score: number              // 0-100
  issues: string[]
  repair_required: boolean
  repair_type: string        // '' when none
  severity: 'low' | 'medium' | 'high' | 'critical'
  recommendation: string
  blocked_from_user: boolean
  blocked_from_publish: boolean
}

// Operator-editable instruction body (stored under agent_type 'qa_agent'); this is
// the in-code default used when the DB row is missing/blank/inactive.
export const DEFAULT_QA_INSTRUCTIONS = `Role: QA Inspector (quality gate) for an autonomous Marketing Department.
Rigorously inspect ONE generated marketing asset and decide whether it is safe to surface or publish.

Check for, at minimum:
- Broken or incomplete output: truncation, dangling sentences, empty/placeholder sections, raw template tokens, malformed markup/JSON.
- Missing required fields for the asset type (e.g. a social post with no caption, a blog with no title, an image spec with no prompt/alt text).
- Unreadable or garbled text: mojibake, repeated/looping text, wrong language, nonsensical filler.
- Weak or missing call-to-action when the asset type expects one.
- Brand / voice mismatch against the supplied brand context.
- Compliance red flags: promises of winnings, guaranteed returns, "risk-free", targeting minors, missing responsible-gaming notes, or unverified stats/odds presented as fact.

Score 0-100 (100 = flawless, ready to publish; below ~60 = serious problems).
Decide status:
- "pass": clean enough to surface and publish.
- "needs_revision": usable but has fixable issues; set repair_required true and name a concise repair_type.
- "fail": fundamentally broken or non-compliant.
Set severity by the WORST issue found ("low" | "medium" | "high" | "critical").
For CRITICAL issues (compliance violations, fully broken output) set blocked_from_user AND blocked_from_publish true.
For high-severity-but-internally-usable issues, set blocked_from_publish true while leaving blocked_from_user as appropriate.
Keep issues as short, specific bullet strings. recommendation is one actionable sentence.

Return STRICT JSON only:
{"status":"pass|fail|needs_revision","score":0,"issues":[],"repair_required":false,"repair_type":"","severity":"low|medium|high|critical","recommendation":"","blocked_from_user":false,"blocked_from_publish":false}`

// Safe, permissive defaults so a parsing failure never hard-blocks a pipeline.
function defaultQaResult(): QaResult {
  return {
    status: 'pass',
    score: 80,
    issues: [],
    repair_required: false,
    repair_type: '',
    severity: 'low',
    recommendation: '',
    blocked_from_user: false,
    blocked_from_publish: false,
  }
}

// ── narrowing helpers (strict TS, no `any`) ───────────────────────────────────────
const STATUS_VALUES = ['pass', 'fail', 'needs_revision'] as const
const SEVERITY_VALUES = ['low', 'medium', 'high', 'critical'] as const

function asStatus(v: unknown): QaResult['status'] {
  return typeof v === 'string' && (STATUS_VALUES as readonly string[]).includes(v)
    ? (v as QaResult['status'])
    : 'pass'
}

function asSeverity(v: unknown): QaResult['severity'] {
  return typeof v === 'string' && (SEVERITY_VALUES as readonly string[]).includes(v)
    ? (v as QaResult['severity'])
    : 'low'
}

function asScore(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return 80
  return Math.max(0, Math.min(100, Math.round(n)))
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function asBool(v: unknown): boolean {
  return v === true
}

// Coerce a loosely-typed LLM object into the strict QaResult contract.
function coerceQaResult(data: unknown): QaResult {
  if (!data || typeof data !== 'object') return defaultQaResult()
  const r = data as Record<string, unknown>
  return {
    status: asStatus(r.status),
    score: asScore(r.score),
    issues: asStringArray(r.issues),
    repair_required: asBool(r.repair_required),
    repair_type: asString(r.repair_type),
    severity: asSeverity(r.severity),
    recommendation: asString(r.recommendation),
    blocked_from_user: asBool(r.blocked_from_user),
    blocked_from_publish: asBool(r.blocked_from_publish),
  }
}

// ── 1. QA reviewer ────────────────────────────────────────────────────────────────
export async function runQa(input: {
  asset_type: string
  content: string
  brief?: string
  brand?: string
}): Promise<QaResult> {
  const instr = await getAgentPrompt('qa_agent', DEFAULT_QA_INSTRUCTIONS)
  const system = `${instr}

Asset type under review: ${input.asset_type}.${input.brand ? `\nBrand context: ${input.brand}` : ''}`

  const userParts: string[] = []
  if (input.brief) userParts.push(`Original brief / intent:\n${input.brief}`)
  userParts.push(`Asset content to inspect:\n${input.content}`)

  try {
    const { data } = await completeJson<QaResult>({
      task: 'review',
      system,
      messages: [{ role: 'user', content: userParts.join('\n\n').slice(0, 12000) }],
    })
    if (!data) return defaultQaResult()
    return coerceQaResult(data)
  } catch {
    return defaultQaResult()
  }
}

// ── 3. adapter: QaResult → review signal ──────────────────────────────────────────
export function qaToRepairSignal(qa: QaResult): { ok: boolean; issues: string[]; score: number } {
  // "ok" means the asset may proceed without a repair pass: a passing status, no
  // requested repair, and it is not blocked from being surfaced or published.
  const ok =
    qa.status === 'pass' &&
    !qa.repair_required &&
    !qa.blocked_from_user &&
    !qa.blocked_from_publish
  return { ok, issues: qa.issues, score: qa.score }
}

// ── 2. generic self-heal wrapper ──────────────────────────────────────────────────
//
// Generates a candidate, reviews it, and on failure regenerates up to `maxAttempts`,
// passing the reviewer's issues into the next generate() so the agent can repair.
// Tracks the best-scoring candidate seen and returns it if nothing ever fully passes.
export async function generateWithSelfHeal<T>(opts: {
  generate: (attempt: number, lastIssues: string[]) => Promise<T>
  review: (candidate: T) => Promise<{ ok: boolean; issues: string[]; score?: number }>
  maxAttempts?: number
}): Promise<{ value: T; attempts: number; passed: boolean; issues: string[] }> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3)

  let lastIssues: string[] = []
  let attempts = 0

  let bestValue: T | undefined
  let bestIssues: string[] = []
  let bestScore = -Infinity
  let bestSet = false

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attempts = attempt
    const candidate = await opts.generate(attempt, lastIssues)
    const verdict = await opts.review(candidate)

    if (verdict.ok) {
      return { value: candidate, attempts, passed: true, issues: verdict.issues }
    }

    // Track the best candidate by score (or the latest if scores are absent), so a
    // never-passing loop still returns the strongest attempt rather than the last.
    const score = typeof verdict.score === 'number' ? verdict.score : 0
    if (!bestSet || score >= bestScore) {
      bestValue = candidate
      bestIssues = verdict.issues
      bestScore = score
      bestSet = true
    }

    lastIssues = verdict.issues
  }

  // Exhausted attempts without a clean pass — return the best candidate we found.
  // bestSet is guaranteed true here because maxAttempts >= 1 ran the loop at least once.
  return {
    value: (bestSet ? bestValue : undefined) as T,
    attempts,
    passed: false,
    issues: bestIssues,
  }
}
