import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth'

const ALLOWED_AGENT_TYPES = [
  'player', 'company', 'mm_desk',
  'campaign_director_agent', 'mkt_copywriter', 'mkt_prompt_optimizer', 'mkt_router',
  'mkt_brand_guardian', 'mkt_compliance', 'mkt_seo', 'mkt_reviewer',
  'mkt_knowledge_researcher', 'mkt_creative_designer', 'mkt_video_producer', 'qa_agent',
]

const DEFAULT_PERMISSIONS = { read: true, write: true, generate: false, publish: false }

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map(s => s.trim()).filter(Boolean) : []
}

export async function GET() {
  const { user, role } = await getAuthContext()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = await createServiceClient()
  const { data, error } = await service
    .from('agent_configs')
    .select('*')
    .order('agent_type')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ configs: data })
}

export async function PUT(req: NextRequest) {
  const { user, role } = await getAuthContext()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const agentType = String(body.agent_type ?? '')
  if (!ALLOWED_AGENT_TYPES.includes(agentType)) {
    return NextResponse.json({ error: 'Invalid agent_type' }, { status: 400 })
  }

  const systemPrompt = String(body.system_prompt ?? '').slice(0, 8000)
  if (!systemPrompt) return NextResponse.json({ error: 'Missing system_prompt' }, { status: 400 })

  // ── Existing numeric / scalar fields ───────────────────────────────────────
  const temperature          = Math.min(Math.max(Number(body.temperature ?? 0.7), 0), 1)
  const maxTokens            = Math.min(Math.max(Math.round(Number(body.max_tokens ?? 1024)), 256), 4096)
  const rateLimitPerMinute   = Math.min(Math.max(Math.round(Number(body.rate_limit_per_minute ?? 10)), 1), 60)
  const rateLimitPerDay      = Math.min(Math.max(Math.round(Number(body.rate_limit_per_day ?? 200)), 10), 5000)
  const isActive             = Boolean(body.is_active ?? true)
  const toolsEnabled         = asStringArray(body.tools_enabled)

  // ── §23 — Model / provider (null = use task-router default) ─────────────────
  let provider: 'anthropic' | 'openai' | null = null
  if (body.provider === 'anthropic' || body.provider === 'openai') provider = body.provider
  const modelRaw = body.model == null ? '' : String(body.model).trim()
  const model: string | null = modelRaw ? modelRaw.slice(0, 200) : null

  // ── §23 — Identity ─────────────────────────────────────────────────────────
  const mission          = String(body.mission ?? '').slice(0, 4000)
  const responsibilities = asStringArray(body.responsibilities)
  const capabilities     = asStringArray(body.capabilities)
  const restrictions     = asStringArray(body.restrictions)
  const memorySources    = asStringArray(body.memory_sources)

  // ── §23 — Runtime ──────────────────────────────────────────────────────────
  const streaming       = Boolean(body.streaming ?? true)
  const timeoutSeconds  = Math.min(Math.max(Math.round(Number(body.timeout_seconds ?? 60)), 1), 600)

  let retryPolicy: { max_attempts: number; backoff_seconds: number[] } = { max_attempts: 3, backoff_seconds: [1, 2, 4] }
  const rp = body.retry_policy
  if (rp && typeof rp === 'object') {
    const r = rp as Record<string, unknown>
    const maxAttempts = Math.min(Math.max(Math.round(Number(r.max_attempts ?? 3)), 1), 10)
    const backoff = Array.isArray(r.backoff_seconds)
      ? r.backoff_seconds.map(n => Math.max(0, Number(n))).filter(n => Number.isFinite(n))
      : [1, 2, 4]
    retryPolicy = { max_attempts: maxAttempts, backoff_seconds: backoff.length ? backoff : [1, 2, 4] }
  }

  // ── §23 — Permissions matrix ───────────────────────────────────────────────
  let permissions = { ...DEFAULT_PERMISSIONS }
  const p = body.permissions
  if (p && typeof p === 'object') {
    const pr = p as Record<string, unknown>
    permissions = {
      read:     Boolean(pr.read ?? true),
      write:    Boolean(pr.write ?? true),
      generate: Boolean(pr.generate ?? false),
      publish:  Boolean(pr.publish ?? false),
    }
  }

  // ── §23 — Output schema (nullable JSON object) ─────────────────────────────
  let outputSchema: Record<string, unknown> | null = null
  if (body.output_schema != null) {
    if (typeof body.output_schema === 'object' && !Array.isArray(body.output_schema)) {
      outputSchema = body.output_schema as Record<string, unknown>
    } else {
      return NextResponse.json({ error: 'output_schema must be a JSON object or null' }, { status: 400 })
    }
  }

  // ── §23 — Governance ───────────────────────────────────────────────────────
  const escRaw = body.escalation_target == null ? '' : String(body.escalation_target).trim()
  const escalationTarget: string | null = escRaw ? escRaw.slice(0, 200) : null
  const executionPriority   = Math.min(Math.max(Math.round(Number(body.execution_priority ?? 100)), 0), 1000)
  const supportedAssetTypes = asStringArray(body.supported_asset_types)
  const supportedLanguages  = asStringArray(body.supported_languages)

  const service = await createServiceClient()

  // ── Snapshot the current row into version history BEFORE updating ───────────
  const { data: current, error: readErr } = await service
    .from('agent_configs')
    .select('*')
    .eq('agent_type', agentType)
    .maybeSingle()

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!current) return NextResponse.json({ error: 'Agent config not found' }, { status: 404 })

  const currentVersion = Number((current as Record<string, unknown>).version ?? 1)

  const { error: snapErr } = await service
    .from('agent_config_versions')
    .insert({
      agent_type: agentType,
      version:    currentVersion,
      snapshot:   current,
      changed_by: user.id,
    })

  if (snapErr) return NextResponse.json({ error: snapErr.message }, { status: 500 })

  // ── Update with the full §23 attribute set; bump version ───────────────────
  const { data, error } = await service
    .from('agent_configs')
    .update({
      system_prompt:         systemPrompt,
      temperature,
      max_tokens:            maxTokens,
      rate_limit_per_minute: rateLimitPerMinute,
      rate_limit_per_day:    rateLimitPerDay,
      is_active:             isActive,
      tools_enabled:         toolsEnabled,
      // §23
      provider,
      model,
      mission,
      responsibilities,
      capabilities,
      restrictions,
      memory_sources:        memorySources,
      streaming,
      timeout_seconds:       timeoutSeconds,
      retry_policy:          retryPolicy,
      permissions,
      output_schema:         outputSchema,
      escalation_target:     escalationTarget,
      execution_priority:    executionPriority,
      supported_asset_types: supportedAssetTypes,
      supported_languages:   supportedLanguages,
      version:               currentVersion + 1,
    })
    .eq('agent_type', agentType)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ config: data })
}
