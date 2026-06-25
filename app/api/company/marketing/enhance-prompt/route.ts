import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { prompt, platform, style } = await req.json()
  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
  }

  const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
  }

  const systemPrompt = `You are an expert AI image prompt engineer specializing in Ideogram and Midjourney.
Transform basic descriptions into rich, professional image generation prompts that produce stunning marketing visuals.

Rules for a great Ideogram prompt:
- Add specific photography/render style (e.g. "cinematic aerial drone shot", "editorial sports photography", "3D product render")
- Add quality markers (e.g. "ultra-detailed, 8k, professional", "award-winning photography")
- Specify lighting (e.g. "golden hour backlight", "dramatic studio lighting", "neon accent lights")
- Add mood and color grading (e.g. "dark high-contrast", "vibrant saturated colors")
- Reference style sources where helpful (e.g. "Getty Images editorial style", "Apple product photography")
- Include composition notes (e.g. "wide-angle", "close-up detail", "rule of thirds")
- Keep it under 200 words

Context: Verdikt is a sports prediction market platform operating in Africa and Europe.
Target format: ${platform || 'marketing banner'}
Visual style preference: ${style || 'DESIGN'}`

  const userPrompt = `Transform this basic prompt into a rich, professional Ideogram image prompt:

"${prompt}"

Return ONLY the enhanced prompt text — no explanations, no quotes, no labels.`

  const proxyUrl = `${supabaseUrl}/functions/v1/anthropic-proxy`
  const aiRes    = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 300,
      temperature: 0.8,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userPrompt }],
    }),
    signal: AbortSignal.timeout(20_000),
  })

  if (!aiRes.ok) {
    return NextResponse.json({ error: 'AI enhancement failed' }, { status: 502 })
  }

  const data     = await aiRes.json()
  const enhanced = data?.content?.[0]?.text?.trim() ?? ''

  return NextResponse.json({ enhanced })
}
