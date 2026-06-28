import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { deriveQualityScore, downstreamOf } from '@/lib/marketing/assetIntelligence'

export const dynamic = 'force-dynamic'

// GET /api/company/marketing/v2/artifact?id=
// Asset inspector data: the artifact, its full version history, the comment thread
// (stored in mkt_activity type='comment'), and the downstream asset types that may
// need regeneration if this asset changes (dependency graph).
export async function GET(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const svc = await createServiceClient()
  const { data: artifact } = await svc.from('mkt_artifacts')
    .select('id,campaign_id,type,channel,status,title,created_by_agent,created_at,latest_version_id').eq('id', id).maybeSingle()
  if (!artifact) return NextResponse.json({ error: 'artifact not found' }, { status: 404 })

  const [{ data: versions }, { data: comments }] = await Promise.all([
    svc.from('mkt_artifact_versions').select('id,version,content,asset_url,source,created_at').eq('artifact_id', id).order('version', { ascending: false }),
    svc.from('mkt_activity').select('id,actor,text,created_at').eq('type', 'comment').eq('target_ref', id).order('created_at', { ascending: true }),
  ])

  const vlist = (versions ?? []).map(v => ({
    id: v.id as string, version: Number(v.version ?? 1), asset_url: (v.asset_url as string | null) ?? null,
    source: (v.source as string | null) ?? null, created_at: v.created_at as string,
    quality_score: deriveQualityScore(v.content),
  }))

  return NextResponse.json({
    artifact, versions: vlist, comments: comments ?? [], downstream: downstreamOf(artifact.type as string),
  })
}

// POST /api/company/marketing/v2/artifact  { id, action: 'approve'|'reject'|'comment', text? }
// Drives the human feedback loop. Approve/reject transitions the artifact status and
// records an approval; comment appends to the thread. Artifact status + activity are
// the source of truth the inspector reads.
export async function POST(req: Request) {
  const { user, role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, action, text } = await req.json().catch(() => ({})) as
    { id?: string; action?: 'approve' | 'reject' | 'comment'; text?: string }
  if (!id || !action) return NextResponse.json({ error: 'id and action are required' }, { status: 400 })

  const svc = await createServiceClient()
  const { data: artifact } = await svc.from('mkt_artifacts').select('id,campaign_id,type,title,latest_version_id').eq('id', id).maybeSingle()
  if (!artifact) return NextResponse.json({ error: 'artifact not found' }, { status: 404 })
  const campaignId = artifact.campaign_id as string | null

  if (action === 'comment') {
    const body = (text ?? '').trim()
    if (!body) return NextResponse.json({ error: 'text is required' }, { status: 400 })
    await svc.from('mkt_activity').insert({ campaign_id: campaignId, type: 'comment', actor: 'Operator', text: body.slice(0, 2000), target_ref: id })
    return NextResponse.json({ ok: true })
  }

  const status = action === 'approve' ? 'approved' : 'rejected'
  await svc.from('mkt_artifacts').update({ status }).eq('id', id)
  // Record the decision (best-effort; status + activity are authoritative).
  await svc.from('mkt_approvals').insert({
    artifact_id: id, artifact_version_id: artifact.latest_version_id ?? null, campaign_id: campaignId,
    gate: 'human', decision: status, approver_id: user?.id ?? null, comment: (text ?? '').slice(0, 2000) || null,
  }).then(() => {}, () => {})
  await svc.from('mkt_activity').insert({
    campaign_id: campaignId, type: 'approval', actor: 'Operator',
    text: `${status === 'approved' ? 'Approved' : 'Rejected'} ${artifact.title ?? 'asset'}${text ? ` — ${text}` : ''}`.slice(0, 200),
    target_ref: id,
  })
  return NextResponse.json({ ok: true, status })
}
