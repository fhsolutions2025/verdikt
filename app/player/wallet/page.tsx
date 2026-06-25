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
    <main className="min-h-screen pb-24" style={{ backgroundColor: 'var(--bg-base)' }}>
      <div className="max-w-[420px] mx-auto px-4 pt-4 space-y-4">

        {/* Balance card */}
        <div
          className="rounded-2xl p-5 text-center"
          style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <p
            className="text-xs font-bold uppercase tracking-widest mb-2"
            style={{ color: 'var(--text-dim)', letterSpacing: '0.08em' }}
          >
            Available Balance
          </p>
          <p className="font-mono font-bold" style={{ fontSize: 40, color: 'var(--text-strong)' }}>
            {wallet?.balance.toFixed(2) ?? '—'}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>
            Demo account · for illustration only
          </p>
        </div>

        {/* Transaction list */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <h2
              className="text-xs font-bold uppercase tracking-widest"
              style={{ color: 'var(--text-dim)', letterSpacing: '0.08em' }}
            >
              Recent Activity
            </h2>
          </div>

          {txs.map(tx => (
            <div
              key={tx.id}
              className="px-4 py-3 flex items-center justify-between border-b"
              style={{ borderColor: 'var(--bg-inset)' }}
            >
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                  {tx.description}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
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
            <p className="px-4 py-8 text-sm text-center" style={{ color: 'var(--text-faint)' }}>
              No transactions yet.
            </p>
          )}
        </div>
      </div>

      <PlayerTabBar active="wallet" />
    </main>
  )
}
