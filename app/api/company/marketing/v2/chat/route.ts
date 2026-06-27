import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { planCampaign } from '@/lib/marketing/orchestrator'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Basic injection screen (reuses the spirit of app/api/chat/[agent] guardrails).
const INJECTION = [
  /ignore\s+(previous|all|prior)\s+instructions?/i,
  /disable\s+(?:your\s+)?(?:safety|guardrails|restrictions)/i,
  /system\s*prompt\s*:/i,
]

// POST /api/company/marketing/v2/chat  { campaign_id, message }
// MVP control surface: a command to (re)plan the campaign. Returns a status card.
export async function POST(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { campaign_id, message } = await req.json().catch(() => ({}))
  if (typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }
  if (INJECTION.some(rx => rx.test(message))) {
    return NextResponse.json({ error: 'Message rejected by input guardrail' }, { status: 422 })
  }
  if (!campaign_id) {
    return NextResponse.json({
      reply: 'Select or create a campaign first, then tell me the goal and I will plan it.',
      events: [],
    })
  }

  const svc = await createServiceClient()
  // Record the operator turn.
  await svc.from('mkt_activity').insert({ campaign_id, type: 'agent.step', actor: 'Operator', text: message.slice(0, 200) })

  try {
    const { plan } = await planCampaign(campaign_id)
    return NextResponse.json({
      reply: `Planned a ${plan.content_items.length}-item campaign. Review the plan to start generation.`,
      plan_ready: true,
      plan,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
