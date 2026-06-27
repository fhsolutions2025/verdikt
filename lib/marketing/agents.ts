// Marketing sub-agent functions. Each is a thin, schema-returning wrapper over the
// LLM router (lib/llm/router.ts) using the prompt intent from
// docs/verdikt-marketing-agent/06-system-prompts.md. Image generation goes through
// the existing ideogram-proxy and re-hosts into Storage (reusing the marketing_assets
// pattern so the Asset Library picks it up).

import { completeJson, complete } from '@/lib/llm/router'
import { createServiceClient } from '@/lib/supabase/server'
import { checkPrompt } from '@/lib/promptGuard'

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

export async function buildImagePrompt(brand: BrandCtx, briefText: string): Promise<ImagePromptOut> {
  const system = `${GLOBAL_PREAMBLE}
Role: Image Generation Agent. ${brandLine(brand)}
Write ONE vivid, concrete, IP-SAFE image prompt (no real logos, teams, named people, or flags),
on-brand and abstract. Return STRICT JSON: {"prompt":"","aspect":"ASPECT_16_9","alt_text":"","seo_tags":[]}`
  const { data, raw } = await completeJson<ImagePromptOut>({ task: 'image_prompt', system, messages: [{ role: 'user', content: `Creative brief: ${briefText}` }] })
  const out = data ?? { prompt: raw.slice(0, 300), aspect: 'ASPECT_16_9', alt_text: briefText.slice(0, 80), seo_tags: [] }
  if (!out.aspect) out.aspect = 'ASPECT_16_9'
  return out
}

export interface GeneratedImage { url: string; seed: number | null; prompt: string; alt_text: string; seo_tags: string[]; storage_path?: string }

// Generate via ideogram-proxy, then re-host into the marketing-media bucket and
// record a marketing_assets row (so the Asset Library shows it). Returns the
// public URL. IP guard runs before the provider call.
export async function generateImage(brand: BrandCtx, briefText: string, campaignId: string): Promise<GeneratedImage> {
  const spec = await buildImagePrompt(brand, briefText)

  const guard = checkPrompt(spec.prompt)
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
