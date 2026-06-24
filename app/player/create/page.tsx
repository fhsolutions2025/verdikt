import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PlayerTabBar } from '@/components/player/PlayerTabBar'

export const dynamic = 'force-dynamic'

export default async function CreatePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <main className="min-h-screen pb-24" style={{ backgroundColor: '#FAFAF5' }}>
      <div className="max-w-[420px] mx-auto px-4 pt-6 text-center py-16">
        <p className="text-2xl mb-3">✨</p>
        <h2 className="font-bold text-lg mb-2" style={{ color: '#111A11' }}>
          Bring Your Verdikt
        </h2>
        <p className="text-sm" style={{ color: '#6B7280' }}>
          Submit any yes/no question and earn from every trade.
          Coming in Phase 2.
        </p>
      </div>
      <PlayerTabBar active="create" />
    </main>
  )
}
