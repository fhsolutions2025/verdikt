// openai-image-proxy — Edge Function
// Thin, authenticated proxy to the OpenAI Images API (gpt-image-1 / dall-e-3).
// Holds the OpenAI key in Supabase secrets. Forwards prompt/model/size and returns
// the raw OpenAI response (data[0].url for dall-e-3, data[0].b64_json for gpt-image-1).

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? Deno.env.get('openai_api_key') ?? ''

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: 'openai_api_key missing in Supabase secrets' }), {
      status: 503, headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  let body: { prompt?: string; model?: string; size?: string }
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  if (!body.prompt?.trim()) {
    return new Response(JSON.stringify({ error: 'prompt is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  const model = body.model || 'gpt-image-1'
  const size  = body.size  || '1024x1024'

  const upstream = await fetch('https://api.openai.com/v1/images/generations', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model, prompt: body.prompt, size, n: 1 }),
    signal: AbortSignal.timeout(55_000),
  })

  const data = await upstream.json().catch(() => ({}))
  return new Response(JSON.stringify(data), {
    status:  upstream.status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
})
