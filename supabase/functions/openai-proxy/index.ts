// openai-proxy — Edge Function
// Thin, authenticated proxy to the OpenAI Chat Completions API.
// Holds the OpenAI key in Supabase secrets (openai_api_key / OPENAI_API_KEY) so it
// never reaches Vercel env or the client. Accepts calls with a service-role or anon
// bearer JWT. Mirrors anthropic-proxy: forwards the request body unchanged.

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? Deno.env.get('openai_api_key') ?? ''

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  if (!OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'openai_api_key missing in Supabase secrets' }),
      { status: 503, headers: { 'Content-Type': 'application/json', ...CORS } },
    )
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  // Forward the full Chat Completions request body to OpenAI unchanged.
  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body:   JSON.stringify(body),
    signal: AbortSignal.timeout(55_000),
  })

  const data = await upstream.json().catch(() => ({}))

  return new Response(JSON.stringify(data), {
    status:  upstream.status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
})
