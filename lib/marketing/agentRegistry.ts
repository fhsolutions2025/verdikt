// Agent Registry — the runtime contract for Section 23 ("AI Agent Configurations").
// The AI Agents screen edits these rows; the runtime reads them. This is the single
// source of truth for an agent's identity, model, permissions and runtime config.

import { createServiceClient } from '@/lib/supabase/server'

export interface AgentPermissions {
  read: boolean
  write: boolean
  generate: boolean
  publish: boolean
}

export interface AgentRetryPolicy {
  max_attempts: number
  backoff_seconds: number[]
}

// Full §23 attribute set (mirrors the agent_configs columns from migration 0042).
export interface AgentConfig {
  agent_type: string
  system_prompt: string
  mission: string
  responsibilities: string[]
  capabilities: string[]
  // Model / provider — null means "use the task router default".
  provider: 'anthropic' | 'openai' | null
  model: string | null
  temperature: number
  max_tokens: number
  streaming: boolean
  timeout_seconds: number
  retry_policy: AgentRetryPolicy
  // Governance
  permissions: AgentPermissions
  restrictions: string[]
  tools_enabled: string[]
  memory_sources: string[]
  output_schema: Record<string, unknown> | null
  escalation_target: string | null
  supported_asset_types: string[]
  supported_languages: string[]
  execution_priority: number
  rate_limit_per_minute: number
  rate_limit_per_day: number
  is_active: boolean
  version: number
}

const DEFAULT_PERMISSIONS: AgentPermissions = { read: true, write: true, generate: false, publish: false }
const DEFAULT_RETRY: AgentRetryPolicy = { max_attempts: 3, backoff_seconds: [1, 2, 4] }

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

// Load a complete §23 config for an agent. Returns null if the row is missing.
export async function loadAgentConfig(agentType: string): Promise<AgentConfig | null> {
  try {
    const svc = await createServiceClient()
    const { data } = await svc.from('agent_configs').select('*').eq('agent_type', agentType).maybeSingle()
    if (!data) return null
    const r = data as Record<string, unknown>
    return {
      agent_type: agentType,
      system_prompt: (r.system_prompt as string) ?? '',
      mission: (r.mission as string) ?? '',
      responsibilities: asStringArray(r.responsibilities),
      capabilities: asStringArray(r.capabilities),
      provider: (r.provider as AgentConfig['provider']) ?? null,
      model: (r.model as string) ?? null,
      temperature: Number(r.temperature ?? 0.7),
      max_tokens: Number(r.max_tokens ?? 1024),
      streaming: r.streaming !== false,
      timeout_seconds: Number(r.timeout_seconds ?? 60),
      retry_policy: (r.retry_policy as AgentRetryPolicy) ?? DEFAULT_RETRY,
      permissions: (r.permissions as AgentPermissions) ?? DEFAULT_PERMISSIONS,
      restrictions: asStringArray(r.restrictions),
      tools_enabled: asStringArray(r.tools_enabled),
      memory_sources: asStringArray(r.memory_sources),
      output_schema: (r.output_schema as Record<string, unknown> | null) ?? null,
      escalation_target: (r.escalation_target as string) ?? null,
      supported_asset_types: asStringArray(r.supported_asset_types),
      supported_languages: asStringArray(r.supported_languages),
      execution_priority: Number(r.execution_priority ?? 100),
      rate_limit_per_minute: Number(r.rate_limit_per_minute ?? 10),
      rate_limit_per_day: Number(r.rate_limit_per_day ?? 200),
      is_active: r.is_active !== false,
      version: Number(r.version ?? 1),
    }
  } catch {
    return null
  }
}

// §23 standard output contract — every agent returns this shape.
export interface StandardAgentResult<T = unknown> {
  status: 'success' | 'error'
  agent: string
  task: string
  result: T
  artifacts: string[]
  metadata: { model: string; latency_ms: number; cost: number }
}

// §23 permissions matrix enforcement helper — throws if an agent attempts a
// capability it isn't permitted. Runtime callers use this before acting.
export function assertPermission(cfg: AgentConfig | null, cap: keyof AgentPermissions): void {
  if (cfg && cfg.permissions[cap] === false) {
    throw new Error(`Agent "${cfg.agent_type}" is not permitted to ${cap}`)
  }
}
