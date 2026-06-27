import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { complete, type Provider } from '@/lib/llm/router'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET /api/company/marketing/v2/llm-test?provider=openai|anthropic
// Admin-gated smoke test for the provider-agnostic LLM router. Forces the chosen
// provider via providerOverride and returns the model + a short completion.
export async function GET(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const raw = (url.searchParams.get('provider') ?? 'openai').toLowerCase()
  const provider: Provider = raw === 'anthropic' ? 'anthropic' : 'openai'
  const prompt = url.searchParams.get('prompt')
    ?? 'In one sentence, say hello from Verdikt Marketing and name which AI model you are.'

  const started = Date.now()
  try {
    const result = await complete({
      task: 'social', // cheap routing class
      providerOverride: provider,
      system: 'You are a concise assistant. Reply in one short sentence, plain text.',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 120,
      temperature: 0.4,
    })
    return NextResponse.json({
      ok: true,
      provider: result.provider,
      model: result.model,
      text: result.text,
      usage: result.usage,
      latency_ms: Date.now() - started,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, provider, error: (err as Error).message }, { status: 502 })
  }
}
