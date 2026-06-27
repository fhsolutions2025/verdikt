'use client'

// Settled-market results list. Shared by the Results slide-over (and anywhere
// else that needs to show resolved markets + the player's realized P&L).

export interface ResolvedMarketLite {
  id:          string
  question:    string
  outcome:     string | null
  resolved_at: string | null
  my_pnl:      number | null
  my_side:     string | null
}

export function ResultsList({ resolved }: { resolved: ResolvedMarketLite[] }) {
  if (resolved.length === 0) {
    return (
      <div className="py-16 text-center px-6">
        <p className="text-sm" style={{ color: 'var(--text-faint)' }}>
          No settled markets yet. Resolved markets and their outcomes will appear here.
        </p>
      </div>
    )
  }
  return (
    <div className="px-4 py-4 space-y-2.5">
      {resolved.map(m => {
        const outcome = (m.outcome ?? '').toLowerCase()
        const oColor = outcome === 'yes' ? '#00A844' : outcome === 'no' ? '#E05C20' : 'var(--text-dim)'
        const oLabel = outcome ? outcome.toUpperCase() : '—'
        const hasPnl = m.my_pnl !== null
        const won = (m.my_pnl ?? 0) >= 0
        return (
          <div key={m.id} className="rounded-2xl p-4" style={{ backgroundColor: 'var(--bg-base)', border: '1px solid var(--border)' }}>
            <div className="flex items-start gap-2">
              <p className="font-semibold leading-snug flex-1 line-clamp-2" style={{ fontSize: 14, color: 'var(--text-strong)' }}>{m.question}</p>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: `${oColor}1A`, color: oColor }}>{oLabel}</span>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs" style={{ color: 'var(--text-faintest)' }}>
                Settled {m.resolved_at ? new Date(m.resolved_at).toLocaleDateString() : ''}
              </span>
              {hasPnl ? (
                <span className="text-xs font-bold font-mono" style={{ color: won ? '#00A844' : '#DC2626' }}>
                  {won ? '+' : ''}{(m.my_pnl ?? 0).toFixed(2)} {m.my_side ? `· held ${m.my_side.toUpperCase()}` : ''}
                </span>
              ) : (
                <span className="text-xs" style={{ color: 'var(--text-faintest)' }}>not traded</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
