// Derives the Campaign Director's planned asset set from the three sub-agent
// outputs. Pure (no IO) so it can be unit-reasoned and reused by the route.
//
// Output is a flat list of asset specs; the route inserts one mkt_agent_tasks row
// per spec (status 'pending') so the grid shows the full set immediately, then
// generates non-video assets, flipping each task pending→running→succeeded.

import type { CampaignBrief } from '@/lib/marketing/directorInterview'
import type { CopywriterOut, PromptOptimizerOut, RouterOut } from '@/lib/marketing/agents'

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

function titleCase(s: string): string {
  return (s || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim()
}

export function derivePlannedAssets(
  brief: CampaignBrief, copy: CopywriterOut | null, prompts: PromptOptimizerOut | null, router: RouterOut | null,
): PlannedAsset[] {
  const channels = brief.channels.length ? brief.channels : ['instagram']
  const pr = prompts?.prompts ?? []
  const variants = copy?.copy_variants ?? []
  const assets: PlannedAsset[] = []

  // Images — up to 3 from the optimized prompts.
  pr.slice(0, 3).forEach((p, i) => assets.push({
    type: 'image', channel: channels[i % channels.length],
    label: `Image / ${titleCase(p.idea || 'Feature')}`.slice(0, 40), dims: DIMS.image, prompt: p.prompt,
  }))

  // Carousel — one slide set built off the first available visual idea.
  if (pr[0]) assets.push({
    type: 'carousel', channel: channels[0], label: 'Carousel / Slides', dims: DIMS.carousel, prompt: pr[0].prompt,
  })

  // Copy — up to 2 ready-written variants from the copywriter.
  variants.slice(0, 2).forEach(v => assets.push({
    type: 'copy', channel: 'blog', label: `Ad Copy / ${titleCase(v.angle || 'Headline')}`.slice(0, 40),
    dims: DIMS.copy, text: [v.body, v.cta].filter(Boolean).join('\n\n'),
  }))

  // Videos — up to 2 from the prompts (generate-on-click; left queued).
  pr.slice(0, 2).forEach((p, i) => assets.push({
    type: 'video', channel: i === 0 ? 'youtube' : (channels[i % channels.length] || 'instagram'),
    label: i === 0 ? 'Video / Hero Ad' : 'Video / Teaser', dims: DIMS.video, prompt: p.prompt,
  }))

  // Always guarantee at least one of each visual so the grid is never empty.
  if (!assets.some(a => a.type === 'image')) assets.unshift({ type: 'image', channel: channels[0], label: 'Image / Feature', dims: DIMS.image, prompt: brief.goal })
  if (!assets.some(a => a.type === 'copy')) assets.push({ type: 'copy', channel: 'blog', label: 'Ad Copy / Headline', dims: DIMS.copy, text: brief.goal })

  return assets
}
