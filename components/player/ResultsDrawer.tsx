'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SideDrawer } from './SideDrawer'
import { ResultsList, type ResolvedMarketLite } from './ResultsList'

// Settled-market results as a slide-over. Self-fetches resolved markets + the
// signed-in player's positions when opened, so it can live in the shared header
// without server prop-drilling from the player page.
export function ResultsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [resolved, setResolved] = useState<ResolvedMarketLite[]>([])
  const [loading, setLoading]   = useState(false)
  const [loaded, setLoaded]     = useState(false)

  useEffect(() => {
    if (!open || loaded) return
    let cancelled = false
    setLoading(true)
    const supabase = createClient()
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: marketsRaw } = await supabase
        .from('markets')
        .select('id, question, outcome, resolved_at')
        .eq('status', 'resolved')
        .order('resolved_at', { ascending: false })
        .limit(40)

      const rows = (marketsRaw ?? []) as Omit<ResolvedMarketLite, 'my_pnl' | 'my_side'>[]
      const ids  = rows.map(m => m.id)

      const myPos: Record<string, { pnl: number; side: string }> = {}
      if (user && ids.length > 0) {
        const { data: posRows } = await supabase
          .from('positions')
          .select('market_id, side, realized_pnl')
          .eq('player_id', user.id)
          .in('market_id', ids)
        for (const p of (posRows ?? []) as { market_id: string; side: string; realized_pnl: number | null }[]) {
          myPos[p.market_id] = { pnl: Number(p.realized_pnl ?? 0), side: p.side }
        }
      }

      if (cancelled) return
      setResolved(rows.map(m => ({
        ...m,
        my_pnl:  myPos[m.id]?.pnl ?? null,
        my_side: myPos[m.id]?.side ?? null,
      })))
      setLoading(false)
      setLoaded(true)
    })()
    return () => { cancelled = true }
  }, [open, loaded])

  return (
    <SideDrawer open={open} onClose={onClose} title={`Results${resolved.length ? ` · ${resolved.length}` : ''}`} width={400}>
      {loading ? (
        <p className="py-16 text-center text-sm" style={{ color: 'var(--text-faint)' }}>Loading settled markets…</p>
      ) : (
        <ResultsList resolved={resolved} />
      )}
    </SideDrawer>
  )
}
