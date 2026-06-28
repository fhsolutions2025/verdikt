import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { complete, getAgentPrompt } from '@/lib/marketing/agents'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Basic injection screen (same spirit as the other marketing chat routes).
const INJECTION = [
  /ignore\s+(previous|all|prior)\s+instructions?/i,
  /disable\s+(?:your\s+)?(?:safety|guardrails|restrictions)/i,
  /system\s*prompt\s*:/i,
]

const DIRECTOR_FALLBACK = `You are the VERDIKT Campaign Director, a proactive, curious creative manager. Answer the operator's question helpfully and concisely. Never invent stats, odds, or guarantees; respect brand voice and the campaign region's compliance rules.`

// POST /api/company/marketing/v2/director/chat  { message, campaign_id? }
// A live, conversational reply from the Director (uses its editable agent_configs
// system prompt). Returns { reply }.
export async function POST(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { message, campaign_id } = await req.json().catch(() => ({})) as { message?: string; campaign_id?: string }
  if (typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }
  if (INJECTION.some(rx => rx.test(message))) {
    return NextResponse.json({ error: 'Message rejected by input guardrail' }, { status: 422 })
  }

  // Optional campaign context so answers are grounded.
  let context = ''
  if (campaign_id) {
    try {
      const svc = await createServiceClient()
      const { data: c } = await svc.from('mkt_campaigns').select('name,goal,region,plan').eq('id', campaign_id).maybeSingle()
      if (c) {
        const plan = (c.plan ?? {}) as { brief?: { vertical?: string; audience?: string } }
        context = `\nCurrent campaign: ${c.name ?? ''} (goal: ${c.goal ?? '—'}, region: ${c.region ?? '—'}, vertical: ${plan.brief?.vertical ?? '—'}, audience: ${plan.brief?.audience ?? '—'}).`
      }
    } catch { /* context is best-effort */ }
  }

  const instr = await getAgentPrompt('campaign_director_agent', DIRECTOR_FALLBACK)
  try {
    const { text } = await complete({
      task: 'copywriting',
      system: `${instr}${context}\nReply in 1-4 short sentences, plain text (no JSON).`,
      messages: [{ role: 'user', content: message.slice(0, 2000) }],
    })
    return NextResponse.json({ reply: text?.trim() || 'Got it.' })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
