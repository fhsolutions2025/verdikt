// ideogram-proxy — Edge Function
// Thin proxy to the Ideogram v2 image generation API.
// Holds the API key in Supabase secrets; accepts calls with service-role bearer.

const IDEOGRAM_API_KEY = Deno.env.get('ideogram_api_key') ?? Deno.env.get('IDEOGRAM_API_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

// Valid Ideogram V_2 aspect ratios
const VALID_RATIOS = new Set([
  'ASPECT_1_1', 'ASPECT_16_9', 'ASPECT_9_16', 'ASPECT_4_3',
  'ASPECT_3_4', 'ASPECT_2_3', 'ASPECT_3_2', 'ASPECT_10_16', 'ASPECT_16_10',
])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  if (!IDEOGRAM_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'ideogram_api_key missing in Supabase secrets' }),
      { status: 503, headers: { 'Content-Type': 'application/json', ...CORS } }
    )
  }

  let body: { prompt?: string; style?: string; aspect_ratio?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  const { prompt, style = 'DESIGN', aspect_ratio = 'ASPECT_16_9' } = body
  if (!prompt?.trim()) {
    return new Response(JSON.stringify({ error: 'prompt is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  const ratio = VALID_RATIOS.has(aspect_ratio) ? aspect_ratio : 'ASPECT_16_9'

  const upstream = await fetch('https://api.ideogram.ai/generate', {
    method: 'POST',
    headers: {
      'Api-Key':      IDEOGRAM_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_request: {
        prompt,
        model:               'V_2',
        aspect_ratio:        ratio,
        style_type:          style,
        magic_prompt_option: 'ON',
      },
    }),
    signal: AbortSignal.timeout(55_000),
  })

  if (!upstream.ok) {
    const errText = await upstream.text()
    return new Response(JSON.stringify({ error: `Ideogram error: ${errText}` }), {
      status: upstream.status, headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  const data = await upstream.json()
  const img  = data?.data?.[0]

  if (!img?.url) {
    return new Response(JSON.stringify({ error: 'No image returned from Ideogram', raw: data }), {
      status: 502, headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  return new Response(JSON.stringify({ url: img.url, seed: img.seed }), {
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
})
