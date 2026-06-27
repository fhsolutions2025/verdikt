// fal.ai video model registry.
//
// One place to define which fal video models the Media Studio offers, their
// capabilities, allowed output options, cost, and how UI params map to each
// model's fal `input` shape. The /video route resolves a model by id and calls
// buildInput(...) before submitting to the fal-proxy.
//
// NOTE: fal model IDs and per-model input field names change over time and can't
// be verified from this container (egress). If a generation fails, adjust the
// `id` / `i2vId` / buildInput mapping here — it's the single source of truth.

export interface FalVideoParams {
  prompt:     string
  startUrl?:  string   // start frame (image-to-video)
  endUrl?:    string   // end frame (interpolate start→end)
  aspect?:    string   // e.g. '16:9'
  duration?:  number   // seconds
  resolution?: string  // e.g. '720p'
  audio?:     boolean
}

export interface FalVideoModel {
  id:           string                       // text-to-video endpoint
  i2vId?:       string                       // image-to-video endpoint (when a start frame is set)
  label:        string
  tier:         'budget' | 'premium'
  costPerClip:  number
  caps:         { text: boolean; start: boolean; end: boolean; audio: boolean }
  aspects:      string[]
  durations:    number[]
  resolutions:  string[]
  /** Map UI params → the fal `input` object for this model. */
  buildInput:   (p: FalVideoParams) => Record<string, unknown>
}

// Shared mapper covering the common fal video input fields. Individual models
// override as needed.
function commonInput(p: FalVideoParams): Record<string, unknown> {
  const input: Record<string, unknown> = { prompt: p.prompt }
  if (p.startUrl) input.image_url = p.startUrl
  if (p.endUrl)   input.end_image_url = p.endUrl
  if (p.aspect)   input.aspect_ratio = p.aspect
  if (p.duration) input.duration = String(p.duration)
  if (p.resolution) input.resolution = p.resolution
  return input
}

export const FAL_VIDEO_MODELS: FalVideoModel[] = [
  // ── Budget ──────────────────────────────────────────────────────────────────
  {
    id: 'fal-ai/ltx-video', i2vId: 'fal-ai/ltx-video/image-to-video',
    label: 'LTX Video', tier: 'budget', costPerClip: 0.06,
    caps: { text: true, start: true, end: false, audio: false },
    aspects: ['16:9', '9:16', '1:1'], durations: [5], resolutions: ['720p'],
    buildInput: commonInput,
  },
  {
    id: 'fal-ai/wan-t2v', i2vId: 'fal-ai/wan-i2v',
    label: 'Wan 2.1', tier: 'budget', costPerClip: 0.20,
    caps: { text: true, start: true, end: false, audio: false },
    aspects: ['16:9', '9:16', '1:1'], durations: [5], resolutions: ['480p', '720p'],
    buildInput: commonInput,
  },
  // ── Premium ─────────────────────────────────────────────────────────────────
  {
    id: 'fal-ai/kling-video/v1.6/standard/text-to-video',
    i2vId: 'fal-ai/kling-video/v1.6/standard/image-to-video',
    label: 'Kling 1.6', tier: 'premium', costPerClip: 0.45,
    caps: { text: true, start: true, end: true, audio: false },
    aspects: ['16:9', '9:16', '1:1'], durations: [5, 10], resolutions: ['720p'],
    buildInput: (p) => {
      const input = commonInput(p)
      // Kling uses `tail_image_url` for the end frame.
      if (p.endUrl) { delete (input as Record<string, unknown>).end_image_url; input.tail_image_url = p.endUrl }
      return input
    },
  },
  {
    id: 'fal-ai/minimax/video-01', i2vId: 'fal-ai/minimax/video-01/image-to-video',
    label: 'MiniMax Hailuo', tier: 'premium', costPerClip: 0.50,
    caps: { text: true, start: true, end: false, audio: false },
    aspects: ['16:9'], durations: [6], resolutions: ['720p'],
    buildInput: (p) => ({ prompt: p.prompt, ...(p.startUrl ? { image_url: p.startUrl } : {}) }),
  },
  {
    id: 'fal-ai/luma-dream-machine', i2vId: 'fal-ai/luma-dream-machine/image-to-video',
    label: 'Luma Dream Machine', tier: 'premium', costPerClip: 0.50,
    caps: { text: true, start: true, end: true, audio: false },
    aspects: ['16:9', '9:16', '1:1', '4:3', '3:4'], durations: [5], resolutions: ['720p'],
    buildInput: commonInput,
  },
]

export function getFalVideoModel(id: string): FalVideoModel | undefined {
  return FAL_VIDEO_MODELS.find(m => m.id === id)
}
