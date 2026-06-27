import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// POST /api/company/marketing/v2/artifacts/[id]/export — download an approved artifact
// Approval-gated (P4) and compliance-gated: blocked artifacts cannot be exported.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  const svc = await createServiceClient()
  const { data: artifact } = await svc.from('mkt_artifacts').select('*').eq('id', id).single()
  if (!artifact) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (artifact.status !== 'approved') {
    return NextResponse.json({ error: 'Artifact not approved', code: 'not_approved' }, { status: 409 })
  }

  const { data: version } = await svc.from('mkt_artifact_versions').select('*').eq('id', artifact.latest_version_id).single()
  if (!version) return NextResponse.json({ error: 'No version to export' }, { status: 404 })

  const verdict = (version.compliance_result as { verdict?: string } | null)?.verdict
  if (verdict === 'block') {
    return NextResponse.json({ error: 'Compliance blocked — cannot export', code: 'compliance_block' }, { status: 422 })
  }

  // Build a downloadable payload by type.
  const content = version.content as Record<string, unknown> | null
  let filename = `verdikt-${artifact.type}-${id.slice(0, 8)}`
  let mime = 'text/plain; charset=utf-8'
  let body = ''

  if (artifact.type === 'blog') {
    mime = 'text/markdown; charset=utf-8'; filename += '.md'
    body = `# ${content?.title ?? ''}\n\n${content?.body_markdown ?? ''}\n\n---\n${content?.cta ?? ''}\n`
  } else if (artifact.type === 'social') {
    filename += '.txt'
    const tags = Array.isArray(content?.hashtags) ? (content!.hashtags as string[]).join(' ') : ''
    body = `${content?.caption ?? ''}\n\n${tags}\n`
  } else if (artifact.type === 'image') {
    // Image export returns the hosted asset URL.
    await svc.from('mkt_activity').insert({ campaign_id: artifact.campaign_id, type: 'export.done', actor: 'Publisher', text: `Exported image ${artifact.title}`, target_ref: id })
    await svc.from('mkt_artifacts').update({ status: 'exported' }).eq('id', id)
    return NextResponse.json({ url: version.asset_url, type: 'image' })
  } else {
    filename += '.json'; mime = 'application/json'
    body = JSON.stringify(content ?? {}, null, 2)
  }

  await svc.from('mkt_artifacts').update({ status: 'exported' }).eq('id', id)
  await svc.from('mkt_activity').insert({ campaign_id: artifact.campaign_id, type: 'export.done', actor: 'Publisher', text: `Exported ${artifact.type}: ${artifact.title}`.slice(0, 160), target_ref: id })

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
