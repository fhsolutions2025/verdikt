import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { WalletStatement } from '@/components/player/WalletStatement'
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
      .limit(200)
    if (txRes.data) txs.push(...(txRes.data as WalletTransaction[]))
  }

  return (
    <WalletStatement balance={wallet?.balance ?? 0} transactions={txs} />
  )
}
