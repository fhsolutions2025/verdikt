// Provider-agnostic LLM router for the Marketing Department.
//
// Callers never reference a concrete model/provider — they pass a `task` and the
// router resolves provider + model + temperature from the routing table
// (docs/verdikt-marketing-agent/11-llm-config.md). MVP wires the Anthropic path
// via the existing `anthropic-proxy` edge function; the OpenAI adapter is stubbed
// behind the same interface so V1 multi-provider is config, not a rewrite.

import { createServiceClient } from '@/lib/supabase/server'

export type LlmTask =
  | 'strategy' | 'research' | 'copywriting' | 'seo' | 'blog' | 'social'
  | 'image_prompt' | 'review' | 'compliance' | 'analytics' | 'learning' | 'memory'

export type Provider = 'anthropic' | 'openai'
export type ModelClass = 'reasoning-high' | 'reasoning-mid' | 'fast-cheap'

interface RouteEntry {
  provider:    Provider
  modelClass:  ModelClass
  temperature: number
  maxTokens:   number
}

// Routing table — mirrors 11-llm-config §5.
const ROUTING: Record<LlmTask, RouteEntry> = {
  strategy:     { provider: 'anthropic', modelClass: 'reasoning-high', temperature: 0.5, maxTokens: 2200 },
  research:     { provider: 'anthropic', modelClass: 'reasoning-mid',  temperature: 0.4, maxTokens: 1800 },
  copywriting:  { provider: 'anthropic', modelClass: 'reasoning-mid',  temperature: 0.8, maxTokens: 1600 },
  seo:          { provider: 'anthropic', modelClass: 'reasoning-mid',  temperature: 0.3, maxTokens: 1400 },
  blog:         { provider: 'anthropic', modelClass: 'reasoning-mid',  temperature: 0.7, maxTokens: 3000 },
  social:       { provider: 'anthropic', modelClass: 'fast-cheap',     temperature: 0.9, maxTokens: 900  },
  image_prompt: { provider: 'anthropic', modelClass: 'fast-cheap',     temperature: 0.9, maxTokens: 600  },
  review:       { provider: 'anthropic', modelClass: 'reasoning-mid',  temperature: 0.2, maxTokens: 900  },
  compliance:   { provider: 'anthropic', modelClass: 'reasoning-high', temperature: 0.0, maxTokens: 900  },
  analytics:    { provider: 'anthropic', modelClass: 'reasoning-high', temperature: 0.3, maxTokens: 1400 },
  learning:     { provider: 'anthropic', modelClass: 'reasoning-mid',  temperature: 0.4, maxTokens: 1200 },
  memory:       { provider: 'anthropic', modelClass: 'fast-cheap',     temperature: 0.2, maxTokens: 800  },
}

// Concrete model IDs per provider/class (config — swap here on upgrade, no caller change).
const MODEL_IDS: Record<Provider, Record<ModelClass, string>> = {
  anthropic: {
    'reasoning-high': 'claude-opus-4-8',
    'reasoning-mid':  'claude-sonnet-4-6',
    'fast-cheap':     'claude-haiku-4-5-20251001',
  },
  openai: {
    'reasoning-high': 'gpt-4o',
    'reasoning-mid':  'gpt-4o',
    'fast-cheap':     'gpt-4o-mini',
  },
}

// Models that reject the `temperature` parameter (Anthropic deprecated it on some
// newer models). Their requests must omit temperature entirely.
function modelRejectsTemperature(model: string): boolean {
  return model.startsWith('claude-opus-4')
}

export interface CompleteArgs {
  task:        LlmTask
  system:      string
  messages:    { role: 'user' | 'assistant'; content: string }[]
  maxTokens?:  number
  temperature?: number
  /** Force a specific provider (e.g. to A/B Anthropic vs OpenAI). Defaults to the routing table. */
  providerOverride?: Provider
}

export interface CompleteResult {
  text:     string
  model:    string
  provider: Provider
  usage:    { input: number; output: number }
}

async function logCall(opts: {
  task: LlmTask; model: string; usage: { input: number; output: number };
  latencyMs: number; success: boolean; error?: string;
}) {
  try {
    const svc = await createServiceClient()
    await svc.from('ai_call_log').insert({
      call_type:     `marketing:${opts.task}`,
      model:         opts.model,
      input_tokens:  opts.usage.input,
      output_tokens: opts.usage.output,
      latency_ms:    opts.latencyMs,
      success:       opts.success,
      error_message: opts.error ?? null,
      from_cache:    false,
    })
  } catch {
    /* logging must never break a run */
  }
}

