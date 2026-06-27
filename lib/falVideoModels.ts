// fal.ai video model registry.
//
// One place to define which fal video models the Media Studio offers, their
// capabilities, allowed output options, cost, and how UI params map to each
// model's fal `input` shape. The /video route resolves a model by id and calls
// buildInput(...) before submitting to the fal-proxy.
//
// IDs below are the CURRENT fal endpoints (verified against fal.ai/docs, Jun 2026).
// fal model IDs change with versions — an outdated id is the classic cause of a
// `fal status 405` (the path exists at a newer version and rejects POST on the
// old one). If a generation 405/404s, update the `id` / `i2vId` here — this file
// is the single source of truth.

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

// Audio-capable models take a `generate_audio` flag.
function withAudio(p: FalVideoParams): Record<string, unknown> {
  const input = commonInput(p)
  input.generate_audio = p.audio ?? true
  return input
}

// Kling uses `tail_image_url` for the end frame rather than `end_image_url`.
function klingInput(p: FalVideoParams): Record<string, unknown> {
  const input = commonInput(p)
  if (p.endUrl) { delete (input as Record<string, unknown>).end_image_url; input.tail_image_url = p.endUrl }
  return input
}

const A_WIDE = ['16:9', '9:16', '1:1']
const A_VERT = ['16:9', '9:16']

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
    id: 'fal-ai/wan/v2.2-a14b/text-to-video', i2vId: 'fal-ai/wan/v2.2-a14b/image-to-video',
    label: 'Wan 2.2', tier: 'budget', costPerClip: 0.20,
    caps: { text: true, start: true, end: false, audio: false },
    aspects: A_WIDE, durations: [5], resolutions: ['480p', '720p'],
    buildInput: commonInput,
  },
  {
    id: 'fal-ai/bytedance/seedance/v1/lite/text-to-video',
    i2vId: 'fal-ai/bytedance/seedance/v1/lite/image-to-video',
    label: 'Seedance 1 Lite', tier: 'budget', costPerClip: 0.18,
    caps: { text: true, start: true, end: false, audio: false },
    aspects: A_WIDE, durations: [5, 10], resolutions: ['720p', '1080p'],
    buildInput: commonInput,
  },
  // ── Premium ─────────────────────────────────────────────────────────────────
  {
    id: 'fal-ai/bytedance/seedance/v1/pro/text-to-video',
    i2vId: 'fal-ai/bytedance/seedance/v1/pro/image-to-video',
    label: 'Seedance 1 Pro', tier: 'premium', costPerClip: 0.45,
    caps: { text: true, start: true, end: false, audio: false },
    aspects: A_WIDE, durations: [5, 10], resolutions: ['720p', '1080p'],
    buildInput: commonInput,
  },
  {
    id: 'fal-ai/minimax/hailuo-02/standard/text-to-video',
    i2vId: 'fal-ai/minimax/hailuo-02/standard/image-to-video',
    label: 'MiniMax Hailuo 02', tier: 'premium', costPerClip: 0.50,
    caps: { text: true, start: true, end: false, audio: false },
    aspects: A_VERT, durations: [6, 10], resolutions: ['768p', '1080p'],
    buildInput: (p) => ({ ...(p.prompt?.trim() ? { prompt: p.prompt } : {}), ...(p.startUrl ? { image_url: p.startUrl } : {}), ...(p.duration ? { duration: String(p.duration) } : {}) }),
  },
  {
    id: 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video',
    i2vId: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
    label: 'Kling 2.5 Turbo Pro', tier: 'premium', costPerClip: 0.70,
    caps: { text: true, start: true, end: true, audio: false },
    aspects: A_WIDE, durations: [5, 10], resolutions: ['1080p'],
    buildInput: klingInput,
  },
  // ── Flagship (audio) ──────────────────────────────────────────────────────────
  {
    id: 'fal-ai/ltx-2-19b/text-to-video', i2vId: 'fal-ai/ltx-2-19b/image-to-video',
    label: 'LTX-2 19B (audio)', tier: 'flagship', costPerClip: 0.40,
    caps: { text: true, start: true, end: false, audio: true },
    aspects: A_WIDE, durations: [6, 8], resolutions: ['720p', '1080p'],
    buildInput: withAudio,
  },
  {
    id: 'fal-ai/veo3.1', i2vId: 'fal-ai/veo3.1/image-to-video',
    label: 'Veo 3.1 (audio)', tier: 'flagship', costPerClip: 1.50,
    caps: { text: true, start: true, end: false, audio: true },
    aspects: A_VERT, durations: [4, 6, 8], resolutions: ['720p', '1080p'],
    buildInput: withAudio,
  },
  {
    id: 'fal-ai/veo3.1/fast', i2vId: 'fal-ai/veo3.1/fast/image-to-video',
    label: 'Veo 3.1 Fast (audio)', tier: 'flagship', costPerClip: 0.80,
    caps: { text: true, start: true, end: false, audio: true },
    aspects: A_VERT, durations: [4, 6, 8], resolutions: ['720p'],
    buildInput: withAudio,
  },
  {
    id: 'fal-ai/sora-2/text-to-video', i2vId: 'fal-ai/sora-2/image-to-video',
    label: 'Sora 2 (audio)', tier: 'flagship', costPerClip: 1.20,
    caps: { text: true, start: true, end: false, audio: true },
    aspects: A_VERT, durations: [4, 8, 12], resolutions: ['720p'],
    buildInput: withAudio,
  },
  {
    id: 'fal-ai/sora-2/text-to-video/pro', i2vId: 'fal-ai/sora-2/image-to-video/pro',
    label: 'Sora 2 Pro (audio)', tier: 'flagship', costPerClip: 2.00,
    caps: { text: true, start: true, end: false, audio: true },
    aspects: A_VERT, durations: [4, 8, 12], resolutions: ['720p', '1080p'],
    buildInput: withAudio,
  },
]

export function getFalVideoModel(id: string): FalVideoModel | undefined {
  return FAL_VIDEO_MODELS.find(m => m.id === id)
}
