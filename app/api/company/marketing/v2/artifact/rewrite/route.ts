import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { complete } from '@/lib/llm/router'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Text artifact types that the Rewrite Engine can operate on.
const REWRITABLE_TYPES = ['social', 'copy', 'blog'] as const

// Pull the current human-readable text out of a version's jsonb `content`.
// For copy this lives at content.body; otherwise fall back to the raw JSON.
function readBody(content: unknown): string {
  if (content && typeof content === 'object' && 'body' in content) {
    const body = (content as { body?: unknown }).body
    if (typeof body === 'string') return body
  }
  return JSON.stringify(content)
}

const REWRITE_SYSTEM = [
  'You are a marketing copy editor for Verdikt, a play-money prediction-market app.',
  'Rewrite the supplied marketing copy by applying the operator instruction.',
  'Keep it on-brand, clear, and concise. Never invent statistics, prices, or odds.',
  'Never use the phrase "risk-free" and never promise winnings or guaranteed returns.',
  'Return ONLY the revised copy text — no preamble, no explanation, no markdown fences.',
].join(' ')

// POST /api/company/marketing/v2/artifact/rewrite  { artifact_id, instruction }
// Rewrite Engine: a natural-language edit on a text artifact that produces a NEW
// version (Human Feedback Loop). Only text-type artifacts are rewritable.
export async function POST(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { artifact_id, instruction } = await req.json().catch(() => ({})) as
    { artifact_id?: string; instruction?: string }
  if (!artifact_id || !instruction) {
    return NextResponse.json({ error: 'artifact_id and instruction are required' }, { status: 400 })
  }

  const svc = await createServiceClient()
  const { data: artifact } = await svc.from('mkt_artifacts')
    .select('id,campaign_id,type,title,latest_version_id')
    .eq('id', artifact_id).maybeSingle()
  if (!artifact) return NextResponse.json({ error: 'artifact not found' }, { status: 404 })

  const type = artifact.type as string
  if (!REWRITABLE_TYPES.includes(type as typeof REWRITABLE_TYPES[number])) {
    return NextResponse.json({ error: 'Only text assets can be rewritten' }, { status: 422 })
  }

  const campaignId = artifact.campaign_id as string | null
  const title = (artifact.title as string | null) ?? 'asset'

  // Read the current text from the latest version.
  let currentText = ''
  const latestVersionId = artifact.latest_version_id as string | null
  if (latestVersionId) {
    const { data: latest } = await svc.from('mkt_artifact_versions')
      .select('content').eq('id', latestVersionId).maybeSingle()
    if (latest) currentText = readBody(latest.content)
  }

  // Run the rewrite.
  const result = await complete({
    task: 'copywriting',
    system: REWRITE_SYSTEM,
    messages: [{ role: 'user', content: `Current copy:\n${currentText}\n\nRewrite instruction: ${instruction}` }],
  })
  const newText = result.text.trim()

  // Next version number = current max for this artifact + 1.
  const { data: maxRow } = await svc.from('mkt_artifact_versions')
    .select('version').eq('artifact_id', artifact_id)
    .order('version', { ascending: false }).limit(1).maybeSingle()
  const currentMax = maxRow ? Number(maxRow.version ?? 0) : 0
  const nextVersion = currentMax + 1

  // Insert the new version, repoint the artifact, flag for review.
  const { data: inserted, error: insertErr } = await svc.from('mkt_artifact_versions')
    .insert({
      artifact_id,
      version: nextVersion,
      content: { body: newText, rewritten_from: instruction },
      source: 'rewrite',
    })
    .select('id').single()
  if (insertErr || !inserted) {
    return NextResponse.json({ error: insertErr?.message ?? 'failed to write version' }, { status: 500 })
  }

  await svc.from('mkt_artifacts')
    .update({ latest_version_id: inserted.id, status: 'needs_review' })
    .eq('id', artifact_id)

  await svc.from('mkt_activity').insert({
    campaign_id: campaignId,
    type: 'rewrite',
    actor: 'Operator',
    text: `Rewrote ${title}: ${instruction.slice(0, 140)}`.slice(0, 200),
    target_ref: artifact_id,
  })

  return NextResponse.json({ ok: true, version: nextVersion, body: newText })
}