// Anthropic adapter via the existing proxy edge function.
async function anthropicComplete(model: string, args: CompleteArgs): Promise<CompleteResult> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key     = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!baseUrl || !key) throw new Error('LLM not configured (Supabase env missing)')

  const route = ROUTING[args.task]
  const reqBody: Record<string, unknown> = {
    model,
    max_tokens: args.maxTokens ?? route.maxTokens,
    system:     args.system,
    messages:   args.messages,
  }
  // Some newer Claude models (e.g. Opus 4.8) reject `temperature`
  // ("temperature is deprecated for this model"); only send it when supported.
  if (!modelRejectsTemperature(model)) {
    reqBody.temperature = args.temperature ?? route.temperature
  }
  const res = await fetch(`${baseUrl}/functions/v1/anthropic-proxy`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(reqBody),
    signal: AbortSignal.timeout(55_000),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`anthropic-proxy ${res.status}: ${t.slice(0, 200)}`)
  }
  const data = await res.json()
  const text: string = (data.content?.[0]?.text ?? '').trim()
  return {
    text,
    model,
    provider: 'anthropic',
    usage: { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0 },
  }
}

// OpenAI adapter via the openai-proxy edge function (Chat Completions).
async function openaiComplete(model: string, args: CompleteArgs): Promise<CompleteResult> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key     = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!baseUrl || !key) throw new Error('LLM not configured (Supabase env missing)')

  const route = ROUTING[args.task]
  const res = await fetch(`${baseUrl}/functions/v1/openai-proxy`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      max_tokens:  args.maxTokens ?? route.maxTokens,
      temperature: args.temperature ?? route.temperature,
      messages: [
        { role: 'system', content: args.system },
        ...args.messages,
      ],
    }),
    signal: AbortSignal.timeout(55_000),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`openai-proxy ${res.status}: ${t.slice(0, 200)}`)
  }
  const data = await res.json()
  if (data.error) throw new Error(`openai: ${data.error?.message ?? JSON.stringify(data.error).slice(0, 160)}`)
  const text: string = (data.choices?.[0]?.message?.content ?? '').trim()
  return {
    text,
    model,
    provider: 'openai',
    usage: { input: data.usage?.prompt_tokens ?? 0, output: data.usage?.completion_tokens ?? 0 },
  }
}

/**
 * Resolve provider/model from the task (or providerOverride) and run the
 * completion, with retry, fallback (mid→fast), and cost logging.
 */
export async function complete(args: CompleteArgs): Promise<CompleteResult> {
  const route = ROUTING[args.task]
  if (!route) throw new Error(`No routing entry for task "${args.task}"`)

  const provider: Provider = args.providerOverride ?? route.provider
  const run = provider === 'openai' ? openaiComplete : anthropicComplete

  // Fallback chain: requested class → fast-cheap (compliance never downgrades).
  const classes: ModelClass[] =
    args.task === 'compliance'
      ? [route.modelClass]
      : route.modelClass === 'fast-cheap'
        ? ['fast-cheap']
        : [route.modelClass, 'fast-cheap']

  let lastErr: unknown
  for (const cls of classes) {
    const model = MODEL_IDS[provider][cls]
    for (let attempt = 0; attempt < 3; attempt++) {
      const started = Date.now()
      try {
        const result = await run(model, args)
        await logCall({ task: args.task, model, usage: result.usage, latencyMs: Date.now() - started, success: true })
        return result
      } catch (err) {
        lastErr = err
        await logCall({ task: args.task, model, usage: { input: 0, output: 0 }, latencyMs: Date.now() - started, success: false, error: (err as Error).message })
        if (attempt < 2) await new Promise(r => setTimeout(r, (attempt + 1) * 1000))
      }
    }
  }
  throw new Error(`LLM completion failed for task "${args.task}": ${(lastErr as Error)?.message ?? 'unknown'}`)
}

/** Strip markdown fences and parse JSON; one repair pass. Returns null on failure. */
export function parseJson<T>(text: string): T | null {
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  try { return JSON.parse(cleaned) as T } catch { /* try slice */ }
  const start = cleaned.indexOf('{')
  const startArr = cleaned.indexOf('[')
  const from = startArr >= 0 && (startArr < start || start < 0) ? startArr : start
  const endChar = from === startArr ? ']' : '}'
  const end = cleaned.lastIndexOf(endChar)
  if (from >= 0 && end > from) {
    try { return JSON.parse(cleaned.slice(from, end + 1)) as T } catch { /* give up */ }
  }
  return null
}

/** Complete and parse JSON; one re-ask with a stricter instruction if parsing fails. */
export async function completeJson<T>(args: CompleteArgs): Promise<{ data: T | null; raw: string }> {
  const first = await complete(args)
  const parsed = parseJson<T>(first.text)
  if (parsed !== null) return { data: parsed, raw: first.text }

  const retry = await complete({
    ...args,
    messages: [
      ...args.messages,
      { role: 'assistant', content: first.text },
      { role: 'user', content: 'Your previous response was not valid JSON. Reply with ONLY the JSON object, no prose, no markdown fences.' },
    ],
  })
  return { data: parseJson<T>(retry.text), raw: retry.text }
}
