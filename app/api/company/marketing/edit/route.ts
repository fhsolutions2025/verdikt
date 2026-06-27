import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function falProxyUrl() {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/functions/v1/fal-proxy`
}
function svcAuth() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}` }
}

// Editing modes → fal endpoint + required inputs. IDs verify-on-first-run (egress).
const MODES = {
  fill:    { model: 'fal-ai/flux-pro/v1/fill',            needsMask: true,  needsPrompt: true  },
  'text':  { model: 'fal-ai/image-editing/text-removal',   needsMask: false, needsPrompt: false },
  'object':{ model: 'fal-ai/image-editing/object-removal', needsMask: true,  needsPrompt: false },
} as const
type Mode = keyof typeof MODES

// POST { mode, image_url, mask_url?, prompt? } → run a synchronous fal edit → { url }.
export async function POST(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { mode, image_url, mask_url, prompt } = await req.json().catch(() => ({})) as
    { mode?: Mode; image_url?: string; mask_url?: string; prompt?: string }
  const cfg = mode ? MODES[mode] : undefined
  if (!cfg) return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
  if (!image_url) return NextResponse.json({ error: 'image_url is required' }, { status: 400 })
  if (cfg.needsMask && !mask_url) return NextResponse.json({ error: 'Paint a mask first (brush the area to edit)' }, { status: 400 })
  if (cfg.needsPrompt && !prompt?.trim()) return NextResponse.json({ error: 'A prompt is required for Magic Fill' }, { status: 400 })

  const input: Record<string, unknown> = { image_url }
  if (cfg.needsMask)   input.mask_url = mask_url
  if (cfg.needsPrompt) input.prompt = prompt

  const res = await fetch(falProxyUrl(), {
    method: 'POST', headers: svcAuth(),
    body: JSON.stringify({ op: 'edit', model: cfg.model, input }),
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok || !d.url) {
    return NextResponse.json({ error: d.error ? `Edit failed — ${d.error}` : 'Edit failed' }, { status: res.status || 502 })
  }
  const svc = await createServiceClient()
  await svc.from('ai_call_log').insert({ call_type: 'fal-edit', model: cfg.model, success: true, from_cache: false }).then(() => {}, () => {})
  return NextResponse.json({ url: d.url, model: cfg.model })
}
