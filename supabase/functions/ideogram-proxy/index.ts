// ideogram-proxy — Edge Function
// Thin proxy to the Ideogram v2 image generation API.
// Holds IDEOGRAM_API_KEY in Supabase secrets; accepts calls from the
// Next.js API route with a service-role bearer so JWT is verified.

const IDEOGRAM_API_KEY = Deno.env.get('ideogram_api_key') ?? Deno.env.get('IDEOGRAM_API_KEY') ?? ''

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    })
  }

  if (!IDEOGRAM_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'IDEOGRAM_API_KEY (or ideogram_api_key) missing in Supabase secrets' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )
  }

  let body: { prompt?: string; style?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  const { prompt, style = 'DESIGN' } = body
  if (!prompt?.trim()) {
    return new Response(JSON.stringify({ error: 'prompt is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  // Ideogram v2 generate endpoint
  const upstream = await fetch('https://api.ideogram.ai/generate', {
    method: 'POST',
    headers: {
      'Api-Key':     IDEOGRAM_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_request: {
        prompt,
        model:              'V_2',
        aspect_ratio:       'ASPECT_16_9',
        style_type:         style,
        magic_prompt_option: 'ON',
      },
    }),
    signal: AbortSignal.timeout(55_000),
  })

  if (!upstream.ok) {
    const errText = await upstream.text()
    return new Response(JSON.stringify({ error: `Ideogram error: ${errText}` }), {
      status: upstream.status, headers: { 'Content-Type': 'application/json' },
    })
  }

  const data = await upstream.json()
  const url  = data?.data?.[0]?.url ?? null

  if (!url) {
    return new Response(JSON.stringify({ error: 'No image returned from Ideogram', raw: data }), {
      status: 502, headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ url, seed: data?.data?.[0]?.seed }), {
    headers: {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
})
