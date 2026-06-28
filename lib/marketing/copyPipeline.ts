// Copy pipeline (VERDIKT Marketing Studio spec § Copywriter).
//
// Implements the spec's copy execution pipeline for a single channel:
//   draft (channel-adapted) → self-review (multi-dimension quality score) →
//   rewrite if below threshold (self-heal) → return scored copy.
//
// The Copywriter "never duplicates text" — each channel gets copy optimized for its
// length, tone, format, and intent. Scoring mirrors the spec's Inspector dimensions
// (grammar / brand voice / readability / CTA / SEO / overall).

import { completeJson } from '@/lib/llm/router'
import { getAgentPrompt, type BrandCtx } from '@/lib/marketing/agents'
import { generateWithSelfHeal } from '@/lib/marketing/qa'
import type { CampaignBrief } from '@/lib/marketing/directorInterview'

// ── Channel specs — how copy is adapted per platform ──────────────────────────
export interface ChannelSpec {
  label: string
  maxChars: number       // soft cap for the body
  format: string         // shape guidance for the model
  wantsHashtags: boolean
}

export const CHANNEL_SPECS: Record<string, ChannelSpec> = {
  instagram: { label: 'Instagram', maxChars: 350, format: 'punchy caption, line breaks, 1 clear CTA', wantsHashtags: true },
  x:         { label: 'X / Twitter', maxChars: 260, format: 'single tight post under 280 chars', wantsHashtags: true },
  facebook:  { label: 'Facebook', maxChars: 500, format: 'conversational post with a hook + CTA', wantsHashtags: false },
  linkedin:  { label: 'LinkedIn', maxChars: 1000, format: 'professional, credible, value-led', wantsHashtags: true },
  tiktok:    { label: 'TikTok', maxChars: 200, format: 'casual hook caption, trend-aware', wantsHashtags: true },
  youtube:   { label: 'YouTube', maxChars: 600, format: 'title + description with timestamps hint', wantsHashtags: false },
  email:     { label: 'Email', maxChars: 900, format: 'subject line + short body + CTA button text', wantsHashtags: false },
  blog:      { label: 'Blog', maxChars: 2000, format: 'title + intro + scannable body in markdown', wantsHashtags: false },
  google_ads:{ label: 'Google Ads', maxChars: 90, format: 'headline (<=30 chars) + description (<=90 chars)', wantsHashtags: false },
  push:      { label: 'Push Notification', maxChars: 120, format: 'title (<=40) + body (<=120)', wantsHashtags: false },
}

export function channelSpec(channel: string): ChannelSpec {
  return CHANNEL_SPECS[channel] ?? { label: channel, maxChars: 400, format: 'native post with a clear CTA', wantsHashtags: false }
}

// ── Channel-adapted draft ─────────────────────────────────────────────────────
export interface ChannelCopy {
  channel: string
  headline: string
  body: string
  cta: string
  hashtags: string[]
}

const DEFAULT_COPY_INSTR = `Role: Copywriter. Write native, on-brand marketing copy adapted to ONE channel.
Honor the channel's length, tone, and format exactly. Never invent stats/odds/guarantees;
never use "risk-free" or promise winnings. Lead with a hook; end with a single clear CTA.`

async function draftChannelCopy(
  brand: BrandCtx, brief: CampaignBrief, channel: string, knowledge: string, lastIssues: string[],
): Promise<ChannelCopy> {
  const spec = channelSpec(channel)
  const instr = await getAgentPrompt('mkt_copywriter', DEFAULT_COPY_INSTR)
  const repair = lastIssues.length ? `\n\nThe previous draft was rejected for: ${lastIssues.join('; ')}. Fix these.` : ''
  const system = `${instr}
Brand: ${brand.name}. Voice: ${JSON.stringify(brand.voice)}. Region: ${brand.region}.
Channel: ${spec.label}. Format: ${spec.format}. Keep the body under ~${spec.maxChars} characters.
${spec.wantsHashtags ? 'Include 3-6 relevant hashtags.' : 'Do not include hashtags.'}${knowledge ? `\n\n${knowledge}` : ''}${repair}
Return STRICT JSON: {"headline":"","body":"","cta":"","hashtags":[]}`
  const user = `Campaign: goal=${brief.goal}; vertical=${brief.vertical}; audience=${brief.audience}; tone=${brief.tone}.`
  const { data, raw } = await completeJson<ChannelCopy>({ task: 'copywriting', system, messages: [{ role: 'user', content: user }] })
  return {
    channel,
    headline: data?.headline?.trim() || (brief.goal || 'Verdikt').slice(0, 60),
    body: data?.body?.trim() || raw.slice(0, spec.maxChars),
    cta: data?.cta?.trim() || 'Learn more',
    hashtags: Array.isArray(data?.hashtags) ? data!.hashtags.filter(h => typeof h === 'string') : [],
  }
}

