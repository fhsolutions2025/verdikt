// Video production pipeline (VERDIKT Marketing Studio § Video Generation Studio).
//
// Turns a campaign brief into a platform-optimized script + storyboard before the
// clip is rendered, so the video reads as a deliberate sequence (hook → problem →
// product → benefits → proof → CTA) rather than a generic teaser. Our render engines
// are single-clip text-to-video, so the storyboard is assembled into one cinematic,
// scene-aware prompt — and the storyboard itself is stored for the Inspector.

import { completeJson } from '@/lib/llm/router'
import { getAgentPrompt, type BrandCtx } from '@/lib/marketing/agents'
import type { CampaignBrief } from '@/lib/marketing/directorInterview'

// ── Platform optimization (spec § Step 3) ─────────────────────────────────────
export interface VideoPlatformSpec { aspect: '9:16' | '16:9' | '1:1'; seconds: number }

export const VIDEO_PLATFORM_SPECS: Record<string, VideoPlatformSpec> = {
  instagram: { aspect: '9:16', seconds: 20 },
  tiktok:    { aspect: '9:16', seconds: 25 },
  youtube:   { aspect: '9:16', seconds: 40 },
  facebook:  { aspect: '1:1',  seconds: 20 },
  linkedin:  { aspect: '16:9', seconds: 30 },
  website:   { aspect: '16:9', seconds: 30 },
  blog:      { aspect: '16:9', seconds: 30 },
  email:     { aspect: '16:9', seconds: 20 },
}

export function videoPlatformSpec(channel?: string | null): VideoPlatformSpec {
  return VIDEO_PLATFORM_SPECS[(channel ?? '').toLowerCase()] ?? { aspect: '9:16', seconds: 20 }
}

// ── Storyboard (spec § Step 4–6) ──────────────────────────────────────────────
export interface StoryboardScene {
  n: number
  objective: string     // Hook | Problem | Product | Benefits | Proof | CTA
  duration: number      // seconds
  visual: string        // what is on screen
  voiceover: string     // narration line
  camera: string        // shot/camera note
  transition: string    // to the next scene
}

export interface Storyboard {
  video_type: string
  hook: string
  cta: string
  scenes: StoryboardScene[]
}

const DEFAULT_STORYBOARD_INSTR = `Role: Video Producer. Convert a campaign brief into a tight short-form video script +
storyboard. Classify the video_type. Produce 4-6 scenes following the arc
hook → problem → product → benefits → proof → CTA (use the ones that fit). Keep total
runtime within the target seconds. Never invent stats/odds/guarantees; never use
"risk-free" or promise winnings. Voiceover lines are short and spoken.`

export async function generateStoryboard(
  brand: BrandCtx, brief: CampaignBrief, channel: string | null, knowledge: string,
): Promise<Storyboard> {
  const spec = videoPlatformSpec(channel)
  const instr = await getAgentPrompt('mkt_prompt_optimizer', DEFAULT_STORYBOARD_INSTR)
  const system = `${instr}
Brand: ${brand.name}. Voice: ${JSON.stringify(brand.voice)}. Region: ${brand.region}.
Platform: ${channel ?? 'short-form'} — aspect ${spec.aspect}, target ~${spec.seconds}s total.${knowledge ? `\n\n${knowledge}` : ''}
Return STRICT JSON: {"video_type":"","hook":"","cta":"","scenes":[{"n":1,"objective":"","duration":0,"visual":"","voiceover":"","camera":"","transition":""}]}`
  const user = `Brief: goal=${brief.goal}; vertical=${brief.vertical}; audience=${brief.audience}; tone=${brief.tone}.`
  const { data } = await completeJson<Storyboard>({ task: 'strategy', system, messages: [{ role: 'user', content: user }] })
  const scenes = Array.isArray(data?.scenes) && data!.scenes.length ? data!.scenes : [
    { n: 1, objective: 'Hook', duration: 3, visual: brief.goal || 'brand hero moment', voiceover: '', camera: 'dynamic open', transition: 'cut' },
    { n: 2, objective: 'CTA', duration: 3, visual: 'call to action card', voiceover: '', camera: 'static', transition: 'end' },
  ]
  return {
    video_type: data?.video_type || 'Advertisement',
    hook: data?.hook || brief.goal || '',
    cta: data?.cta || 'Learn more',
    scenes: scenes.map((s, i) => ({
      n: typeof s.n === 'number' ? s.n : i + 1,
      objective: s.objective || `Scene ${i + 1}`,
      duration: typeof s.duration === 'number' && s.duration > 0 ? s.duration : 4,
      visual: s.visual || '', voiceover: s.voiceover || '', camera: s.camera || '', transition: s.transition || 'cut',
    })),
  }
}

// Assemble the storyboard into a single cinematic text-to-video prompt: an ordered
// shot list the model can follow as one continuous clip. `cues` carries the campaign
// localization/IP-safety context already used by the image pipeline.
export function storyboardToVideoPrompt(sb: Storyboard, cues: string): string {
  const shots = sb.scenes
    .map(s => `Scene ${s.n} (${s.objective}, ~${s.duration}s): ${s.visual}${s.camera ? `, ${s.camera}` : ''}`)
    .join('. ')
  const base = `${sb.video_type} short video. Hook: ${sb.hook}. ${shots}. Close on CTA: ${sb.cta}.`
  return cues ? `${base} ${cues}.` : base
}
