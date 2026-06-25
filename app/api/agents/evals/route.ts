import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get feedback + latency stats grouped by agent_type
  const { data: feedback } = await supabase
    .from('agent_feedback')
    .select('rating, message_id, chat_messages!inner(agent_type, latency_ms)')

  const stats: Record<string, {
    total: number; thumbsUp: number; thumbsDown: number
    totalLatency: number; latencyCount: number; avgLatencyMs: number | null
  }> = {}

  for (const row of feedback ?? []) {
    const msgs = row.chat_messages as unknown as { agent_type: string; latency_ms: number | null }[]
    const agentType = Array.isArray(msgs) ? msgs[0]?.agent_type : (msgs as { agent_type: string }).agent_type
    const latency   = Array.isArray(msgs) ? msgs[0]?.latency_ms : (msgs as { latency_ms: number | null }).latency_ms

    if (!agentType) continue
    if (!stats[agentType]) {
      stats[agentType] = { total: 0, thumbsUp: 0, thumbsDown: 0, totalLatency: 0, latencyCount: 0, avgLatencyMs: null }
    }
    stats[agentType].total++
    if (row.rating === 1) stats[agentType].thumbsUp++
    if (row.rating === -1) stats[agentType].thumbsDown++
    if (latency != null) { stats[agentType].totalLatency += latency; stats[agentType].latencyCount++ }
  }

  // Compute averages
  for (const s of Object.values(stats)) {
    s.avgLatencyMs = s.latencyCount > 0 ? s.totalLatency / s.latencyCount : null
  }

  return NextResponse.json({ stats })
}
