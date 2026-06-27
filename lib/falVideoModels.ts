// fal.ai video model registry.
//
// One place to define which fal video models the Media Studio offers, their
// capabilities, allowed output options, cost, and how UI params map to each
// model's fal `input` shape. The /video route resolves a model by id and calls
// buildInput(...) before submitting to the fal-proxy.
//
// DESIGN: one fal endpoint = one row. fal encodes most "options" as separate
// endpoints (LongCat resolution /480p|/720p, Veo first-last-frame-to-video,
// Kling o3, Seedance reference-to-video) rather than params, so each endpoint is
// its own row and the endpoint string fully determines behavior. IDs are stored
// EXACTLY — do not auto-prefix: Bytedance/xAI carry no `fal-ai/`.
//
// IDs confirmed against the fal Explore catalog (Jun 2026). Can't be live-tested
// from this container (egress blocks fal). costPerSec are fal's published
// per-second rates (approx, 720p incl. audio where applicable) — used for an
// estimate that scales with duration. If a model 405/404s, fix the exact string
// here or use the in-app "Custom fal model…" paste box.

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
  id:           string                       // primary endpoint (text-to-video, or i2v for i2v-only models)
  i2vId?:       string                       // image-to-video endpoint (when a start frame is set)
  label:        string
  tier:         'budget' | 'premium' | 'flagship'
  costPerSec:      number                    // fal $/second, audio OFF (720p)
  costPerSecAudio?: number                    // fal $/second, audio ON (if the model has audio)
  caps:         { text: boolean; start: boolean; end: boolean; audio: boolean }
  aspects:      string[]
  durations:    number[]
  resolutions:  string[]
  /** Map UI params → the fal `input` object for this model. */
  buildInput:   (p: FalVideoParams) => Record<string, unknown>
}

