import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Wallet, WalletTransaction } from '@/lib/types'

export const dynamic = 'force-dynamic'

type Period = '7d' | '30d' | '3m' | '1y' | 'all'

function periodStartIso(period: Period): string | null {
  if (period === 'all') return null
  const day = 86_400_000
  const now = Date.now()
  const offsets: Record<Exclude<Period, 'all'>, number> = {
    '7d': 7 * day,
    '30d': 30 * day,
    '3m': 90 * day,
    '1y': 365 * day,
  }
  return new Date(now - offsets[period]).toISOString()
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const raw = (url.searchParams.get('period') ?? 'all').toLowerCase()
  const period: Period = (['7d', '30d', '3m', '1y', 'all'] as const).includes(raw as Period)
    ? (raw as Period)
    : 'all'

  const walletRes = await supabase
    .from('wallets')
    .select('*')
    .eq('player_id', user.id)
    .single()
  const wallet = walletRes.data as Wallet | null

  let txs: WalletTransaction[] = []
  if (wallet) {
    let query = supabase
      .from('wallet_transactions')
      .select('*')
      .eq('wallet_id', wallet.id)
      .order('created_at', { ascending: false })

    const startIso = periodStartIso(period)
    if (startIso) query = query.gte('created_at', startIso)

    const txRes = await query.limit(1000)
    if (txRes.data) txs = txRes.data as WalletTransaction[]
  }

  // Reconstruct running balance: txs newest-first, walk backwards from current balance.
  const currentBalance = wallet?.balance ?? 0
  const balanceAfter: number[] = []
  let after = currentBalance
  for (const tx of txs) {
    balanceAfter.push(after)
    after = after - tx.amount
  }

  const lines: string[] = ['Date,Type,Description,Amount,Balance']
  txs.forEach((tx, i) => {
    const row = [
      new Date(tx.created_at).toISOString(),
      tx.type,
      tx.description ?? '',
      tx.amount.toFixed(2),
      balanceAfter[i].toFixed(2),
    ].map(v => csvEscape(String(v)))
    lines.push(row.join(','))
  })

  const csv = lines.join('\r\n')

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="verdikt-statement.csv"',
      'Cache-Control': 'no-store',
    },
  })
}
