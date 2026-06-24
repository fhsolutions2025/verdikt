import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PlayerTabBar } from '@/components/player/PlayerTabBar'
import type { Wallet, WalletTransaction } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function WalletPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const walletRes = await supabase
    .from('wallets')
    .select('*')
    .eq('player_id', user.id)
    .single()
  const wallet = walletRes.data as Wallet | null

  const txs: WalletTransaction[] = []
  if (wallet) {
    const txRes = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('wallet_id', wallet.id)
      .order('created_at', { ascending: false })
      .limit(20)
    if (txRes.data) txs.push(...(txRes.data as WalletTransaction[]))
  }

  return (
    <main className="min-h-screen pb-24" style={{ backgroundColor: '#F9FAFB' }}>
      <div className="max-w-[420px] mx-auto px-4 pt-4 space-y-4">

        {/* Balance card */}
        <div
          className="rounded-2xl p-5 text-center"
          style={{ backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB' }}
        >
          <p
            className="text-xs font-bold uppercase tracking-widest mb-2"
            style={{ color: '#6B7280', letterSpacing: '0.08em' }}
          >
            Available Balance
          </p>
          <p className="font-mono font-bold" style={{ fontSize: 40, color: '#111A11' }}>
            {wallet?.balance.toFixed(2) ?? '—'}
          </p>
          <p className="text-xs mt-1" style={{ color: '#9CA3AF' }}>
            Demo account · for illustration only
          </p>
        </div>

        {/* Transaction list */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB' }}
        >
          <div className="px-4 py-3 border-b" style={{ borderColor: '#E5E7EB' }}>
            <h2
              className="text-xs font-bold uppercase tracking-widest"
              style={{ color: '#6B7280', letterSpacing: '0.08em' }}
            >
              Recent Activity
            </h2>
          </div>

          {txs.map(tx => (
            <div
              key={tx.id}
              className="px-4 py-3 flex items-center justify-between border-b"
              style={{ borderColor: '#F3F4F6' }}
            >
              <div>
                <p className="text-sm font-medium" style={{ color: '#374151' }}>
                  {tx.description}
                </p>
                <p className="text-xs" style={{ color: '#9CA3AF' }}>
                  {new Date(tx.created_at).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </p>
              </div>
              <span
                className="font-mono font-bold text-sm"
                style={{ color: tx.amount >= 0 ? '#00A844' : '#E05C20' }}
              >
                {tx.amount >= 0 ? '+' : ''}{tx.amount.toFixed(2)}
              </span>
            </div>
          ))}

          {txs.length === 0 && (
            <p className="px-4 py-8 text-sm text-center" style={{ color: '#9CA3AF' }}>
              No transactions yet.
            </p>
          )}
        </div>
      </div>

      <PlayerTabBar active="wallet" />
    </main>
  )
}