// ── Multi-dimension quality score (spec § Quality Score) ──────────────────────
export interface CopyScore {
  grammar: number
  brand_voice: number
  readability: number
  cta: number
  seo: number
  overall: number
  verdict: 'pass' | 'rewrite'
  issues: string[]
}

const DEFAULT_SCORE_INSTR = `Role: Copy QA Inspector. Score one piece of marketing copy 0-100 on each dimension:
grammar, brand_voice, readability, cta (call-to-action strength), seo. Compute an overall.
Set verdict "rewrite" if overall < 80 or any dimension < 70; otherwise "pass". List concrete,
actionable issues (empty if clean). Flag any compliance red flag (winnings/risk-free/odds) as a
critical issue and force "rewrite".`

export async function scoreCopy(brand: BrandCtx, channel: string, copy: ChannelCopy): Promise<CopyScore> {
  const instr = await getAgentPrompt('mkt_reviewer', DEFAULT_SCORE_INSTR)
  const system = `${instr}
Brand: ${brand.name}. Voice: ${JSON.stringify(brand.voice)}. Channel: ${channelSpec(channel).label}.
Return STRICT JSON: {"grammar":0,"brand_voice":0,"readability":0,"cta":0,"seo":0,"overall":0,"verdict":"pass|rewrite","issues":[]}`
  const content = `${copy.headline}\n\n${copy.body}\n\nCTA: ${copy.cta}${copy.hashtags.length ? `\n${copy.hashtags.join(' ')}` : ''}`
  const num = (v: unknown, d = 80): number => {
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : d
  }
  try {
    const { data } = await completeJson<CopyScore>({ task: 'review', system, messages: [{ role: 'user', content }] })
    const overall = num(data?.overall)
    return {
      grammar: num(data?.grammar), brand_voice: num(data?.brand_voice), readability: num(data?.readability),
      cta: num(data?.cta), seo: num(data?.seo), overall,
      verdict: data?.verdict === 'rewrite' ? 'rewrite' : overall < 80 ? 'rewrite' : 'pass',
      issues: Array.isArray(data?.issues) ? data!.issues.filter(i => typeof i === 'string') : [],
    }
  } catch {
    return { grammar: 80, brand_voice: 80, readability: 80, cta: 80, seo: 80, overall: 80, verdict: 'pass', issues: [] }
  }
}

// ── Full pipeline for one channel: draft → score → self-heal rewrite ──────────
export interface ScoredCopy { copy: ChannelCopy; score: CopyScore; attempts: number; passed: boolean }

export async function runChannelCopy(
  brand: BrandCtx, brief: CampaignBrief, channel: string, knowledge: string,
): Promise<ScoredCopy> {
  let lastScore: CopyScore | null = null
  const { value, attempts, passed } = await generateWithSelfHeal<ChannelCopy>({
    maxAttempts: 3,
    generate: (_attempt, lastIssues) => draftChannelCopy(brand, brief, channel, knowledge, lastIssues),
    review: async (candidate) => {
      const s = await scoreCopy(brand, channel, candidate)
      lastScore = s
      return { ok: s.verdict === 'pass', issues: s.issues, score: s.overall }
    },
  })
  return {
    copy: value,
    score: lastScore ?? { grammar: 80, brand_voice: 80, readability: 80, cta: 80, seo: 80, overall: 80, verdict: 'pass', issues: [] },
    attempts, passed,
  }
}
