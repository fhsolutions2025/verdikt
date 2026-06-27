import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// POST /api/company/marketing/v2/approvals
// { artifact_id?, campaign_id?, gate: "plan"|"artifact"|"publish", decision, comment?, justification? }
export async function POST(req: Request) {
  const { user, role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { artifact_id, campaign_id, gate, decision, comment, justification } = body
  if (!gate || !decision) return NextResponse.json({ error: 'gate and decision are required' }, { status: 400 })

  const svc = await createServiceClient()

  // Resolve campaign + latest version for an artifact gate.
  let resolvedCampaign = campaign_id ?? null
  let latestVersionId: string | null = null
  let complianceVerdict: string | null = null

  if (artifact_id) {
    const { data: artifact } = await svc.from('mkt_artifacts').select('id, campaign_id, latest_version_id, status').eq('id', artifact_id).single()
    if (!artifact) return NextResponse.json({ error: 'artifact not found' }, { status: 404 })
    resolvedCampaign = artifact.campaign_id
    latestVersionId = artifact.latest_version_id
    if (latestVersionId) {
      const { data: ver } = await svc.from('mkt_artifact_versions').select('compliance_result').eq('id', latestVersionId).single()
      complianceVerdict = (ver?.compliance_result as { verdict?: string } | null)?.verdict ?? null
    }

    // Block approval of a compliance-blocked artifact unless an override justification is given.
    if (decision === 'approved' && complianceVerdict === 'block' && !justification?.trim()) {
      return NextResponse.json({
        error: 'Cannot approve: compliance blocked this artifact. Provide an override justification to proceed.',
        code: 'compliance_block',
      }, { status: 422 })
    }
  }

  const { data: approval, error } = await svc.from('mkt_approvals').insert({
    artifact_id: artifact_id ?? null, artifact_version_id: latestVersionId,
    campaign_id: resolvedCampaign, gate, decision,
    approver_id: user?.id ?? null, comment: comment ?? null, justification: justification ?? null,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Reflect the decision on the artifact status.
  let artifactStatus: string | undefined
  if (artifact_id) {
    artifactStatus = decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : 'changes_requested'
    await svc.from('mkt_artifacts').update({ status: artifactStatus }).eq('id', artifact_id)
  }

  await svc.from('mkt_activity').insert({
    campaign_id: resolvedCampaign, type: 'approval.decided', actor: 'Reviewer',
    text: `${gate} ${decision}${justification ? ' (override)' : ''}`, target_ref: artifact_id ?? null,
    severity: decision === 'approved' ? 'info' : 'warn',
  })

  return NextResponse.json({ approval, artifact_status: artifactStatus }, { status: 201 })
}
