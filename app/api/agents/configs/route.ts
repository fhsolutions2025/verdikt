import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth'

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
  if (!['player', 'company', 'mm_desk', 'campaign_director_agent', 'mkt_copywriter', 'mkt_prompt_optimizer', 'mkt_router'].includes(agentType)) {
    return NextResponse.json({ error: 'Invalid agent_type' }, { status: 400 })
  }

  const systemPrompt = String(body.system_prompt ?? '').slice(0, 8000)
  if (!systemPrompt) return NextResponse.json({ error: 'Missing system_prompt' }, { status: 400 })

  const temperature          = Math.min(Math.max(Number(body.temperature ?? 0.7), 0), 1)
  const maxTokens            = Math.min(Math.max(Math.round(Number(body.max_tokens ?? 1024)), 256), 4096)
  const rateLimitPerMinute   = Math.min(Math.max(Math.round(Number(body.rate_limit_per_minute ?? 10)), 1), 60)
  const rateLimitPerDay      = Math.min(Math.max(Math.round(Number(body.rate_limit_per_day ?? 200)), 10), 5000)
  const isActive             = Boolean(body.is_active ?? true)
  const toolsEnabled         = Array.isArray(body.tools_enabled) ? body.tools_enabled.map(String) : []

  const service = await createServiceClient()

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
      version:               (body.version as number ?? 1) + 1,
    })
    .eq('agent_type', agentType)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ config: data })
}
