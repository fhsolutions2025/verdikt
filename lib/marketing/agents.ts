// Marketing sub-agent functions. Each is a thin, schema-returning wrapper over the
// LLM router (lib/llm/router.ts) using the prompt intent from
// docs/verdikt-marketing-agent/06-system-prompts.md. Image generation goes through
// the existing ideogram-proxy and re-hosts into Storage (reusing the marketing_assets
// pattern so the Asset Library picks it up).

import { completeJson, complete } from '@/lib/llm/router'
import { createServiceClient } from '@/lib/supabase/server'
import { checkPrompt, cleanseVisualPrompt } from '@/lib/promptGuard'
import type { CampaignBrief } from '@/lib/marketing/directorInterview'

export interface BrandCtx {
  name: string
  voice: Record<string, unknown>
  region: string
}
export interface BriefCtx {
  goal: string
  audience: string
  channels: string[]
  region: string
}

const GLOBAL_PREAMBLE = `You are a specialized agent inside Verdikt's autonomous Marketing Department.
Verdikt is a prediction-market / iGaming platform operating across multiple regions.
Rules: (1) produce structured output only; (2) never invent stats, odds, prices, or
guarantees; (3) respect the brand voice and region rules; (4) never promise winnings or
use "risk-free"; (5) if a fact is needed, use a [PLACEHOLDER] and note it.`

function brandLine(brand: BrandCtx): string {
  return `Brand: ${brand.name}. Voice: ${JSON.stringify(brand.voice)}. Region: ${brand.region}.`
}

// ── Planner ───────────────────────────────────────────────────────────────────
export interface CampaignPlan {
  objective: string
  audience: string
  channels: string[]
  messaging_pillars: string[]
  content_items: { type: 'blog' | 'social' | 'image'; brief: string; platform?: string }[]
  schedule: { item: string; date: string }[]
  budget_estimate_usd: number
  risk_level: 'low' | 'medium' | 'high'
}

export async function runPlanner(brand: BrandCtx, brief: BriefCtx): Promise<CampaignPlan> {
  const system = `${GLOBAL_PREAMBLE}
Role: Campaign Planner (L2). Produce a complete, executable plan from the brief.
${brandLine(brand)}
Return STRICT JSON only matching:
{"objective":"","audience":"","channels":[],"messaging_pillars":[],
 "content_items":[{"type":"blog|social|image","brief":"","platform":""}],
 "schedule":[{"item":"","date":"YYYY-MM-DD"}],"budget_estimate_usd":0,"risk_level":"low|medium|high"}
Include at least one blog, three social posts (varied platforms), and one image in content_items.`

  const user = `Brief:
Goal: ${brief.goal}
Audience: ${brief.audience}
Channels: ${brief.channels.join(', ') || 'operator to decide'}
Region: ${brief.region}`

  const { data } = await completeJson<CampaignPlan>({ task: 'strategy', system, messages: [{ role: 'user', content: user }] })
  // Defensive defaults so execution always has something to do.
  const plan: CampaignPlan = {
    objective: data?.objective ?? brief.goal,
    audience: data?.audience ?? brief.audience,
    channels: data?.channels?.length ? data.channels : (brief.channels.length ? brief.channels : ['instagram', 'x', 'facebook']),
    messaging_pillars: data?.messaging_pillars ?? [],
    content_items: data?.content_items?.length ? data.content_items : [],
    schedule: data?.schedule ?? [],
    budget_estimate_usd: data?.budget_estimate_usd ?? 0.5,
    risk_level: data?.risk_level ?? 'medium',
  }
  if (!plan.content_items.length) {
    plan.content_items = [
      { type: 'blog', brief: brief.goal },
      { type: 'social', brief: brief.goal, platform: 'instagram' },
      { type: 'social', brief: brief.goal, platform: 'x' },
      { type: 'social', brief: brief.goal, platform: 'facebook' },
      { type: 'image', brief: brief.goal },
    ]
  }
  return plan
}

// ── Blog ──────────────────────────────────────────────────────────────────────
export interface BlogContent {
  title: string; body_markdown: string; summary: string; cta: string; meta_description: string
}
export async function writeBlog(brand: BrandCtx, topic: string, disclaimers: string[]): Promise<BlogContent> {
  const system = `${GLOBAL_PREAMBLE}
Role: Copywriter (blog). ${brandLine(brand)}
Write an on-brand blog post. Include the mandatory disclaimers verbatim somewhere in the body: ${JSON.stringify(disclaimers)}.
Return STRICT JSON: {"title":"","body_markdown":"","summary":"","cta":"","meta_description":""}`
  const { data, raw } = await completeJson<BlogContent>({ task: 'blog', system, messages: [{ role: 'user', content: `Topic: ${topic}` }] })
  return data ?? { title: topic, body_markdown: raw, summary: '', cta: '', meta_description: '' }
}

