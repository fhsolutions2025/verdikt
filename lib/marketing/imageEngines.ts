// Image engine routing + automatic variations (VERDIKT Marketing Studio § Image
// Generation & Creative Studio).
//
// Routing (cost-optimized per spec): fal.ai (FLUX) handles the majority; Ideogram is
// used only when typography/text quality materially affects output; OpenAI gpt-image
// for precise compositions. The router sub-agent's chosen model id is honored when
// given. "Every important image generates multiple concepts" — generateImageVariations
// produces several distinct style directions to compare before approval.

import { createServiceClient } from '@/lib/supabase/server'
import { checkPrompt } from '@/lib/promptGuard'
import type { BrandCtx, ImageContext } from '@/lib/marketing/agents'
import { contextCues } from '@/lib/marketing/agents'

type Svc = Awaited<ReturnType<typeof createServiceClient>>

export type ImageEngine = 'fal' | 'ideogram' | 'openai'

const TYPOGRAPHY_HINTS = /\b(text|headline|title|poster|banner|typograph|word|caption|slogan|logo|lettering|quote)\b/i

// Map a router model id (or explicit request) to an engine; otherwise pick by intent.
export function selectEngine(prompt: string, requested?: string | null): ImageEngine {
  const r = (requested ?? '').toLowerCase()
  if (r.includes('ideogram')) return 'ideogram'
  if (r.includes('openai') || r.includes('gpt-image') || r.includes('dall')) return 'openai'
  if (r.includes('flux') || r.includes('fal')) return 'fal'
  // No explicit engine — typography-heavy → Ideogram, else the cheap default (fal).
  return TYPOGRAPHY_HINTS.test(prompt) ? 'ideogram' : 'fal'
}

function openaiSize(aspect?: string): string {
  switch (aspect) {
    case 'ASPECT_16_9': case 'ASPECT_16_10': return '1536x1024'
    case 'ASPECT_9_16': case 'ASPECT_10_16': return '1024x1536'
    default: return '1024x1024'
  }
}
function falImageSize(aspect?: string): string {
  switch (aspect) {
    case 'ASPECT_16_9': case 'ASPECT_16_10': return 'landscape_16_9'
    case 'ASPECT_9_16': case 'ASPECT_10_16': return 'portrait_16_9'
    case 'ASPECT_4_3':  case 'ASPECT_3_2':   return 'landscape_4_3'
    case 'ASPECT_3_4':  case 'ASPECT_2_3':   return 'portrait_4_3'
    default: return 'square_hd'
  }
}
const ENGINE_COST: Record<ImageEngine, number> = { fal: 0.01, ideogram: 0.08, openai: 0.04 }

function proxyConfig(): { baseUrl: string; key: string } {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!baseUrl || !key) throw new Error('Image generation not configured')
  return { baseUrl, key }
}

export interface GeneratedImage { url: string; engine: ImageEngine; seed: number | null; prompt: string }

