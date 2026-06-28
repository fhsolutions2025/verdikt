import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { recallBrief } from '@/lib/marketing/memory'

export const dynamic = 'force-dynamic'

// GET /api/company/marketing/v2/director/memory?brand_id=
// Returns the durable brief facts the Director already remembers for a brand, so
// the interview can prefill them instead of re-asking (spec § Campaign Memory).
export async function GET(req: Request) {
  const { role } = await getAuthContext()
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const brandId = new URL(req.url).searchParams.get('brand_id')
  if (!brandId) return NextResponse.json({ error: 'brand_id is required' }, { status: 400 })

  const svc = await createServiceClient()
  const facts = await recallBrief(svc, brandId)
  return NextResponse.json({ facts })
}