// Estimated clip cost = $/sec × duration, using the audio-on rate when audio is set.
// fal bills per second of actual output, so this is an estimate (shown as ~$).
export function estVideoCost(m: FalVideoModel, durationSec: number, audio = false): number {
  const rate = audio && m.costPerSecAudio ? m.costPerSecAudio : m.costPerSec
  return rate * (durationSec || m.durations[0] || 1)
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

// Veo expects duration as an enum STRING with a trailing 's' ("4s"/"6s"/"8s")
// and generate_audio. (Confirmed from fal's validation error.)
function veoInput(p: FalVideoParams): Record<string, unknown> {
  const input = withAudio(p)
  if (p.duration) input.duration = `${p.duration}s`
  return input
}

// LTX-2.3 expects duration as a NUMBER (enum 6 | 8 | 10), not a string.
// (Confirmed from fal's validation error.)
function ltxInput(p: FalVideoParams): Record<string, unknown> {
  const input = commonInput(p)
  if (p.duration) input.duration = p.duration
  return input
}

// Kling: schema has no `resolution` input (tier-fixed) — sending it 422s the submit.
// End frame is `end_image_url` and duration is an enum STRING ("5".."15"), both of
// which commonInput already produces. (Confirmed from the Kling O3 API doc.)
function klingInput(p: FalVideoParams): Record<string, unknown> {
  const input = commonInput(p)
  delete (input as Record<string, unknown>).resolution
  return input
}

// LongCat bakes the resolution into the endpoint path, so don't send a resolution param.
function noResInput(p: FalVideoParams): Record<string, unknown> {
  const input = commonInput(p)
  delete (input as Record<string, unknown>).resolution
  return input
}

const A_WIDE = ['16:9', '9:16', '1:1']
const A_VERT = ['16:9', '9:16']

// The cheap "draft" workhorse used by Draft mode (per the fal integration guide).
export const FAL_DRAFT_MODEL_ID = 'fal-ai/minimax/hailuo-02/standard/text-to-video'

export const FAL_VIDEO_MODELS: FalVideoModel[] = [
  // ── Budget ──────────────────────────────────────────────────────────────────
  {
    id: 'fal-ai/minimax/hailuo-02/standard/text-to-video',
    i2vId: 'fal-ai/minimax/hailuo-02/standard/image-to-video',
    label: 'Hailuo 02 (draft workhorse)', tier: 'budget', costPerSec: 0.045,
    caps: { text: true, start: true, end: false, audio: false },
    aspects: A_VERT, durations: [6, 10], resolutions: ['768p', '1080p'],
    buildInput: (p) => ({ ...(p.prompt?.trim() ? { prompt: p.prompt } : {}), ...(p.startUrl ? { image_url: p.startUrl } : {}), ...(p.duration ? { duration: String(p.duration) } : {}) }),
  },
  {
    id: 'bytedance/seedance-2.0/fast/text-to-video',
    i2vId: 'bytedance/seedance-2.0/fast/image-to-video',
    label: 'Seedance 2.0 Fast', tier: 'budget', costPerSec: 0.15,
    caps: { text: true, start: true, end: false, audio: false },
    aspects: A_WIDE, durations: [5, 10], resolutions: ['720p', '1080p'],
    buildInput: commonInput,
  },
  {
    id: 'fal-ai/longcat-video/text-to-video/480p',
    i2vId: 'fal-ai/longcat-video/image-to-video/480p',
    label: 'LongCat 480p', tier: 'budget', costPerSec: 0.03,
    caps: { text: true, start: true, end: false, audio: false },
    aspects: A_WIDE, durations: [5], resolutions: ['480p'],
    buildInput: noResInput,
  },
  {
    id: 'fal-ai/ltx-2.3/text-to-video/fast',
    label: 'LTX-2.3 Fast', tier: 'budget', costPerSec: 0.03,
    caps: { text: true, start: false, end: false, audio: false },
    aspects: A_WIDE, durations: [6, 8, 10], resolutions: ['1080p', '1440p', '2160p'],
    buildInput: ltxInput,
  },
  // ── Premium ─────────────────────────────────────────────────────────────────
  {
    id: 'bytedance/seedance-2.0/text-to-video',
    i2vId: 'bytedance/seedance-2.0/image-to-video',
    label: 'Seedance 2.0', tier: 'premium', costPerSec: 0.25,
    caps: { text: true, start: true, end: false, audio: false },
    aspects: A_WIDE, durations: [5, 10], resolutions: ['720p', '1080p'],
    buildInput: commonInput,
  },
  {
    id: 'bytedance/seedance-2.0/reference-to-video',
    label: 'Seedance 2.0 Reference', tier: 'premium', costPerSec: 0.25,
    caps: { text: true, start: true, end: false, audio: false },
    aspects: A_WIDE, durations: [5, 10], resolutions: ['720p', '1080p'],
    buildInput: commonInput,
  },
  {
    id: 'fal-ai/longcat-video/text-to-video/720p',
    i2vId: 'fal-ai/longcat-video/image-to-video/720p',
    label: 'LongCat 720p', tier: 'premium', costPerSec: 0.05,
    caps: { text: true, start: true, end: false, audio: false },
    aspects: A_WIDE, durations: [5], resolutions: ['720p'],
    buildInput: noResInput,
  },
  {
    id: 'fal-ai/ltx-2.3/text-to-video', i2vId: 'fal-ai/ltx-2.3/image-to-video',
    label: 'LTX-2.3', tier: 'premium', costPerSec: 0.05,
    caps: { text: true, start: true, end: false, audio: false },
    aspects: A_WIDE, durations: [6, 8, 10], resolutions: ['1080p', '1440p', '2160p'],
    buildInput: ltxInput,
  },
  {
    id: 'fal-ai/kling-video/v2.1/master/text-to-video',
    i2vId: 'fal-ai/kling-video/v2.1/pro/image-to-video',
    label: 'Kling 2.1', tier: 'premium', costPerSec: 0.05,
    caps: { text: true, start: true, end: true, audio: false },
    aspects: A_WIDE, durations: [5, 10], resolutions: ['1080p'],
    buildInput: klingInput,
  },
  {
    id: 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video',
    i2vId: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
    label: 'Kling 2.5 Turbo Pro', tier: 'premium', costPerSec: 0.07,
    caps: { text: true, start: true, end: true, audio: false },
    aspects: A_WIDE, durations: [5, 10], resolutions: ['1080p'],
    buildInput: klingInput,
  },
  {
    id: 'fal-ai/pixverse/v6/image-to-video',
    label: 'Pixverse V6 (frame→video)', tier: 'premium', costPerSec: 0.06,
    caps: { text: false, start: true, end: false, audio: false },
    aspects: A_WIDE, durations: [5, 8], resolutions: ['540p', '720p', '1080p'],
    buildInput: commonInput,
  },
  // ── Flagship ──────────────────────────────────────────────────────────────────
  {
    id: 'fal-ai/kling-video/v3/pro/text-to-video',
    i2vId: 'fal-ai/kling-video/v3/pro/image-to-video',
    label: 'Kling 3.0 Pro', tier: 'flagship', costPerSec: 0.15,
    caps: { text: true, start: true, end: true, audio: false },
    aspects: A_WIDE, durations: [5, 10], resolutions: ['1080p'],
    buildInput: klingInput,
  },
  {
    id: 'fal-ai/kling-video/o3/standard/image-to-video',
    label: 'Kling O3 (first→last frame)', tier: 'flagship', costPerSec: 0.084,
    caps: { text: false, start: true, end: true, audio: false },
    aspects: A_WIDE, durations: [5, 10], resolutions: ['1080p'],
    buildInput: klingInput,
  },
  {
    id: 'fal-ai/veo3.1/fast', i2vId: 'fal-ai/veo3.1/fast/image-to-video',
    label: 'Veo 3.1 Fast', tier: 'flagship', costPerSec: 0.10, costPerSecAudio: 0.15,
    caps: { text: true, start: true, end: false, audio: true },
    aspects: A_VERT, durations: [4, 6, 8], resolutions: ['720p'],
    buildInput: veoInput,
  },
  {
    id: 'fal-ai/veo3.1', i2vId: 'fal-ai/veo3.1/image-to-video',
    label: 'Veo 3.1', tier: 'flagship', costPerSec: 0.20, costPerSecAudio: 0.40,
    caps: { text: true, start: true, end: false, audio: true },
    aspects: A_VERT, durations: [4, 6, 8], resolutions: ['720p', '1080p'],
    buildInput: veoInput,
  },
  {
    id: 'fal-ai/veo3.1/first-last-frame-to-video',
    label: 'Veo 3.1 First→Last', tier: 'flagship', costPerSec: 0.20, costPerSecAudio: 0.40,
    caps: { text: false, start: true, end: true, audio: true },
    aspects: A_VERT, durations: [4, 6, 8], resolutions: ['720p', '1080p'],
    buildInput: veoInput,
  },
]

export function getFalVideoModel(id: string): FalVideoModel | undefined {
  return FAL_VIDEO_MODELS.find(m => m.id === id)
}

// Custom (user-pasted) models persist as a serializable spec — buildInput can't be
// stored, so it's reattached here. Paste any exact id from fal.ai/models.
export interface CustomVideoSpec { id: string; label?: string; kind: 'text' | 'frame'; audio?: boolean }

export function makeCustomVideoModel(s: CustomVideoSpec): FalVideoModel {
  const isFrame = s.kind === 'frame'
  return {
    id: s.id,
    label: (s.label ?? '').trim() || s.id.split('/').slice(-2).join('/'),
    tier: 'premium', costPerSec: 0.10,
    caps: { text: !isFrame, start: isFrame, end: false, audio: !!s.audio },
    aspects: A_WIDE, durations: [5, 8], resolutions: ['720p', '1080p'],
    buildInput: s.audio ? withAudio : commonInput,
  }
}

// Tier order for grouping the picker.
export const FAL_TIER_ORDER: FalVideoModel['tier'][] = ['budget', 'premium', 'flagship']
export const FAL_TIER_LABEL: Record<FalVideoModel['tier'], string> = {
  budget: 'Budget', premium: 'Premium', flagship: 'Flagship',
}