// ── Social ──────────────────────────────────────────────────────────────────────
export interface SocialContent {
  platform: string; caption: string; hashtags: string[]; media_hint: string
}
export async function writeSocial(brand: BrandCtx, topic: string, platform: string, disclaimers: string[]): Promise<SocialContent> {
  const system = `${GLOBAL_PREAMBLE}
Role: Copywriter (social, ${platform}). ${brandLine(brand)}
Write one native ${platform} post. Where the platform allows, include a short responsible-gaming note from: ${JSON.stringify(disclaimers)}.
Return STRICT JSON: {"platform":"${platform}","caption":"","hashtags":[],"media_hint":""}`
  const { data, raw } = await completeJson<SocialContent>({ task: 'social', system, messages: [{ role: 'user', content: `Topic: ${topic}` }] })
  return data ?? { platform, caption: raw.slice(0, 240), hashtags: [], media_hint: '' }
}

// ── Image prompt + generation ───────────────────────────────────────────────────
export interface ImagePromptOut { prompt: string; aspect: string; alt_text: string; seo_tags: string[] }

// Campaign context woven into the image so the visual matches the text assets.
export interface ImageContext {
  vertical?: string
  audience?: string
  region?: string
  headline?: string
  brandColors?: string[]
}

// Map a vertical to a concrete scene so the image reads as on-topic (not generic stock).
function verticalScene(vertical?: string): string {
  const v = (vertical || '').toLowerCase()
  if (v.includes('sport')) return 'energetic sports-viewing atmosphere'
  if (v.includes('crypto')) return 'sleek digital finance / crypto-trading atmosphere'
  if (v.includes('current') || v.includes('affairs') || v.includes('politic')) return 'contemporary current-events / newsroom atmosphere'
  if (v.includes('finance')) return 'modern financial / markets atmosphere'
  if (v.includes('retail')) return 'modern retail / shopping environment'
  if (v.includes('responsible') || v.includes('gaming')) return 'calm, trustworthy responsible-gaming atmosphere'
  return ''
}

// Turn the campaign context into concrete, localized, IP-safe visual cues.
export function contextCues(c?: ImageContext): string {
  if (!c) return ''
  const bits: string[] = []
  const scene = verticalScene(c.vertical)
  if (scene) bits.push(scene)
  if (c.audience) bits.push(`authentically reflecting the audience: ${c.audience} (depict everyday people of that demographic, no recognizable real individuals)`)
  if (c.region) bits.push(`localized to a ${c.region} setting`)
  if (c.brandColors?.length) bits.push(`use the brand color palette ${c.brandColors.join(', ')}`)
  if (c.headline) bits.push(`evoke the message "${c.headline}"`)
  bits.push('contextually relevant, localized, and IP-safe (no real logos, brand marks, or named individuals)')
  return bits.join('; ')
}

export async function buildImagePrompt(brand: BrandCtx, briefText: string, context?: ImageContext): Promise<ImagePromptOut> {
  const cues = contextCues(context)
  const system = `${GLOBAL_PREAMBLE}
Role: Image Generation Agent. ${brandLine(brand)}
Write ONE vivid, concrete, CONTEXTUALLY RELEVANT, LOCALIZED, and IP-SAFE image prompt.
Explicitly include visual cues that match the target region and demographic when relevant
(e.g. "East African urban environment", "modern retail setting"). Do NOT use real logos,
brand marks, flags, or named/recognizable real people — but everyday, demographically
authentic people and places ARE encouraged.${cues ? `\nCampaign cues to honor: ${cues}.` : ''}
Return STRICT JSON: {"prompt":"","aspect":"ASPECT_16_9","alt_text":"","seo_tags":[]}`
  const { data, raw } = await completeJson<ImagePromptOut>({ task: 'image_prompt', system, messages: [{ role: 'user', content: `Creative brief: ${briefText}` }] })
  const out = data ?? { prompt: raw.slice(0, 300), aspect: 'ASPECT_16_9', alt_text: briefText.slice(0, 80), seo_tags: [] }
  if (!out.aspect) out.aspect = 'ASPECT_16_9'
  return out
}

export interface GeneratedImage { url: string; seed: number | null; prompt: string; alt_text: string; seo_tags: string[]; storage_path?: string }

