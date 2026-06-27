// fal-proxy — Edge Function
// Thin, authenticated proxy to fal.ai. Holds the FAL key in Supabase secrets.
// Two capabilities:
//   - image (sync):  POST fal.run/<model>            → { images:[{url}] }  → { url }
//   - video (async): POST queue.fal.run/<model>      → { request_id }
//                     GET  queue.fal.run/<model>/requests/<id>/status → { status }
//                     GET  queue.fal.run/<model>/requests/<id>        → { video:{url} }
// Auth to fal: header `Authorization: Key <FAL_KEY>`.

const FAL_KEY = Deno.env.get('FAL_KEY') ?? Deno.env.get('fal_api_key') ?? Deno.env.get('FAL_API_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

const DEFAULT_IMAGE_MODEL = 'fal-ai/flux/schnell'
const DEFAULT_VIDEO_MODEL = 'fal-ai/ltx-video'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } })
}

function falHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': `Key ${FAL_KEY}` }
}

// Recursively scan a fal result object for a video URL (handles unknown nesting
// across model families). Prefers obvious container keys, then any media URL.
function deepFindVideoUrl(v: unknown, depth = 0): string | undefined {
  if (v == null || depth > 6) return undefined
  if (typeof v === 'string') {
    return /^https?:\/\/\S+\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(v) ? v : undefined
  }
  if (Array.isArray(v)) {
    for (const x of v) { const u = deepFindVideoUrl(x, depth + 1); if (u) return u }
    return undefined
  }
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>
    for (const k of ['video', 'videos', 'output', 'result', 'file', 'files']) {
      if (k in obj) { const u = deepFindVideoUrl(obj[k], depth + 1); if (u) return u }
    }
    for (const val of Object.values(obj)) { const u = deepFindVideoUrl(val, depth + 1); if (u) return u }
  }
  return undefined
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (!FAL_KEY) return json({ error: 'fal_api_key missing in Supabase secrets' }, 503)

  let body: {
    op?: string; model?: string; prompt?: string; image_size?: string;
    request_id?: string; image_url?: string; input?: Record<string, unknown>;
    status_url?: string; response_url?: string;
  }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400) }

  const op = body.op ?? 'image'

  try {
    // ── Image (synchronous) ───────────────────────────────────────────────────
    if (op === 'image') {
      if (!body.prompt?.trim()) return json({ error: 'prompt is required' }, 400)
      const model = body.model || DEFAULT_IMAGE_MODEL
      const res = await fetch(`https://fal.run/${model}`, {
        method: 'POST', headers: falHeaders(),
        body: JSON.stringify({
          prompt: body.prompt,
          image_size: body.image_size || 'landscape_16_9',
          num_images: 1,
        }),
        signal: AbortSignal.timeout(90_000),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return json({ error: data?.detail ?? data?.error ?? `fal status ${res.status}` }, res.status)
      const url = data?.images?.[0]?.url
      if (!url) return json({ error: 'fal returned no image' }, 502)
      return json({ url })
    }

    // ── Video submit (async queue) ──────────────────────────────────────────────
    // Accepts a generic `input` (built by the app's model registry) or falls back
    // to a simple { prompt }.
    if (op === 'video.submit') {
      const model = body.model || DEFAULT_VIDEO_MODEL
      const payload = body.input && Object.keys(body.input).length
        ? body.input
        : (() => {
            if (!body.prompt?.trim()) return null
            const p: Record<string, unknown> = { prompt: body.prompt }
            if (body.image_url) p.image_url = body.image_url
            return p
          })()
      if (!payload) return json({ error: 'input or prompt is required' }, 400)
      const res = await fetch(`https://queue.fal.run/${model}`, {
        method: 'POST', headers: falHeaders(), body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return json({ error: data?.detail ?? data?.error ?? `fal status ${res.status}` }, res.status)
      // fal returns fully-formed poll URLs — hand them back so the caller doesn't
      // have to reconstruct the (model-id-dependent) /requests path.
      return json({
        request_id:   data?.request_id,
        model,
        status_url:   data?.status_url,
        response_url: data?.response_url,
      })
    }

    // ── Video status / result (poll) ────────────────────────────────────────────
    if (op === 'video.status' || op === 'video.result') {
      const model = body.model || DEFAULT_VIDEO_MODEL
      // Prefer the exact URLs fal handed back at submit time. Fall back to a
      // reconstructed path only when they're absent (older clients).
      const reconstructed = body.request_id
        ? `https://queue.fal.run/${model}/requests/${body.request_id}`
        : ''
      const url = op === 'video.status'
        ? (body.status_url   || (reconstructed && `${reconstructed}/status`))
        : (body.response_url || reconstructed)
      if (!url) return json({ error: 'request_id or poll url is required' }, 400)
      const res  = await fetch(url, { headers: falHeaders(), signal: AbortSignal.timeout(30_000) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return json({ error: data?.detail ?? data?.error ?? `fal status ${res.status}` }, res.status)
      if (op === 'video.status') return json({ status: data?.status })
      // result: normalize the video url across fal model shapes. Different families
      // nest it differently (data.video.url, data.videos[0].url, data.output.video.url,
      // data.output.url, …), so fall back to a recursive scan.
      const videoUrl = data?.video?.url ?? data?.videos?.[0]?.url ?? data?.output?.video?.url
        ?? data?.output?.url ?? deepFindVideoUrl(data)
      // On miss, return a trimmed raw payload so the shape is visible for debugging.
      return json({
        status: 'COMPLETED',
        video_url: videoUrl,
        raw: videoUrl ? undefined : JSON.stringify(data).slice(0, 4000),
      })
    }

    return json({ error: `Unknown op: ${op}` }, 400)
  } catch (e) {
    return json({ error: (e as Error).message }, 502)
  }
})
