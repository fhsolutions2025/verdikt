// fal.ai video model registry.
//
// One place to define which fal video models the Media Studio offers, their
// capabilities, allowed output options, cost, and how UI params map to each
// model's fal `input` shape. The /video route resolves a model by id and calls
// buildInput(...) before submitting to the fal-proxy.
//
// NOTE: fal model IDs and per-model input field names change over time and can't
// be verified from this container (egress). If a generation 404s or errors,
// adjust the `id` / `i2vId` / buildInput / durations here — this is the single
// source of truth.

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
  tier:         'budget' | 'premium' | 'flagship'
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
  const input: Record<string, unknown> = {}
  if (p.prompt?.trim()) input.prompt = p.prompt
  if (p.startUrl)   input.image_url = p.startUrl
  if (p.endUrl)     input.end_image_url = p.endUrl
  if (p.aspect)     input.aspect_ratio = p.aspect
  if (p.duration)   input.duration = String(p.duration)
  if (p.resolution) input.resolution = p.resolution
  return input
}

const A_WIDE = ['16:9', '9:16', '1:1']
const A_ALL  = ['16:9', '9:16', '1:1', '4:3', '3:4']

export const FAL_VIDEO_MODELS: FalVideoModel[] = [
  // ── Budget ──────────────────────────────────────────────────────────────────
  {
    id: 'fal-ai/ltx-video', i2vId: 'fal-ai/ltx-video/image-to-video',
    label: 'LTX Video', tier: 'budget', costPerClip: 0.06,
    caps: { text: true, start: true, end: false, audio: false },
    aspects: A_WIDE, durations: [5], resolutions: ['720p'],
    buildInput: commonInput,
  },
  {
    id: 'fal-ai/wan-t2v', i2vId: 'fal-ai/wan-i2v',
    label: 'Wan 2.1', tier: 'budget', costPerClip: 0.20,
    caps: { text: true, start: true, end: false, audio: false },
    aspects: A_WIDE, durations: [5], resolutions: ['480p', '720p'],
    buildInput: commonInput,
  },
  {
    id: 'fal-ai/pika/v2.2/text-to-video', i2vId: 'fal-ai/pika/v2.2/image-to-video',
    label: 'Pika 2.2', tier: 'budget', costPerClip: 0.20,
    caps: { text: true, start: true, end: false, audio: false },
    aspects: A_WIDE, durations: [5], resolutions: ['720p', '1080p'],
    buildInput: commonInput,
  },
  // ── Premium ─────────────────────────────────────────────────────────────────
  {
    id: 'fal-ai/kling-video/v1.6/standard/text-to-video',
    i2vId: 'fal-ai/kling-video/v1.6/standard/image-to-video',
    label: 'Kling 1.6 Standard', tier: 'premium', costPerClip: 0.45,
    caps: { text: true, start: true, end: true, audio: false },
    aspects: A_WIDE, durations: [5, 10], resolutions: ['720p'],
    buildInput: (p) => {
      const input = commonInput(p)
      if (p.endUrl) { delete (input as Record<string, unknown>).end_image_url; input.tail_image_url = p.endUrl }
      return input
    },
  },
  {
    id: 'fal-ai/kling-video/v2.1/master/text-to-video',
    i2vId: 'fal-ai/kling-video/v2.1/master/image-to-video',
    label: 'Kling 2.1 Master', tier: 'premium', costPerClip: 1.00,
    caps: { text: true, start: true, end: true, audio: false },
    aspects: A_WIDE, durations: [5, 10], resolutions: ['1080p'],
    buildInput: (p) => {
      const input = commonInput(p)
      if (p.endUrl) { delete (input as Record<string, unknown>).end_image_url; input.tail_image_url = p.endUrl }
      return input
    },
  },
  {
    id: 'fal-ai/minimax/hailuo-02/standard/text-to-video',
    i2vId: 'fal-ai/minimax/hailuo-02/standard/image-to-video',
    label: 'MiniMax Hailuo 02', tier: 'premium', costPerClip: 0.50,
    caps: { text: true, start: true, end: false, audio: false },
    aspects: ['16:9', '9:16'], durations: [6, 10], resolutions: ['768p', '1080p'],
    buildInput: (p) => ({ ...(p.prompt?.trim() ? { prompt: p.prompt } : {}), ...(p.startUrl ? { image_url: p.startUrl } : {}), ...(p.duration ? { duration: String(p.duration) } : {}) }),
  },
  {
    id: 'fal-ai/luma-dream-machine', i2vId: 'fal-ai/luma-dream-machine/image-to-video',
    label: 'Luma Dream Machine', tier: 'premium', costPerClip: 0.50,
    caps: { text: true, start: true, end: true, audio: false },
    aspects: A_ALL, durations: [5, 9], resolutions: ['720p', '1080p'],
    buildInput: commonInput,
  },
  {
    id: 'fal-ai/bytedance/seedance/v1/lite/text-to-video',
    i2vId: 'fal-ai/bytedance/seedance/v1/lite/image-to-video',
    label: 'Seedance 1 Lite', tier: 'premium', costPerClip: 0.45,
    caps: { text: true, start: true, end: false, audio: false },
    aspects: A_WIDE, durations: [5, 10], resolutions: ['720p', '1080p'],
    buildInput: commonInput,
  },
  // ── Flagship (audio) ──────────────────────────────────────────────────────────
  {
    id: 'fal-ai/veo3', i2vId: 'fal-ai/veo3/image-to-video',
    label: 'Veo 3 (audio)', tier: 'flagship', costPerClip: 1.50,
    caps: { text: true, start: true, end: false, audio: true },
    aspects: ['16:9', '9:16'], durations: [4, 6, 8], resolutions: ['720p', '1080p'],
    buildInput: (p) => {
      const input = commonInput(p)
      input.generate_audio = p.audio ?? false
      return input
    },
  },
  {
    id: 'fal-ai/veo3/fast', i2vId: 'fal-ai/veo3/fast/image-to-video',
    label: 'Veo 3 Fast (audio)', tier: 'flagship', costPerClip: 0.80,
    caps: { text: true, start: true, end: false, audio: true },
    aspects: ['16:9', '9:16'], durations: [4, 6, 8], resolutions: ['720p'],
    buildInput: (p) => {
      const input = commonInput(p)
      input.generate_audio = p.audio ?? false
      return input
    },
  },
]

export function getFalVideoModel(id: string): FalVideoModel | undefined {
  return FAL_VIDEO_MODELS.find(m => m.id === id)
}