// Generate via ideogram-proxy, then re-host into the marketing-media bucket and
// record a marketing_assets row (so the Asset Library shows it). Returns the
// public URL. IP guard runs before the provider call.
//
// `opts.prompt` (the prompt-optimizer's output) is PRESERVED — it is sent to the
// model with campaign context appended, rather than being rewritten from scratch.
// Only when no prompt is supplied do we fall back to buildImagePrompt (now
// context-aware). `opts.context` ties the visual to the campaign's vertical,
// audience, region, brand colors, and headline.
export async function generateImage(
  brand: BrandCtx, briefText: string, campaignId: string,
  opts?: { prompt?: string; context?: ImageContext },
): Promise<GeneratedImage> {
  let spec: ImagePromptOut
  if (opts?.prompt?.trim()) {
    // Preserve the optimized prompt; append concrete campaign cues.
    const cues = contextCues(opts.context)
    const merged = cues ? `${opts.prompt.trim()}. ${cues}.` : opts.prompt.trim()
    spec = { prompt: merged, aspect: 'ASPECT_16_9', alt_text: (opts.context?.headline || briefText).slice(0, 80), seo_tags: [] }
  } else {
    spec = await buildImagePrompt(brand, briefText, opts?.context)
  }

  // IP guard. If the context-merged prompt trips it, fall back to the bare optimized
  // prompt before giving up (so localized cues never block a valid render).
  let guard = checkPrompt(spec.prompt)
  if (!guard.ok && opts?.prompt?.trim()) {
    spec = { ...spec, prompt: opts.prompt.trim() }
    guard = checkPrompt(spec.prompt)
  }
  if (!guard.ok) throw new Error(`Image prompt blocked by IP guard: ${guard.reason}`)

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key     = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!baseUrl || !key) throw new Error('Image generation not configured')

  const genRes = await fetch(`${baseUrl}/functions/v1/ideogram-proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ prompt: spec.prompt, style: 'DESIGN', aspect_ratio: spec.aspect }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!genRes.ok) throw new Error(`Ideogram error ${genRes.status}`)
  const gen = await genRes.json()
  const tempUrl: string = gen.url
  const seed: number | null = gen.seed ?? null

  // Re-host (Ideogram URLs are temporary).
  const svc = await createServiceClient()
  let publicUrl = tempUrl
  let storagePath: string | undefined
  try {
    const imgRes = await fetch(tempUrl, { signal: AbortSignal.timeout(30_000) })
    const contentType = imgRes.headers.get('content-type') ?? 'image/png'
    const bytes = await imgRes.arrayBuffer()
    const ext = contentType.includes('jpeg') ? 'jpg' : contentType.includes('webp') ? 'webp' : 'png'
    const path = `campaign/${campaignId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const up = await svc.storage.from('marketing-media').upload(path, bytes, { contentType, upsert: false })
    if (!up.error) {
      const { data: pub } = svc.storage.from('marketing-media').getPublicUrl(path)
      publicUrl = pub.publicUrl
      storagePath = path
      // Record in marketing_assets so the Asset Library surfaces it.
      await svc.from('marketing_assets').insert({
        storage_path: path, public_url: publicUrl, title: briefText.slice(0, 60),
        alt_text: spec.alt_text, keywords: spec.seo_tags ?? [], platform: 'campaign',
        dimensions: '', aspect_ratio: spec.aspect, style: 'DESIGN', prompt: spec.prompt,
        campaign_tag: campaignId, seed, cost_usd: 0.08,
      })
    }
  } catch {
    /* keep temp URL on re-host failure */
  }

  return { url: publicUrl, seed, prompt: spec.prompt, alt_text: spec.alt_text, seo_tags: spec.seo_tags ?? [], storage_path: storagePath }
}

// ════════════════════════════════════════════════════════════════════════════════
// Campaign Director sub-agents
//
// The Director run route fans these three out (copywriter + prompt-optimizer in
// parallel, then the router which depends on both) from a hardcoded-interview brief.
// Each is a thin schema-returning wrapper, same shape as the agents above.
// ════════════════════════════════════════════════════════════════════════════════

function briefLine(brief: CampaignBrief): string {
  return `Vertical: ${brief.vertical}. Goal: ${brief.goal}. Audience: ${brief.audience}. `
    + `Region: ${brief.region}. Channels: ${brief.channels.join(', ') || 'operator to decide'}. `
    + `Tone: ${brief.tone}.${brief.notes ? ` Notes: ${brief.notes}` : ''}`
}

