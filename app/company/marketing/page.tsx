import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth'
import { MarketingWorkspace } from '@/components/company/marketing/MarketingWorkspace'

export const dynamic = 'force-dynamic'

export default async function MarketingWorkspacePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { role } = await getAuthContext()
  if (role !== 'admin') redirect('/company')

  const svc = await createServiceClient()
  const [brandsRes, campaignsRes, assetsRes, regionsRes] = await Promise.all([
    svc.from('mkt_brands').select('*').order('created_at', { ascending: false }),
    svc.from('mkt_campaigns').select('*').order('created_at', { ascending: false }),
    svc.from('marketing_assets').select('id, public_url, title, alt_text, dimensions, created_at').order('created_at', { ascending: false }).limit(60),
    svc.from('mkt_compliance_regions').select('region, framing, enabled').eq('enabled', true).order('region'),
  ])

  return (
    <MarketingWorkspace
      initialBrands={brandsRes.data ?? []}
      initialCampaigns={campaignsRes.data ?? []}
      initialAssets={assetsRes.data ?? []}
      regions={regionsRes.data ?? []}
    />
  )
}
