import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// PATCH /api/company/marketing/v2/director/asset  { task_id, url }
// Sets the chosen image variation as the asset's primary (spec § Automatic Variations
// — "users compare before approval"). Updates both the task output url and the linked
// artifact's latest version asset_url so the pick persists.
export async function PATCH(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { task_id, url } = await req.json().catch(() => ({})) as { task_id?: string; url?: string }
  if (!task_id || !url) return NextResponse.json({ error: 'task_id and url are required' }, { status: 400 })

  const svc = await createServiceClient()
  const { data: task } = await svc.from('mkt_agent_tasks').select('id,outputs').eq('id', task_id).maybeSingle()
  if (!task) return NextResponse.json({ error: 'task not found' }, { status: 404 })

  const outputs = (task.outputs ?? {}) as Record<string, unknown>
  const variations = Array.isArray(outputs.variations) ? outputs.variations as { url: string }[] : []
  // Only allow selecting one of this asset's own generated variations.
  if (variations.length && !variations.some(v => v.url === url)) {
    return NextResponse.json({ error: 'url is not one of this asset’s variations' }, { status: 400 })
  }

  await svc.from('mkt_agent_tasks').update({ outputs: { ...outputs, url } }).eq('id', task_id)
  const artifactId = outputs.artifact_id as string | undefined
  if (artifactId) {
    const { data: art } = await svc.from('mkt_artifacts').select('latest_version_id').eq('id', artifactId).maybeSingle()
    if (art?.latest_version_id) {
      await svc.from('mkt_artifact_versions').update({ asset_url: url }).eq('id', art.latest_version_id)
    }
  }
  return NextResponse.json({ ok: true, url })
}