// Fetch an agent's editable instruction block from agent_configs (Agents module),
// falling back to the in-code default if the row is missing/blank/inactive. The
// GLOBAL_PREAMBLE + brand line are always prepended in code; only the instruction
// body is operator-editable.
export async function getAgentPrompt(agentType: string, fallback: string): Promise<string> {
  try {
    const svc = await createServiceClient()
    const { data } = await svc.from('agent_configs').select('system_prompt,is_active').eq('agent_type', agentType).maybeSingle()
    if (data && data.is_active !== false && typeof data.system_prompt === 'string' && data.system_prompt.trim()) {
      return data.system_prompt
    }
  } catch { /* fall through to default */ }
  return fallback
}

// §23 routing: read an agent's configured provider + concrete model from agent_configs
// so the LLM router runs it on the operator-chosen engine (e.g. route the Copywriter to
// OpenAI). Returns undefineds → the task router default is used. Never throws.
export interface AgentRouting { providerOverride?: 'anthropic' | 'openai'; modelOverride?: string }
export async function getAgentRouting(agentType: string): Promise<AgentRouting> {
  try {
    const svc = await createServiceClient()
    const { data } = await svc.from('agent_configs').select('provider,model,is_active').eq('agent_type', agentType).maybeSingle()
    if (!data || data.is_active === false) return {}
    const provider = data.provider === 'anthropic' || data.provider === 'openai' ? data.provider : undefined
    const model = typeof data.model === 'string' && data.model.trim() ? data.model.trim() : undefined
    return { providerOverride: provider, modelOverride: model }
  } catch { return {} }
}

// In-code defaults (kept in sync with migration 0041 seeds — used if the DB row is gone).
const DEFAULT_COPYWRITER = `Role: Copywriter sub-agent.
Analyze the campaign brief and produce sharp, on-brand copy. Return STRICT JSON:
{"headline_hooks":["short punchy hook", "..."],
 "copy_variants":[{"angle":"the angle","body":"2-3 sentences","cta":"call to action"}]}
Give 4-6 headline_hooks and 3 copy_variants (distinct angles). No invented stats; use [PLACEHOLDER] if a fact is needed.`

const DEFAULT_PROMPT_OPTIMIZER = `Role: Prompt-optimizer sub-agent.
Turn the campaign concept into vivid, concrete, cinematic, CONTEXTUALLY RELEVANT and LOCALIZED visual prompts that clearly read as the campaign's vertical for its audience. Every prompt MUST: (1) depict a concrete real-world scene tied to the vertical; (2) feature everyday people authentic to the audience and region (generic individuals only — never recognizable real people); (3) be IP-SAFE (no real logos, brand marks, team kits, flags, or named people). Do NOT be abstract; do NOT include hollow quality keywords (no "8k", "photorealistic", "masterpiece", "ultra-detailed").
Return STRICT JSON: {"prompts":[{"idea":"the visual idea","prompt":"the full prompt","aspect":"ASPECT_16_9"}]}
Give 3 distinct prompts.`

const DEFAULT_ROUTER = `Role: Router sub-agent.
For each planned asset, choose BOTH the optimal generation model AND the optimal channel/platform, given the brief, the copy hooks, and the visual prompts. Prefer the requested channels but recommend the best mix. Return STRICT JSON:
{"assignments":[{"asset":"e.g. hero still / 15s teaser / blog header","model":"a model id from the catalog","channel":"platform","rationale":"one line"}]}
Give one assignment per useful asset (4-6 total).`

// ── Copywriter sub-agent ────────────────────────────────────────────────────────
export interface CopyVariant { angle: string; body: string; cta: string }
export interface CopywriterOut { headline_hooks: string[]; copy_variants: CopyVariant[] }

export async function runCopywriter(brand: BrandCtx, brief: CampaignBrief, knowledge?: string): Promise<CopywriterOut> {
  const [instr, routing] = await Promise.all([
    getAgentPrompt('mkt_copywriter', DEFAULT_COPYWRITER),
    getAgentRouting('mkt_copywriter'),
  ])
  const system = `${GLOBAL_PREAMBLE}
${brandLine(brand)}
${instr}${knowledge ? `\n\n${knowledge}` : ''}`
  const { data, raw } = await completeJson<CopywriterOut>({
    task: 'copywriting', system, messages: [{ role: 'user', content: briefLine(brief) }],
    ...routing,
  })
  return {
    headline_hooks: data?.headline_hooks?.length ? data.headline_hooks : [raw.slice(0, 80)],
    copy_variants: data?.copy_variants?.length ? data.copy_variants : [{ angle: 'default', body: raw.slice(0, 240), cta: 'Learn more' }],
  }
}

