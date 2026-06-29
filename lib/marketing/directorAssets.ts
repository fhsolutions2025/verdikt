// Derives the Campaign Director's planned asset set from the three sub-agent
// outputs. Pure (no IO) so it can be unit-reasoned and reused by the route.
//
// Output is a flat list of asset specs; the route inserts one mkt_agent_tasks row
// per spec (status 'pending') so the grid shows the full set immediately, then
// generates non-video assets, flipping each task pending→running→succeeded.

import type { CampaignBrief } from '@/lib/marketing/directorInterview'
import type { CopywriterOut, PromptOptimizerOut } from '@/lib/marketing/agents'

export type PlannedAssetType = 'image' | 'video' | 'carousel' | 'copy'

export interface PlannedAsset {
  type: PlannedAssetType
  channel: string | null
  label: string          // grid card title, e.g. "Image / Feature"
  dims: string           // e.g. "1080x1080"
  prompt?: string        // for image/video/carousel generation
  text?: string          // for copy (already written by the copywriter)
}

const DIMS: Record<PlannedAssetType, string> = {
  image: '1080x1080', video: '1080x1920', carousel: '1080x1080', copy: 'Text',
}

// Per-channel display names so every asset card is labelled by its channel
// (spec §5 — "Instagram Posts, Facebook Posts, LinkedIn Posts, X Posts…").
const CHANNEL_LABEL: Record<string, string> = {
  instagram: 'Instagram', x: 'X', twitter: 'X', facebook: 'Facebook', tiktok: 'TikTok',
  youtube: 'YouTube', linkedin: 'LinkedIn', blog: 'Blog', email: 'Email',
}
function chanLabel(c: string | null): string {
  const v = (c ?? '').toLowerCase()
  return CHANNEL_LABEL[v] ?? titleCase(c ?? 'Channel')
}
function titleCase(s: string): string {
  return (s || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim()
}

// §6.5 channel-native deliverables: each channel emits only its real asset types — no
// "YouTube Copy". Copy is a deliverable only where text IS the unit (X/LinkedIn posts,
// Blog article, Email); visual channels emit image/carousel/video.
const CHANNEL_DELIVERABLES: Record<string, { type: PlannedAssetType; kind: string }[]> = {
  instagram: [{ type: 'image', kind: 'Post' }, { type: 'carousel', kind: 'Carousel' }, { type: 'video', kind: 'Reel' }],
  facebook:  [{ type: 'image', kind: 'Post' }],
  x:         [{ type: 'copy', kind: 'Post' }],
  twitter:   [{ type: 'copy', kind: 'Post' }],
  linkedin:  [{ type: 'copy', kind: 'Post' }, { type: 'image', kind: 'Image' }],
  tiktok:    [{ type: 'video', kind: 'Short' }],
  youtube:   [{ type: 'video', kind: 'Video' }],
  blog:      [{ type: 'copy', kind: 'Article' }],
  email:     [{ type: 'copy', kind: 'Email' }],
}
const DEFAULT_DELIVERABLES: { type: PlannedAssetType; kind: string }[] = [
  { type: 'image', kind: 'Post' }, { type: 'copy', kind: 'Post' },
]
const MAX_AUTO_IMAGES = 4 // bound auto image-generation spend across channels

// Build the campaign's coordinated asset set: for each selected channel, emit that
// channel's native deliverables, labelled "<Channel> · <Kind>" (e.g. "YouTube · Video",
// "Instagram · Carousel", "Blog · Article", "Email · Email"). Copy assets are
// channel-adapted by the copy pipeline at generation time.
export function derivePlannedAssets(
  brief: CampaignBrief, copy: CopywriterOut | null, prompts: PromptOptimizerOut | null,
): PlannedAsset[] {
  const channels = (brief.channels.length ? brief.channels : ['instagram']).slice(0, 6)
  const pr = prompts?.prompts ?? []
  const variants = copy?.copy_variants ?? []
  const assets: PlannedAsset[] = []
  let prIdx = 0, varIdx = 0, imgCount = 0

  for (const ch of channels) {
    const dels = CHANNEL_DELIVERABLES[ch.toLowerCase()] ?? DEFAULT_DELIVERABLES
    for (const d of dels) {
      const label = `${chanLabel(ch)} · ${d.kind}`
      if (d.type === 'copy') {
        const v = variants[varIdx++ % Math.max(variants.length, 1)]
        assets.push({ type: 'copy', channel: ch, label, dims: DIMS.copy, text: v ? [v.body, v.cta].filter(Boolean).join('\n\n') : brief.goal })
      } else if (d.type === 'video') {
        const p = pr[prIdx++ % Math.max(pr.length, 1)]
        assets.push({ type: 'video', channel: ch, label, dims: DIMS.video, prompt: p?.prompt ?? brief.goal })
      } else {
        if (imgCount >= MAX_AUTO_IMAGES) continue // cap auto image/carousel spend
        imgCount++
        const p = pr[prIdx++ % Math.max(pr.length, 1)]
        assets.push({ type: d.type, channel: ch, label, dims: DIMS[d.type], prompt: p?.prompt ?? brief.goal })
      }
    }
  }

  // Guarantee at least one image + one copy so the grid is never empty.
  if (!assets.some(a => a.type === 'image')) assets.unshift({ type: 'image', channel: channels[0], label: `${chanLabel(channels[0])} · Image`, dims: DIMS.image, prompt: brief.goal })
  if (!assets.some(a => a.type === 'copy')) assets.push({ type: 'copy', channel: channels[0], label: `${chanLabel(channels[0])} · Copy`, dims: DIMS.copy, text: brief.goal })

  return assets
}
