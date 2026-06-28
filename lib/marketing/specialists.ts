// Specialist marketing AI agents (VERDIKT Marketing Studio spec §6, §23).
//
// Four approval/QA-oriented specialists that sit alongside the Campaign Director
// sub-agents in lib/marketing/agents.ts. Each is a thin, schema-returning wrapper
// over the LLM router (lib/llm/router.ts): it loads its operator-editable
// instruction block from agent_configs via getAgentPrompt() (falling back to the
// in-code DEFAULT_* below), prepends a concise global preamble, and returns
// STRICT-JSON-shaped output with defensive defaults if parsing fails.
//
// Keep the DEFAULT_* instruction text here in sync with the seeded system_prompt
// in supabase/migrations/0043_specialist_agents.sql.

import { completeJson } from '@/lib/llm/router'
import { getAgentPrompt, type BrandCtx } from '@/lib/marketing/agents'

// Concise local preamble (GLOBAL_PREAMBLE in agents.ts is not exported, so it is
// re-declared here in a shorter form for the specialist agents).
const GLOBAL_PREAMBLE = `You are a specialized agent inside Verdikt's autonomous Marketing Department.
Verdikt is a prediction-market / iGaming platform operating across multiple regions.
Rules: (1) produce structured JSON output only; (2) never invent stats, odds, prices, or
guarantees; (3) respect brand voice and region rules; (4) never promise winnings or use
"risk-free"; (5) flag anything needing a human review rather than approving it silently.`

// ── In-code default instructions (kept in sync with migration 0043 seeds) ─────────

const DEFAULT_BRAND_GUARDIAN = `Role: Brand Guardian (approval gate).
Assess whether the provided content honors Verdikt's brand voice, tone, and positioning.
Check for off-brand language, banned phrases ("risk-free", guaranteed winnings), inconsistent
tone, and anything that would dilute the brand. Return STRICT JSON:
{"verdict":"approve|reject","score":0.0,"issues":[]}
score is 0-1 (brand alignment). Reject if any banned phrase or material off-brand issue is present;
list every concrete issue. Do not generate or rewrite content — review only.`

const DEFAULT_COMPLIANCE = `Role: Compliance Reviewer (regulatory gate).
Evaluate the content against gambling/iGaming advertising rules for the given region and vertical.
Identify legal/regulatory risks (age, responsible-gaming, misleading odds, prohibited claims) and
the disclosures that must appear. Return STRICT JSON:
{"verdict":"pass|warn|block","risks":[],"required_disclosures":[]}
Use "block" for hard violations, "warn" for fixable concerns, "pass" only when clean.
Do not generate or rewrite content — review only.`

const DEFAULT_SEO = `Role: SEO Specialist.
Optimize the content for search discoverability around the given topic without changing its meaning
or inventing facts. Return STRICT JSON:
{"keywords":[],"meta_title":"","meta_description":"","recommendations":[]}
Provide 5-10 relevant keywords, a meta_title (<=60 chars), a meta_description (<=155 chars), and
concrete on-page recommendations.`

const DEFAULT_REVIEWER = `Role: Reviewer / QA (quality gate).
Score the provided content for overall quality: brand voice, clarity, accuracy, and relevance.
Return STRICT JSON:
{"overall":0.0,"verdict":"pass|regenerate","feedback":[]}
overall is 0-1. Use "regenerate" if the content falls short on any dimension; list actionable feedback.
Do not generate or rewrite content — review only.`

// ── Brand Guardian ────────────────────────────────────────────────────────────────
export interface BrandGuardianOut {
  verdict: 'approve' | 'reject'
  score: number
  issues: string[]
}

export async function runBrandGuardian(
  brand: BrandCtx, kind: string, content: string,
): Promise<BrandGuardianOut> {
  const instr = await getAgentPrompt('mkt_brand_guardian', DEFAULT_BRAND_GUARDIAN)
  const system = `${GLOBAL_PREAMBLE}
Brand: ${brand.name}. Voice: ${JSON.stringify(brand.voice)}. Region: ${brand.region}.
${instr}`
  const { data } = await completeJson<BrandGuardianOut>({
    task: 'review', system,
    messages: [{ role: 'user', content: `Content kind: ${kind}\n---\n${content.slice(0, 4000)}` }],
  })
  return {
    verdict: data?.verdict === 'reject' ? 'reject' : 'approve',
    score: typeof data?.score === 'number' ? data.score : 0.8,
    issues: Array.isArray(data?.issues) ? data.issues : [],
  }
}

// ── Compliance Reviewer ─────────────────────────────────────────────────────────
export interface ComplianceOut {
  verdict: 'pass' | 'warn' | 'block'
  risks: string[]
  required_disclosures: string[]
}

export async function runComplianceReviewer(
  region: string, vertical: string, content: string,
): Promise<ComplianceOut> {
  const instr = await getAgentPrompt('mkt_compliance', DEFAULT_COMPLIANCE)
  const system = `${GLOBAL_PREAMBLE}
Region: ${region}. Vertical: ${vertical}.
${instr}`
  const { data } = await completeJson<ComplianceOut>({
    task: 'compliance', system,
    messages: [{ role: 'user', content: content.slice(0, 4000) }],
  })
  const verdict = data?.verdict
  return {
    verdict: verdict === 'block' || verdict === 'warn' || verdict === 'pass' ? verdict : 'warn',
    risks: Array.isArray(data?.risks) ? data.risks : [],
    required_disclosures: Array.isArray(data?.required_disclosures) ? data.required_disclosures : [],
  }
}

// ── SEO Specialist ────────────────────────────────────────────────────────────────
export interface SeoOut {
  keywords: string[]
  meta_title: string
  meta_description: string
  recommendations: string[]
}

export async function runSeoSpecialist(
  topic: string, content: string,
): Promise<SeoOut> {
  const instr = await getAgentPrompt('mkt_seo', DEFAULT_SEO)
  const system = `${GLOBAL_PREAMBLE}
${instr}`
  const { data } = await completeJson<SeoOut>({
    task: 'seo', system,
    messages: [{ role: 'user', content: `Topic: ${topic}\n---\n${content.slice(0, 4000)}` }],
  })
  return {
    keywords: Array.isArray(data?.keywords) ? data.keywords : [],
    meta_title: typeof data?.meta_title === 'string' ? data.meta_title : topic.slice(0, 60),
    meta_description: typeof data?.meta_description === 'string' ? data.meta_description : '',
    recommendations: Array.isArray(data?.recommendations) ? data.recommendations : [],
  }
}

// ── Reviewer / QA ─────────────────────────────────────────────────────────────────
export interface ReviewerQaOut {
  overall: number
  verdict: 'pass' | 'regenerate'
  feedback: string[]
}

export async function runReviewerQa(
  kind: string, content: string,
): Promise<ReviewerQaOut> {
  const instr = await getAgentPrompt('mkt_reviewer', DEFAULT_REVIEWER)
  const system = `${GLOBAL_PREAMBLE}
${instr}`
  const { data } = await completeJson<ReviewerQaOut>({
    task: 'review', system,
    messages: [{ role: 'user', content: `Content kind: ${kind}\n---\n${content.slice(0, 4000)}` }],
  })
  return {
    overall: typeof data?.overall === 'number' ? data.overall : 0.8,
    verdict: data?.verdict === 'regenerate' ? 'regenerate' : 'pass',
    feedback: Array.isArray(data?.feedback) ? data.feedback : [],
  }
}
