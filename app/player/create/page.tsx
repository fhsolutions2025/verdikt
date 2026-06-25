import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PlayerTabBar } from '@/components/player/PlayerTabBar'
import { CreateMarketClient } from '@/components/player/CreateMarketClient'
import type { Market } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function CreatePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const submissionsRes = await supabase
    .from('markets')
    .select('*')
    .eq('created_by', user.id)
    .eq('creator_type', 'player_mm')
    .order('created_at', { ascending: false })
  const submissions = (submissionsRes.data ?? []) as Market[]

  return (
    <main className="min-h-screen pb-24" style={{ backgroundColor: 'var(--bg-base)' }}>
      <CreateMarketClient playerId={user.id} initialSubmissions={submissions} />
      <PlayerTabBar active="create" />
    </main>
  )
}