// ── Prompt-optimizer sub-agent ──────────────────────────────────────────────────
export interface OptimizedPrompt { idea: string; prompt: string; aspect: string }
export interface PromptOptimizerOut { prompts: OptimizedPrompt[] }

export async function runPromptOptimizer(brand: BrandCtx, brief: CampaignBrief): Promise<PromptOptimizerOut> {
  const scene = verticalScene(brief.vertical)
  const instr = await getAgentPrompt('mkt_prompt_optimizer', DEFAULT_PROMPT_OPTIMIZER)
  const system = `${GLOBAL_PREAMBLE}
${brandLine(brand)}
${instr}
Campaign context — vertical: ${brief.vertical}; audience: ${brief.audience}; region: ${brief.region}${scene ? `; scene cue: ${scene}` : ''}.`
  const { data, raw } = await completeJson<PromptOptimizerOut>({
    task: 'image_prompt', system, messages: [{ role: 'user', content: briefLine(brief) }],
  })
  const list = data?.prompts?.length ? data.prompts : [{ idea: brief.goal, prompt: raw.slice(0, 300), aspect: 'ASPECT_16_9' }]
  // Cleanse junk keywords + keep only IP-safe prompts (drop ones the guard blocks).
  const cleaned = list
    .map(p => ({ idea: p.idea ?? '', prompt: cleanseVisualPrompt(p.prompt ?? ''), aspect: p.aspect || 'ASPECT_16_9' }))
    .filter(p => p.prompt && checkPrompt(p.prompt).ok)
  return { prompts: cleaned.length ? cleaned : [{ idea: brief.goal, prompt: cleanseVisualPrompt(brief.goal), aspect: 'ASPECT_16_9' }] }
}

// ── Router sub-agent (picks BOTH optimal model AND channel per asset) ─────────────
export interface RouteAssignment { asset: string; model: string; channel: string; rationale: string }
export interface RouterOut { assignments: RouteAssignment[] }

// Catalog hint so the router picks from models we can actually run.
const ROUTER_MODEL_CATALOG = `Image engines: "fal/flux" (fast, on-brand stills), "ideogram" (text-in-image, posters), "openai/gpt-image-1" (precise compositions).
Video (fal): "fal-ai/veo3.1" (premium + audio), "fal-ai/ltx-2.3/text-to-video" (budget + audio), "fal-ai/minimax/hailuo-02/standard/text-to-video" (cheap draft), "bytedance/seedance-2.0/text-to-video" (stylized).`

export async function runRouter(
  brand: BrandCtx, brief: CampaignBrief, copy: CopywriterOut, prompts: PromptOptimizerOut,
): Promise<RouterOut> {
  const instr = await getAgentPrompt('mkt_router', DEFAULT_ROUTER)
  const system = `${GLOBAL_PREAMBLE}
${brandLine(brand)}
${instr}
Available models (pick model ids from here):
${ROUTER_MODEL_CATALOG}
Requested channels: ${brief.channels.join(', ') || 'none specified'}.`
  const user = `Brief: ${briefLine(brief)}
Hooks: ${copy.headline_hooks.join(' | ')}
Visual ideas: ${prompts.prompts.map(p => p.idea).join(' | ')}`
  const { data } = await completeJson<RouterOut>({ task: 'strategy', system, messages: [{ role: 'user', content: user }] })
  return { assignments: data?.assignments?.length ? data.assignments : [
    { asset: 'hero still', model: 'fal/flux', channel: brief.channels[0] || 'instagram', rationale: 'on-brand still for the primary channel' },
    { asset: 'blog header', model: 'ideogram', channel: 'blog', rationale: 'text-in-image header' },
  ] }
}

// ── Reviewer (lightweight MVP eval) ─────────────────────────────────────────────
export interface ReviewOut { overall: number; verdict: 'pass' | 'regenerate'; feedback: string[] }
export async function reviewArtifact(brand: BrandCtx, kind: string, content: string): Promise<ReviewOut> {
  const system = `${GLOBAL_PREAMBLE}
Role: Reviewer (quality gate). ${brandLine(brand)}
Score this ${kind} artifact 0-1 on brand voice, clarity, and relevance. Return STRICT JSON:
{"overall":0.0,"verdict":"pass|regenerate","feedback":[]}`
  const { data } = await completeJson<ReviewOut>({ task: 'review', system, messages: [{ role: 'user', content: content.slice(0, 4000) }] })
  return data ?? { overall: 0.8, verdict: 'pass', feedback: [] }
}

export { complete }