// Generate one image with a specific engine, re-host into Storage, and record a
// marketing_assets row so the Asset Library surfaces it. IP guard runs first.
export async function generateWithEngine(
  svc: Svc, brand: BrandCtx, prompt: string,
  opts: { engine: ImageEngine; aspect?: string; campaignId: string; altText?: string; seoTags?: string[] },
): Promise<GeneratedImage> {
  const guard = checkPrompt(prompt)
  if (!guard.ok) throw new Error(`Image prompt blocked by IP guard: ${guard.reason}`)
  const { baseUrl, key } = proxyConfig()
  const aspect = opts.aspect ?? 'ASPECT_16_9'
  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }

  let tempUrl: string | undefined
  let b64: string | undefined
  let seed: number | null = null

  if (opts.engine === 'fal') {
    const res = await fetch(`${baseUrl}/functions/v1/fal-proxy`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ op: 'image', prompt, image_size: falImageSize(aspect) }),
      signal: AbortSignal.timeout(95_000),
    })
    const d = await res.json()
    if (!res.ok || d.error || !d.url) throw new Error(d.error ?? `fal image error ${res.status}`)
    tempUrl = d.url as string
  } else if (opts.engine === 'openai') {
    const res = await fetch(`${baseUrl}/functions/v1/openai-image-proxy`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ prompt, model: 'gpt-image-1', size: openaiSize(aspect) }),
      signal: AbortSignal.timeout(95_000),
    })
    const d = await res.json()
    if (!res.ok || d.error) throw new Error(d.error?.message ?? d.error ?? `openai image error ${res.status}`)
    const item = d.data?.[0] ?? {}
    tempUrl = item.url
    b64 = item.b64_json
  } else {
    const res = await fetch(`${baseUrl}/functions/v1/ideogram-proxy`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ prompt, style: 'DESIGN', aspect_ratio: aspect }),
      signal: AbortSignal.timeout(60_000),
    })
    const d = await res.json()
    if (!res.ok || !d.url) throw new Error(d.error ?? `ideogram error ${res.status}`)
    tempUrl = d.url as string
    seed = d.seed ?? null
  }

  // Re-host (provider URLs are temporary; openai may return base64).
  let publicUrl = tempUrl ?? ''
  let storagePath: string | undefined
  try {
    let bytes: ArrayBuffer
    let contentType = 'image/png'
    if (b64) {
      bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer
    } else if (tempUrl) {
      const imgRes = await fetch(tempUrl, { signal: AbortSignal.timeout(30_000) })
      contentType = imgRes.headers.get('content-type') ?? 'image/png'
      bytes = await imgRes.arrayBuffer()
    } else {
      throw new Error('no image returned')
    }
    const ext = contentType.includes('jpeg') ? 'jpg' : contentType.includes('webp') ? 'webp' : 'png'
    const path = `campaign/${opts.campaignId}/${opts.engine}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const up = await svc.storage.from('marketing-media').upload(path, bytes, { contentType, upsert: false })
    if (!up.error) {
      publicUrl = svc.storage.from('marketing-media').getPublicUrl(path).data.publicUrl
      storagePath = path
      await svc.from('marketing_assets').insert({
        storage_path: path, public_url: publicUrl, title: (opts.altText ?? prompt).slice(0, 60),
        alt_text: opts.altText ?? '', keywords: opts.seoTags ?? [], platform: 'campaign',
        dimensions: '', aspect_ratio: aspect, style: opts.engine, prompt,
        campaign_tag: opts.campaignId, seed, cost_usd: ENGINE_COST[opts.engine],
      })
    }
  } catch {
    if (!publicUrl) throw new Error('image re-host failed')
  }
  void storagePath
  return { url: publicUrl, engine: opts.engine, seed, prompt }
}

// ── Automatic variations ──────────────────────────────────────────────────────
export interface VariationStyle { key: string; label: string; cue: string }

export const IMAGE_VARIATION_STYLES: VariationStyle[] = [
  { key: 'minimal',     label: 'Minimal',         cue: 'clean minimal composition, lots of negative space, restrained palette' },
  { key: 'bold',        label: 'Bold',            cue: 'bold high-contrast composition, vivid saturated color, dynamic energy' },
  { key: 'premium',     label: 'Premium',         cue: 'premium editorial look, refined lighting, sophisticated palette' },
  { key: 'luxury',      label: 'Luxury',          cue: 'luxury aesthetic, elegant textures, deep tones, aspirational mood' },
  { key: 'conversion',  label: 'High Conversion', cue: 'conversion-focused layout, clear focal point, strong visual hierarchy' },
]

export const DEFAULT_VARIATION_COUNT = 3

export interface ImageVariation { style: string; label: string; url: string; engine: ImageEngine }

// Generate N distinct style concepts for one image asset, routed to the chosen (or
// auto-selected) engine. Failures per-variation are skipped so a partial set still
// returns. The campaign cues keep every variation on-topic and IP-safe.
export async function generateImageVariations(
  svc: Svc, brand: BrandCtx, basePrompt: string,
  opts: { campaignId: string; engine?: ImageEngine; requestedModel?: string | null; aspect?: string; context?: ImageContext; count?: number; altText?: string },
): Promise<ImageVariation[]> {
  const cues = contextCues(opts.context)
  const count = Math.max(1, Math.min(opts.count ?? DEFAULT_VARIATION_COUNT, IMAGE_VARIATION_STYLES.length))
  const styles = IMAGE_VARIATION_STYLES.slice(0, count)
  const engine = opts.engine ?? selectEngine(basePrompt, opts.requestedModel)

  const results = await Promise.allSettled(styles.map(async (s) => {
    const merged = [basePrompt.trim(), s.cue, cues].filter(Boolean).join('. ')
    const img = await generateWithEngine(svc, brand, merged, {
      engine, aspect: opts.aspect, campaignId: opts.campaignId, altText: opts.altText,
    })
    return { style: s.key, label: s.label, url: img.url, engine: img.engine }
  }))

  return results
    .filter((r): r is PromiseFulfilledResult<ImageVariation> => r.status === 'fulfilled')
    .map(r => r.value)
}
