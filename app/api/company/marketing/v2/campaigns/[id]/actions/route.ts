import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Action = 'rename' | 'duplicate' | 'archive' | 'delete'

function isAction(v: unknown): v is Action {
  return v === 'rename' || v === 'duplicate' || v === 'archive' || v === 'delete'
}

// POST /api/company/marketing/v2/campaigns/[id]/actions — campaign lifecycle (rename/duplicate/archive/delete)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const parsed = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const action = parsed.action
  if (!isAction(action)) return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  const name = typeof parsed.name === 'string' ? parsed.name : undefined

  const svc = await createServiceClient()

  const logActivity = (text: string) => {
    svc
      .from('mkt_activity')
      .insert({ campaign_id: id, type: 'campaign', actor: 'Operator', text, target_ref: id })
      .then(
        () => {},
        () => {},
      )
  }

  if (action === 'rename') {
    const trimmed = name?.trim()
    if (!trimmed) return NextResponse.json({ error: 'name is required' }, { status: 400 })
    const { error } = await svc.from('mkt_campaigns').update({ name: trimmed }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    logActivity(`Renamed campaign to "${trimmed}"`)
    return NextResponse.json({ ok: true, name: trimmed })
  }

  if (action === 'archive') {
    const { error } = await svc.from('mkt_campaigns').update({ status: 'archived' }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    logActivity('Archived campaign')
    return NextResponse.json({ ok: true, status: 'archived' })
  }

  if (action === 'duplicate') {
    const { data: campaign, error } = await svc
      .from('mkt_campaigns')
      .select('*')
      .eq('id', id)
      .single()
    if (error || !campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: created, error: insertError } = await svc
      .from('mkt_campaigns')
      .insert({
        brand_id: campaign.brand_id,
        name: `${campaign.name} (copy)`,
        goal: campaign.goal,
        status: 'DRAFT',
        region: campaign.region,
        plan: campaign.plan,
        start_date: campaign.start_date,
        end_date: campaign.end_date,
        budget_usd: campaign.budget_usd,
        created_by: user?.id ?? null,
      })
      .select('id')
      .single()
    if (insertError || !created) {
      return NextResponse.json({ error: insertError?.message ?? 'Failed to duplicate' }, { status: 500 })
    }
    const newId = created.id

    const { data: brief } = await svc
      .from('mkt_campaign_briefs')
      .select('*')
      .eq('campaign_id', id)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (brief) {
      await svc.from('mkt_campaign_briefs').insert({
        campaign_id: newId,
        goal: brief.goal,
        audience: brief.audience,
        channels: brief.channels,
        region: brief.region,
        start_date: brief.start_date,
        end_date: brief.end_date,
        budget_usd: brief.budget_usd,
        constraints: brief.constraints,
        raw_input: brief.raw_input,
      })
    }

    logActivity(`Duplicated campaign to "${campaign.name} (copy)"`)
    return NextResponse.json({ ok: true, id: newId })
  }

  // action === 'delete'
  await svc.from('mkt_campaign_briefs').delete().eq('campaign_id', id)
  const { error: deleteError } = await svc.from('mkt_campaigns').delete().eq('id', id)
  if (deleteError) {
    const { error: archiveError } = await svc
      .from('mkt_campaigns')
      .update({ status: 'archived' })
      .eq('id', id)
    if (archiveError) return NextResponse.json({ error: archiveError.message }, { status: 500 })
    logActivity('Archived campaign (delete fell back to archive)')
    return NextResponse.json({ ok: true, archived: true })
  }
  logActivity('Deleted campaign')
  return NextResponse.json({ ok: true })
}
