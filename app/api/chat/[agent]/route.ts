import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth'

const ALLOWED_AGENTS = ['player', 'company', 'mm_desk'] as const
type AgentType = (typeof ALLOWED_AGENTS)[number]

// ── Guardrail patterns ────────────────────────────────────────────────────────

const INJECTION_PATTERNS = [
  /ignore\s+(previous|all|prior)\s+instructions?/i,
  /you\s+are\s+now\s+(?:a\s+)?(?:DAN|GPT|jailbreak)/i,
  /pretend\s+(?:you|that)\s+(?:are|you're)/i,
  /do\s+anything\s+now/i,
  /disable\s+(?:your\s+)?(?:safety|guardrails|restrictions)/i,
  /system\s*prompt\s*:/i,
  /\[INST\]|\[\/INST\]/,
  /<\|im_start\|>|<\|im_end\|>/,
]

// International PII patterns. The platform serves players across Africa,
// Europe and beyond, so we strip globally-recognised identifiers rather than
// any single country's national-ID format.
const PII_PATTERNS = [
  // Payment card number (13–16 digits, optional spaces/dashes)
  /\b(?:\d[ -]*?){13,16}\b/g,
  // CVV / CVC
  /\bcv[vc]\s*:?\s*\d{3,4}\b/gi,
  // Email address
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  // IBAN (international bank account — Europe, Africa, Middle East, etc.)
  /\b[A-Z]{2}\d{2}[ ]?(?:[A-Z0-9][ ]?){11,30}\b/g,
  // International phone number in E.164-ish form (must start with +)
  /\+\d[\d\s().-]{7,}\d/g,
  // National identifier in ###-##-#### form (e.g. US SSN and similar)
  /\b\d{3}-\d{2}-\d{4}\b/g,
]

function stripPii(text: string): { cleaned: string; hadPii: boolean } {
  let cleaned = text
  let hadPii = false
  for (const re of PII_PATTERNS) {
    const replaced = cleaned.replace(re, '[REDACTED]')
    if (replaced !== cleaned) { hadPii = true; cleaned = replaced }
  }
  return { cleaned, hadPii }
}

function detectInjection(text: string): boolean {
  return INJECTION_PATTERNS.some(re => re.test(text))
}

// ── Tool definitions exposed to the model ────────────────────────────────────

const TOOL_DEFS: Record<string, object> = {
  get_player_portfolio: {
    name: 'get_player_portfolio',
    description: 'Fetch the current player\'s open positions, P&L, and wallet balance.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  get_market_detail: {
    name: 'get_market_detail',
    description: 'Get full details for a specific market including current price, volume, and resolution source.',
    input_schema: {
      type: 'object',
      properties: {
        market_id: { type: 'string', description: 'UUID of the market' },
      },
      required: ['market_id'],
    },
  },
  get_live_markets: {
    name: 'get_live_markets',
    description: 'List live markets, optionally filtered by category.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['sports', 'finance', 'politics', 'current_affairs', 'custom'] },
        limit: { type: 'number', default: 10 },
      },
      required: [],
    },
  },
  get_platform_metrics: {
    name: 'get_platform_metrics',
    description: 'Fetch current platform revenue, volume, fee income, and spread income.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  get_risk_markets: {
    name: 'get_risk_markets',
    description: 'Get flagged imbalanced markets with risk tier (orange/green).',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  get_ai_stats: {
    name: 'get_ai_stats',
    description: 'Get today\'s AI model usage: call count, latency, cost, cache hit rate.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  get_open_book: {
    name: 'get_open_book',
    description: 'Fetch current MM positions across all live markets.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  get_market_risk: {
    name: 'get_market_risk',
    description: 'Get risk tier, imbalance ratio, and capital at risk for all markets.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
}

// ── Tool execution ────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string> {
  try {
    switch (name) {
      case 'get_player_portfolio': {
        const [posRes, walletRes] = await Promise.all([
          supabase.from('positions').select('*').eq('player_id', userId).eq('status', 'open'),
          supabase.from('wallets').select('balance').eq('player_id', userId).single(),
        ])
        return JSON.stringify({
          positions: posRes.data ?? [],
          balance: walletRes.data?.balance ?? 0,
        })
      }
      case 'get_market_detail': {
        const { data } = await supabase
          .from('markets')
          .select('id, question, yes_price, no_price, volume, ai_confidence, resolution_source, closes_at, status')
          .eq('id', String(input.market_id ?? ''))
          .single()
        return JSON.stringify(data ?? { error: 'Market not found' })
      }
      case 'get_live_markets': {
        let q = supabase
          .from('markets')
          .select('id, question, yes_price, no_price, volume, ai_confidence, category')
          .in('status', ['live', 'ai_ready'])
          .order('volume', { ascending: false })
          .limit(Number(input.limit ?? 10))
        if (input.category) q = q.eq('category', String(input.category))
        const { data } = await q
        return JSON.stringify(data ?? [])
      }
      case 'get_platform_metrics': {
        const { data: totals } = await supabase.from('v_platform_totals').select('*').single()
        return JSON.stringify(totals ?? {})
      }
      case 'get_risk_markets': {
        const { data } = await supabase.from('v_market_risk_status').select('*')
        return JSON.stringify(data ?? [])
      }
      case 'get_ai_stats': {
        const today = new Date(); today.setHours(0, 0, 0, 0)
        const { data } = await supabase
          .from('ai_call_log')
          .select('success, from_cache, latency_ms, input_tokens, output_tokens')
          .gte('created_at', today.toISOString())
        const rows = data ?? []
        const calls = rows.length
        const cached = rows.filter(r => r.from_cache).length
        const latencies = rows.filter(r => !r.from_cache && r.latency_ms != null).map(r => r.latency_ms!)
        const avgLatency = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null
        return JSON.stringify({ calls_today: calls, cache_hit_rate: calls > 0 ? cached / calls : 0, avg_latency_ms: avgLatency })
      }
      case 'get_open_book': {
        const { data } = await supabase
          .from('markets')
          .select('id, question, yes_price, no_price, volume, spread_cents, ai_confidence')
          .eq('status', 'live')
          .order('volume', { ascending: false })
        return JSON.stringify(data ?? [])
      }
      case 'get_market_risk': {
        const { data } = await supabase.from('v_market_risk_status').select('*')
        return JSON.stringify(data ?? [])
      }
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` })
    }
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : 'Tool error' })
  }
}

// ── Failure logging (best-effort, never throws) ──────────────────────────────

async function logFailure(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  agentType: string,
  message: string,
): Promise<void> {
  try {
    await service.from('ai_call_log').insert({
      call_type:     `chat_${agentType}`,
      model:         'claude-haiku-4-5-20251001',
      success:       false,
      from_cache:    false,
      error_message: message,
    })
  } catch { /* swallow — logging must never break the response */ }
}

// ── Output guardrail: inject disclaimer for financial content ────────────────

const FINANCIAL_KEYWORDS = /\b(buy|sell|trade|invest|bet|position|recommend|suggest|should\s+(?:you\s+)?(?:buy|sell|trade))\b/i

// ── Locale / currency guardrail ──────────────────────────────────────────────
// The platform operates across Africa, Europe and globally — there is NO
// India-specific context. Models otherwise tend to default monetary values to
// the Indian Rupee (₹). This is appended server-side to every agent's system
// prompt so it cannot be removed by editing a stored config.
const LOCALE_GUARDRAIL = `

OUTPUT RULES — always follow:
- Currency: NEVER use the Indian Rupee symbol (₹) or the words "INR" / "Rupee" / "Rs". The platform serves Africa, Europe and global markets and has no India-specific context. Present monetary amounts as plain numbers with thousands separators (e.g. "1.38M", "8,731.70") and NO currency symbol, unless the user explicitly names a currency.
- Do not invent country, locale or regulatory framing that was not provided in the data.`

// Hard output filter — strip any rupee / INR notation the model still emits.
function stripCurrencyLeak(text: string): string {
  return text
    .replace(/₹\s?/g, '')
    .replace(/\bINR\b\s?/g, '')
    .replace(/\bRs\.?\s?/g, '')
}

// ── Main route ────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { agent: string } },
) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { user, role } = await getAuthContext()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Validate agent type ───────────────────────────────────────────────────
  const agentType = params.agent as AgentType
  if (!ALLOWED_AGENTS.includes(agentType)) {
    return NextResponse.json({ error: 'Unknown agent' }, { status: 400 })
  }

  // ── Authorization: the company & MM-desk agents (with platform/ops tools)
  // are admin-only. Players may only talk to the player agent. Without this,
  // the agent type is just a URL param and any player could exfiltrate
  // platform metrics or other users' data via /api/chat/company.
  if (agentType !== 'player' && role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let messages: Array<{ role: 'user' | 'assistant'; content: any }>
  let sessionId: string
  try {
    const body = await req.json()
    messages  = Array.isArray(body.messages) ? body.messages : []
    sessionId = String(body.session_id ?? crypto.randomUUID())
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (messages.length === 0) {
    return NextResponse.json({ error: 'No messages' }, { status: 400 })
  }

  // ── Validate message shape (reject forged/malformed turns) ─────────────────
  // The client controls the full history; only allow well-formed user/assistant
  // turns with string content, cap the count, and require the last turn to be
  // from the user. Tool/forged content blocks are rejected before they reach
  // the model.
  if (messages.length > 40) {
    return NextResponse.json({ error: 'Conversation too long' }, { status: 400 })
  }
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') {
      return NextResponse.json({ error: 'Malformed message' }, { status: 400 })
    }
  }
  if (messages[messages.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'Last message must be from the user' }, { status: 400 })
  }

  // ── Rate limiting (per user per agent, 1-min window) ─────────────────────
  const service = await createServiceClient()
  const windowStart = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString()
  const rateKey = `chat_${agentType}_${user.id}`

  const { data: rateRow } = await service
    .from('api_rate_limits')
    .select('call_count')
    .eq('api_name', rateKey)
    .gte('window_start', windowStart)
    .single()

  // Load agent config for rate limits
  const { data: agentConfig } = await supabase
    .from('agent_configs')
    .select('*')
    .eq('agent_type', agentType)
    .eq('is_active', true)
    .single()

  const perMinuteLimit = agentConfig?.rate_limit_per_minute ?? 10

  if (rateRow && rateRow.call_count >= perMinuteLimit) {
    return NextResponse.json(
      { error: `Rate limit reached. Max ${perMinuteLimit} messages/minute.` },
      { status: 429 },
    )
  }

  // ── Input guardrails ──────────────────────────────────────────────────────
  const lastUserMessage = messages.filter(m => m.role === 'user').at(-1)
  const rawInput = lastUserMessage?.content ?? ''

  // Length cap
  const trimmedInput = rawInput.slice(0, 2000)

  // Prompt injection detection
  if (detectInjection(trimmedInput)) {
    await service.from('guardrail_log').insert({
      user_id:       user.id,
      agent_type:    agentType,
      rule:          'prompt_injection',
      input_snippet: trimmedInput.slice(0, 200),
      action_taken:  'blocked',
    })
    return NextResponse.json(
      { error: 'Message contains disallowed content.' },
      { status: 400 },
    )
  }

  // PII stripping
  const { cleaned: cleanedInput, hadPii } = stripPii(trimmedInput)
  if (hadPii) {
    await service.from('guardrail_log').insert({
      user_id:       user.id,
      agent_type:    agentType,
      rule:          'pii_detected',
      input_snippet: '[redacted]',
      action_taken:  'stripped',
    })
  }

  // Rebuild messages with cleaned last user message
  const cleanedMessages = messages.map((m, i) =>
    i === messages.length - 1 && m.role === 'user'
      ? { ...m, content: cleanedInput }
      : m,
  )

  // Trim to last 20 turns to bound context size
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contextMessages: Array<{ role: 'user' | 'assistant'; content: any }> = cleanedMessages.slice(-20)

  // ── Build tool list from config ───────────────────────────────────────────
  const enabledTools: string[] = Array.isArray(agentConfig?.tools_enabled)
    ? (agentConfig.tools_enabled as string[])
    : []
  const tools = enabledTools
    .filter(t => TOOL_DEFS[t])
    .map(t => TOOL_DEFS[t])

  // ── Call Haiku with streaming ─────────────────────────────────────────────
  const baseSystemPrompt = agentConfig?.system_prompt ?? 'You are a helpful assistant for the Verdikt prediction market platform.'
  const systemPrompt = baseSystemPrompt + LOCALE_GUARDRAIL
  const temperature  = Number(agentConfig?.temperature ?? 0.7)
  const maxTokens    = Number(agentConfig?.max_tokens ?? 1024)

  const startTime = Date.now()

  // Agentic tool loop (max 3 rounds to prevent infinite loops)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let currentMessages: Array<{ role: 'user' | 'assistant'; content: any }> = [...contextMessages]
  let finalText = ''
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let toolCallsMade: object[] = []
  let toolResultsMade: object[] = []

  // The ANTHROPIC_API_KEY lives in Supabase secrets, not the Next.js/Vercel
  // env, so we proxy the Messages call through the `anthropic-proxy` Edge
  // Function (which holds the key) using a service-role bearer. Guard: the
  // Supabase URL + service-role key must be present in this environment.
  const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const serviceRoleKey  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: 'AI is not configured: Supabase URL or service-role key is missing in this environment.' },
      { status: 503 },
    )
  }
  const proxyUrl = `${supabaseUrl}/functions/v1/anthropic-proxy`

  for (let round = 0; round < 3; round++) {
    let aiRes: Response
    try {
      aiRes = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: maxTokens,
          temperature,
          // Plain-string system prompt: these prompts are ~250 tokens, far
          // below Haiku's 2048-token cache minimum, so cache_control gives no
          // benefit and only risks a 400. Matches the proven generate-market route.
          system: systemPrompt,
          tools: tools.length > 0 ? tools : undefined,
          messages: currentMessages,
        }),
        signal: AbortSignal.timeout(28_000),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'network error'
      await logFailure(service, agentType, `fetch failed: ${msg}`)
      return NextResponse.json({ error: `AI request failed: ${msg}` }, { status: 502 })
    }

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => '')
      await logFailure(service, agentType, `HTTP ${aiRes.status}: ${errText.slice(0, 300)}`)
      // Surface the real upstream status + message so failures are diagnosable
      return NextResponse.json(
        { error: `AI service error (${aiRes.status}): ${errText.slice(0, 200) || 'no detail'}` },
        { status: 502 },
      )
    }

    const aiData = await aiRes.json()
    totalInputTokens  += aiData.usage?.input_tokens  ?? 0
    totalOutputTokens += aiData.usage?.output_tokens ?? 0

    const stopReason = aiData.stop_reason
    const content    = aiData.content ?? []

    // Extract text blocks
    const textBlocks = content.filter((c: { type: string }) => c.type === 'text')
    if (textBlocks.length > 0) {
      finalText = textBlocks.map((c: { text: string }) => c.text).join('\n')
    }

    // If no tool use, we're done
    if (stopReason !== 'tool_use') break

    // Process tool calls
    const toolUseBlocks = content.filter((c: { type: string }) => c.type === 'tool_use')
    if (toolUseBlocks.length === 0) break

    toolCallsMade = toolUseBlocks
    const toolResults = await Promise.all(
      toolUseBlocks.map(async (block: { id: string; name: string; input: Record<string, unknown> }) => ({
        type:        'tool_result' as const,
        tool_use_id: block.id,
        content:     await executeTool(block.name, block.input, user.id, supabase),
      })),
    )
    toolResultsMade = toolResults

    // Add assistant turn + tool results and loop
    currentMessages = [
      ...currentMessages,
      { role: 'assistant' as const, content },
      { role: 'user' as const, content: toolResults },
    ]
  }

  const latencyMs = Date.now() - startTime

  // ── Output guardrails ─────────────────────────────────────────────────────
  // Strip any rupee/INR notation that slipped past the system instruction.
  finalText = stripCurrencyLeak(finalText)

  if (FINANCIAL_KEYWORDS.test(finalText) && agentType === 'player') {
    finalText += '\n\n*This is not financial advice. Past performance does not guarantee future results.*'
  }

  // ── Persist chat message ──────────────────────────────────────────────────
  const { data: savedMsg } = await service.from('chat_messages').insert({
    session_id:    sessionId,
    user_id:       user.id,
    agent_type:    agentType,
    role:          'assistant',
    content:       finalText,
    tool_calls:    toolCallsMade.length > 0 ? toolCallsMade : null,
    tool_results:  toolResultsMade.length > 0 ? toolResultsMade : null,
    input_tokens:  totalInputTokens,
    output_tokens: totalOutputTokens,
    latency_ms:    latencyMs,
  }).select('id').single()

  // ── Log AI call ───────────────────────────────────────────────────────────
  await service.from('ai_call_log').insert({
    call_type:     `chat_${agentType}`,
    model:         'claude-haiku-4-5-20251001',
    input_tokens:  totalInputTokens,
    output_tokens: totalOutputTokens,
    latency_ms:    latencyMs,
    success:       true,
    from_cache:    false,
  })

  // ── Update rate limit counter ─────────────────────────────────────────────
  void service.from('api_rate_limits').upsert({
    api_name:    rateKey,
    window_start: windowStart,
    call_count:  (rateRow?.call_count ?? 0) + 1,
  }, { onConflict: 'api_name,window_start' })

  return NextResponse.json({
    message:    finalText,
    message_id: savedMsg?.id ?? null,
    session_id: sessionId,
    usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens, latency_ms: latencyMs },
  })
}
