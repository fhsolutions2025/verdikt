// Hardcoded VERDIKT Campaign Director interview.
//
// The Director view walks the operator through these steps one at a time (MCQ chip
// cards + optional custom text). The collected answers are reduced by buildBrief()
// into a campaignBrief JSON that the director run route persists to
// mkt_campaign_briefs and feeds to the three sub-agents.
//
// Steps with `dynamicOptions` have their choices supplied by the UI at render time
// (regions come from mkt_compliance_regions, brands from mkt_brands) so the curated
// VERDIKT verticals/tones stay hardcoded while data-driven lists stay live.

export type StepKind = 'mcq' | 'multi' | 'text'

export interface InterviewOption { value: string; label: string }

export interface InterviewStep {
  id: string
  prompt: string
  helper?: string
  kind: StepKind
  options?: InterviewOption[]
  /** When set, the UI injects options from live data instead of `options`. */
  dynamicOptions?: 'regions' | 'brands'
  /** Allow a free-text answer alongside the chips (mcq/multi). */
  allowCustom?: boolean
  /** Optional — a text step the operator may skip. */
  optional?: boolean
}

export const VERDIKT_VERTICALS: InterviewOption[] = [
  { value: 'sports', label: 'Sports' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'current_affairs', label: 'Current Affairs' },
  { value: 'finance', label: 'Finance' },
  { value: 'responsible_gaming', label: 'Responsible Gaming' },
]

export const INTERVIEW: InterviewStep[] = [
  {
    id: 'brand',
    prompt: 'Which brand is this campaign for?',
    helper: 'The brand kit (voice + region) shapes every asset.',
    kind: 'mcq',
    dynamicOptions: 'brands',
  },
  {
    id: 'vertical',
    prompt: 'Which VERDIKT vertical are we promoting?',
    kind: 'mcq',
    options: VERDIKT_VERTICALS,
    allowCustom: true,
  },
  {
    id: 'goal',
    prompt: "What's the objective of this campaign?",
    helper: 'e.g. drive sign-ups for IPL markets, re-engage dormant players.',
    kind: 'text',
  },
  {
    id: 'audience',
    prompt: 'Who is the audience?',
    helper: 'Describe who this is for.',
    kind: 'text',
  },
  {
    id: 'region',
    prompt: 'Which region governs the compliance framing?',
    kind: 'mcq',
    dynamicOptions: 'regions',
  },
  {
    id: 'channels',
    prompt: 'Which channels should we create for?',
    helper: 'Pick all that apply — the router will confirm the optimal mix.',
    kind: 'multi',
    options: [
      { value: 'instagram', label: 'Instagram' },
      { value: 'x', label: 'X / Twitter' },
      { value: 'facebook', label: 'Facebook' },
      { value: 'tiktok', label: 'TikTok' },
      { value: 'youtube', label: 'YouTube' },
      { value: 'blog', label: 'Blog' },
      { value: 'email', label: 'Email' },
    ],
    allowCustom: true,
  },
  {
    id: 'tone',
    prompt: 'What tone / angle should we strike?',
    kind: 'mcq',
    options: [
      { value: 'energetic', label: 'Energetic & bold' },
      { value: 'trustworthy', label: 'Trustworthy & clear' },
      { value: 'playful', label: 'Playful & fun' },
      { value: 'premium', label: 'Premium & sleek' },
      { value: 'urgent', label: 'Urgent & timely' },
    ],
    allowCustom: true,
  },
  {
    id: 'notes',
    prompt: 'Anything else the team should know?',
    helper: 'Optional — key dates, must-have messages, things to avoid.',
    kind: 'text',
    optional: true,
  },
]

// ── Answer shape + reducer ──────────────────────────────────────────────────────
// Answers are keyed by step id. mcq/text → string; multi → string[].
export type InterviewAnswers = Record<string, string | string[] | undefined>

export interface CampaignBrief {
  brand_id: string
  vertical: string
  goal: string
  audience: string
  region: string
  channels: string[]
  tone: string
  notes: string
}

function asString(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v.join(', ') : (v ?? '')
}
function asArray(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v.filter(Boolean)
  if (typeof v === 'string' && v.trim()) return v.split(',').map(s => s.trim()).filter(Boolean)
  return []
}

/** Reduce collected interview answers into the campaignBrief JSON. */
export function buildBrief(answers: InterviewAnswers): CampaignBrief {
  return {
    brand_id: asString(answers.brand),
    vertical: asString(answers.vertical),
    goal: asString(answers.goal),
    audience: asString(answers.audience),
    region: asString(answers.region),
    channels: asArray(answers.channels),
    tone: asString(answers.tone),
    notes: asString(answers.notes),
  }
}

/** True when every required step has a usable answer. */
export function isComplete(answers: InterviewAnswers): boolean {
  return INTERVIEW.every(step => {
    if (step.optional) return true
    const v = answers[step.id]
    return Array.isArray(v) ? v.length > 0 : !!(v && v.trim())
  })
}
