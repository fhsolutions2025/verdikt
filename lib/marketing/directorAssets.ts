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
// Channels that read as visual placements (image/carousel/video) vs text-first.
const VISUAL_CHANNELS = new Set(['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin', 'x', 'twitter'])

function titleCase(s: string): string {
  return (s || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim()
}

// Build one coordinated, per-channel asset set from the brief + sub-agent outputs.
// Every selected channel gets channel-labelled copy; visual channels also get an
// image; the first visual channel anchors a carousel + hero video. Caps keep spend
// bounded while honoring "one prompt → many channel-specific deliverables".
export function derivePlannedAssets(
  brief: CampaignBrief, copy: CopywriterOut | null, prompts: PromptOptimizerOut | null,
): PlannedAsset[] {
  const channels = (brief.channels.length ? brief.channels : ['instagram']).slice(0, 6)
  const pr = prompts?.prompts ?? []
  const variants = copy?.copy_variants ?? []
  const assets: PlannedAsset[] = []

  // Copy — one channel-adapted post per selected channel (the copy pipeline rewrites
  // per channel at generation time; the seeded text is a starting variant).
  channels.forEach((ch, i) => {
    const v = variants[i % Math.max(variants.length, 1)]
    assets.push({
      type: 'copy', channel: ch, label: `${chanLabel(ch)} · Copy`,
      dims: DIMS.copy, text: v ? [v.body, v.cta].filter(Boolean).join('\n\n') : brief.goal,
    })
  })

  // Images — one per visual channel (up to 3), each tied to an optimized prompt.
  const visualChannels = channels.filter(ch => VISUAL_CHANNELS.has(ch.toLowerCase()))
  ;(visualChannels.length ? visualChannels : channels).slice(0, 3).forEach((ch, i) => {
    const p = pr[i % Math.max(pr.length, 1)]
    assets.push({
      type: 'image', channel: ch, label: `${chanLabel(ch)} · Image`,
      dims: DIMS.image, prompt: p?.prompt ?? brief.goal,
    })
  })

  // Carousel — one slide set on the first visual channel.
  const carouselCh = visualChannels[0] ?? channels[0]
  if (pr[0]) assets.push({
    type: 'carousel', channel: carouselCh, label: `${chanLabel(carouselCh)} · Carousel`,
    dims: DIMS.carousel, prompt: pr[0].prompt,
  })

  // Videos — a hero (YouTube/first video channel) + a teaser (next channel); queued.
  const videoChannels = channels.filter(ch => VISUAL_CHANNELS.has(ch.toLowerCase()))
  const heroCh = videoChannels.find(c => c.toLowerCase() === 'youtube') ?? videoChannels[0] ?? channels[0]
  pr.slice(0, 2).forEach((p, i) => {
    const ch = i === 0 ? heroCh : (videoChannels[1] ?? heroCh)
    assets.push({
      type: 'video', channel: ch, label: `${chanLabel(ch)} · ${i === 0 ? 'Hero Video' : 'Teaser'}`,
      dims: DIMS.video, prompt: p.prompt,
    })
  })

  // Guarantee at least one image + one copy so the grid is never empty.
  if (!assets.some(a => a.type === 'image')) assets.unshift({ type: 'image', channel: channels[0], label: `${chanLabel(channels[0])} · Image`, dims: DIMS.image, prompt: brief.goal })
  if (!assets.some(a => a.type === 'copy')) assets.push({ type: 'copy', channel: channels[0], label: `${chanLabel(channels[0])} · Copy`, dims: DIMS.copy, text: brief.goal })

  return assets
}
