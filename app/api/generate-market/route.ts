import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Parse body ────────────────────────────────────────────────
  let title = '', description = ''
  try {
    const body = await req.json()
    title       = String(body.title       ?? '').slice(0, 300)
    description = String(body.description ?? '').slice(0, 500)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!title) return NextResponse.json({ error: 'Missing title' }, { status: 400 })

  const today        = new Date()
  const todayStr     = today.toISOString().slice(0, 10)
  const minCloseDate = new Date(today.getTime() + 30  * 24 * 3600_000).toISOString().slice(0, 10)
  const maxCloseDate = new Date(today.getTime() + 365 * 24 * 3600_000).toISOString().slice(0, 10)

  // ── Sandwich prompt (prevents injection via headline content) ─
  const userPrompt = [
    '=== BEGIN NEWS INPUT ===',
    `HEADLINE: ${title}`,
    description ? `CONTEXT: ${description}` : '',
    '=== END NEWS INPUT ===',
    '',
    `Today's date: ${todayStr}`,
    '',
    'Generate a binary YES/NO prediction market from the headline above.',
    'The predicted outcome must be:',
    '• Verifiable from public record (news, official results, market data)',
    '• Resolvable within 1–12 months from today',
    `• Closes between ${minCloseDate} and ${maxCloseDate}`,
    '• NOT already resolved or a certainty',
    '',
    'If the headline is historical fact, an opinion, a soft feature, or cannot be',
    'turned into a meaningful binary prediction, return {"viable":false}.',
    '',
    'Otherwise return exactly this JSON (no other text):',
    '{',
    '  "viable": true,',
    '  "question": "Will [specific, measurable thing] happen by [Month YYYY]?",',
    '  "yes_price": <integer 5-95>,',
    '  "closes_at": "YYYY-MM-DD",',
    '  "resolution_source": "<how outcome is publicly verified, e.g. Reuters, government announcement>",',
    '  "rationale": "<one sentence: why this probability>",',
    '  "ai_confidence": <integer 40-95>',
    '}',
  ].filter(Boolean).join('\n')

  // ── Call Haiku ────────────────────────────────────────────────
  let rawBody = ''
  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: [
          'You are a JSON-only API that creates binary prediction markets.',
          'Output raw JSON only — no markdown fences, no explanation, no preamble.',
          'The very first character of your response MUST be {.',
          'Never include ``` in your output.',
        ].join(' '),
        messages: [{ role: 'user', content: userPrompt }],
      }),
      signal: AbortSignal.timeout(20_000),
    })

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => '')
      return NextResponse.json(
        { error: `Haiku returned ${aiRes.status}: ${errText.slice(0, 200)}` },
        { status: 502 },
      )
    }

    const aiData = await aiRes.json()
    rawBody = (aiData.content?.[0]?.text ?? '') as string
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Haiku call failed' },
      { status: 502 },
    )
  }

  // ── Parse and sanitise Haiku output ──────────────────────────
  // Strip markdown fences in case Haiku wraps anyway
  rawBody = rawBody
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  // Guarantee first char is {
  const braceIdx = rawBody.indexOf('{')
  if (braceIdx > 0) rawBody = rawBody.slice(braceIdx)
  const lastBrace = rawBody.lastIndexOf('}')
  if (lastBrace >= 0) rawBody = rawBody.slice(0, lastBrace + 1)

  let draft: Record<string, unknown>
  try {
    draft = JSON.parse(rawBody)
  } catch {
    return NextResponse.json(
      { error: `Haiku returned unparseable JSON: ${rawBody.slice(0, 120)}` },
      { status: 502 },
    )
  }

  if (!draft.viable) {
    return NextResponse.json({ viable: false })
  }

  // Validate question
  const question = String(draft.question ?? '').trim()
  if (!question.startsWith('Will ') || !question.endsWith('?')) {
    return NextResponse.json({ viable: false })
  }

  // Validate closes_at — clamp to allowed window
  let closesAt = String(draft.closes_at ?? '')
  const closeTs = new Date(closesAt).getTime()
  if (isNaN(closeTs)) {
    closesAt = maxCloseDate
  } else if (closesAt < minCloseDate) {
    closesAt = minCloseDate
  } else if (closesAt > maxCloseDate) {
    closesAt = maxCloseDate
  }

  // Clamp yes_price and derive no_price
  const yesPrice = Math.min(Math.max(Math.round(Number(draft.yes_price) || 50), 5), 95)

  // Clamp ai_confidence
  const aiConfidence = Math.min(Math.max(Math.round(Number(draft.ai_confidence) || 70), 40), 95)

  return NextResponse.json({
    viable:            true,
    question,
    yes_price:         yesPrice,
    no_price:          100 - yesPrice,
    closes_at:         closesAt,
    resolution_source: String(draft.resolution_source ?? 'Public record').slice(0, 300),
    rationale:         String(draft.rationale ?? '').slice(0, 400),
    ai_confidence:     aiConfidence,
  })
}
