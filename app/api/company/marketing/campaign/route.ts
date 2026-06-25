import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { goal, segment, channel, extra } = await req.json()

  const supabaseUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 })
  }

  const systemPrompt = `You are a marketing copywriter for Verdikt, a sports prediction market platform.
Write engaging, conversion-focused marketing copy. The platform operates in Africa, Europe, and global markets.
Platform context: Players predict outcomes on sports, finance, and global events. They trade YES/NO shares.
Tone: Energetic, trustworthy, inclusive. No excessive hype. Clear value proposition.`

  const userPrompt = `Write a complete marketing campaign with this brief:
Goal: ${goal}
Audience segment: ${segment}
Channel: ${channel}${extra ? `\nAdditional context: ${extra}` : ''}

Respond with ONLY valid JSON (no markdown, no code blocks) in this exact format:
{
  "headline": "Short punchy headline, max 10 words",
  "body": "2-3 paragraph body copy appropriate for ${channel}. Personalized to the segment.",
  "cta": "Call-to-action button text, max 5 words"
}`

  const proxyUrl = `${supabaseUrl}/functions/v1/anthropic-proxy`
  const aiRes    = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 800,
      temperature: 0.9,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userPrompt }],
    }),
    signal: AbortSignal.timeout(25_000),
  })

  if (!aiRes.ok) {
    const err = await aiRes.text()
    return NextResponse.json({ error: `AI error: ${err}` }, { status: 502 })
  }

  const aiData    = await aiRes.json()
  const rawText   = aiData?.content?.[0]?.text ?? ''

  let campaign: { headline: string; body: string; cta: string }
  try {
    campaign = JSON.parse(rawText)
  } catch {
    // Try extracting JSON from text
    const match = rawText.match(/\{[\s\S]*\}/)
    if (!match) {
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 502 })
    }
    campaign = JSON.parse(match[0])
  }

  return NextResponse.json({
    campaign: {
      goal,
      segment,
      channel,
      headline: campaign.headline,
      body:     campaign.body,
      cta:      campaign.cta,
    },
  })
}
