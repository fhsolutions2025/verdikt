// anthropic-proxy — Edge Function
// Thin, authenticated proxy to the Anthropic Messages API.
// Holds ANTHROPIC_API_KEY in Supabase secrets so it never reaches Vercel env
// or the client. Accepts calls with a service-role or anon bearer JWT.

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY missing in Supabase secrets' }),
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

  // Forward the full request body to Anthropic unchanged
  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
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
