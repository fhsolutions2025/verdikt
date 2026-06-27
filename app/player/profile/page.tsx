import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PlayerTabBar } from '@/components/player/PlayerTabBar'

export const dynamic = 'force-dynamic'

// The player's own account page (user data — not CMS). Shows identity, balance
// and a couple of quick stats from their positions.
export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileRes, walletRes, posRes] = await Promise.all([
    supabase.from('profiles').select('display_name, role, created_at').eq('id', user.id).single(),
    supabase.from('wallets').select('balance').eq('player_id', user.id).single(),
    supabase.from('positions').select('entry_value').eq('player_id', user.id),
  ])

  const profile = profileRes.data as { display_name: string | null; role: string; created_at: string } | null
  const balance = (walletRes.data?.balance as number | undefined) ?? 0
  const positions = (posRes.data ?? []) as { entry_value: number | null }[]
  const invested = positions.reduce((s, p) => s + Number(p.entry_value ?? 0), 0)

  const name = profile?.display_name || user.email?.split('@')[0] || 'Player'
  const memberSince = profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'

  const stats = [
    { label: 'Balance',    value: balance.toLocaleString(undefined, { maximumFractionDigits: 2 }), accent: '#00A844' },
    { label: 'Positions',  value: String(positions.length) },
    { label: 'Invested',   value: invested.toLocaleString(undefined, { maximumFractionDigits: 2 }) },
  ]

  return (
    <main className="min-h-screen pb-24" style={{ backgroundColor: 'var(--bg-base)' }}>
      <div className="max-w-[440px] mx-auto px-4 py-6">
        {/* Identity card */}
        <div className="rounded-2xl p-5 mb-4 flex items-center gap-4" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div
            className="flex items-center justify-center rounded-full font-bold"
            style={{ width: 56, height: 56, backgroundColor: 'rgba(0,200,83,0.14)', color: '#00A844', fontSize: 22 }}
          >
            {name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-bold" style={{ fontSize: 18, color: 'var(--text-strong)' }}>{name}</p>
            <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
              {user.email}{profile?.role === 'admin' ? ' · Admin' : ''}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-faintest)' }}>Member since {memberSince}</p>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3">
          {stats.map(s => (
            <div key={s.label} className="rounded-2xl p-4 text-center" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <p className="font-mono font-bold" style={{ fontSize: 18, color: s.accent ?? 'var(--text-strong)' }}>{s.value}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>
      <PlayerTabBar active="markets" />
    </main>
  )
}
