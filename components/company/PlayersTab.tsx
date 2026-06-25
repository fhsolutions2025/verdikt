'use client'

import { useCallback, useEffect, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlayerSummary {
  id:            string
  display_name:  string
  operator_id:   string | null
  created_at:    string
  balance:       number
  trade_count:   number
  open_positions: number
  total_pnl:     number
  volume:        number
  last_active:   string | null
  risk_flag:     boolean
}

interface PlayerDetail extends PlayerSummary {
  positions: {
    id: string
    market_question: string
    side: string
    shares: number
    entry_price: number
    entry_value: number
    status: string
    realized_pnl: number | null
    entry_at: string
  }[]
  recent_trades: {
    id: string
    market_question: string
    side: string
    amount: number
    fee: number
    created_at: string
  }[]
  transactions: {
    id: string
    type: string
    amount: number
    description: string
    created_at: string
  }[]
}

// ── Risk badge ────────────────────────────────────────────────────────────────

function RiskBadge({ flag }: { flag: boolean }) {
  if (!flag) return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
      backgroundColor: '#00C85318', color: '#00C853',
    }}>LOW</span>
  )
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
      backgroundColor: '#DC262618', color: '#DC2626',
    }}>FLAGGED</span>
  )
}

// ── Tier badge ───────────────────────────────────────────────────────────────

function TierBadge({ volume }: { volume: number }) {
  if (volume >= 1000) return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 999,
      backgroundColor: '#F59E0B18', color: '#F59E0B', letterSpacing: '0.06em',
    }}>WHALE</span>
  )
  if (volume >= 100) return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 999,
      backgroundColor: '#6C3FC518', color: '#6C3FC5', letterSpacing: '0.06em',
    }}>ACTIVE</span>
  )
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 999,
      backgroundColor: '#37414118', color: '#6B7280', letterSpacing: '0.06em',
    }}>CASUAL</span>
  )
}

// ── Player detail drawer ──────────────────────────────────────────────────────

function PlayerDrawer({ player, onClose }: { player: PlayerDetail | null; onClose: () => void }) {
  if (!player) return null

  const pnlColor = player.total_pnl >= 0 ? '#00C853' : '#DC2626'

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 49, cursor: 'pointer',
        }}
      />
      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 480,
        backgroundColor: '#0D1117',
        borderLeft: '1px solid rgba(255,255,255,0.1)',
        zIndex: 50, overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 12,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'linear-gradient(135deg, #6C3FC5, #00C853)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 700, color: '#fff',
              }}>
                {player.display_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 style={{ color: '#E6EDF3', fontWeight: 700, fontSize: 16, margin: 0 }}>
                  {player.display_name}
                </h2>
                <p style={{ color: '#4B5563', fontSize: 11, margin: 0, fontFamily: 'monospace' }}>
                  {player.id.slice(0, 8)}…
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <TierBadge volume={player.volume} />
              <RiskBadge flag={player.risk_flag} />
              {player.operator_id && (
                <span style={{ fontSize: 10, color: '#4B5563', backgroundColor: '#161B22', padding: '2px 8px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.06)' }}>
                  {player.operator_id}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: 4 }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <line x1="4" y1="4" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="14" y1="4" x2="4" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* KPI strip */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          {[
            { label: 'Balance', value: player.balance.toFixed(2), color: '#E6EDF3', unit: '¢' },
            { label: 'Total P&L', value: (player.total_pnl >= 0 ? '+' : '') + player.total_pnl.toFixed(2), color: pnlColor, unit: '¢' },
            { label: 'Volume', value: player.volume.toFixed(0), color: '#9CA3AF', unit: '¢' },
            { label: 'Trades', value: String(player.trade_count), color: '#9CA3AF', unit: '' },
          ].map(k => (
            <div key={k.label} style={{
              padding: '12px 14px', textAlign: 'center',
              borderRight: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'monospace', color: k.color }}>
                {k.value}{k.unit}
              </div>
              <div style={{ fontSize: 10, color: '#4B5563', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {k.label}
              </div>
            </div>
          ))}
        </div>

        <div style={{ flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Open Positions */}
          <div>
            <h3 style={{ color: '#6B7280', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 10px' }}>
              Positions ({player.positions.length})
            </h3>
            {player.positions.length === 0 ? (
              <p style={{ color: '#374151', fontSize: 13 }}>No positions.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {player.positions.map(p => {
                  const pnl = p.realized_pnl
                  return (
                    <div key={p.id} style={{
                      padding: '10px 14px', borderRadius: 10,
                      backgroundColor: '#161B22',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <p style={{ color: '#D1D5DB', fontSize: 12, margin: 0, flex: 1 }}>
                          {p.market_question}
                        </p>
                        <span style={{
                          padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
                          backgroundColor: p.side === 'yes' ? '#00C85318' : '#DC262618',
                          color: p.side === 'yes' ? '#00C853' : '#DC2626',
                          flexShrink: 0,
                        }}>
                          {p.side.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                        <span style={{ fontSize: 11, color: '#6B7280' }}>{p.shares.toFixed(0)} shares @ {(p.entry_price * 100).toFixed(0)}¢</span>
                        {pnl != null && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: pnl >= 0 ? '#00C853' : '#DC2626' }}>
                            {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}¢
                          </span>
                        )}
                        <span style={{
                          fontSize: 10, color: '#4B5563',
                          padding: '1px 6px', borderRadius: 4,
                          backgroundColor: 'rgba(255,255,255,0.04)',
                        }}>{p.status}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Recent Transactions */}
          <div>
            <h3 style={{ color: '#6B7280', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 10px' }}>
              Recent Transactions
            </h3>
            {player.transactions.length === 0 ? (
              <p style={{ color: '#374151', fontSize: 13 }}>No transactions.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {player.transactions.slice(0, 10).map(tx => (
                  <div key={tx.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                      backgroundColor: tx.amount > 0 ? '#00C85314' : '#DC262614',
                      color: tx.amount > 0 ? '#00C853' : '#DC2626',
                    }}>
                      {tx.type}
                    </span>
                    <span style={{ flex: 1, fontSize: 12, color: '#9CA3AF' }}>
                      {tx.description || '—'}
                    </span>
                    <span style={{
                      fontSize: 13, fontWeight: 700, fontFamily: 'monospace',
                      color: tx.amount >= 0 ? '#00C853' : '#DC2626',
                    }}>
                      {tx.amount >= 0 ? '+' : ''}{tx.amount.toFixed(2)}¢
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function PlayersTab() {
  const [players, setPlayers]   = useState<PlayerSummary[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [sortBy, setSortBy]     = useState<'volume' | 'balance' | 'trades' | 'pnl'>('volume')
  const [onlyFlagged, setOnlyFlagged] = useState(false)
  const [detail, setDetail]     = useState<PlayerDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/company/players')
      if (res.ok) {
        const data = await res.json()
        setPlayers(data.players ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openDetail = async (id: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/company/players/${id}`)
      if (res.ok) {
        const data = await res.json()
        setDetail(data.player)
      }
    } finally {
      setDetailLoading(false)
    }
  }

  const filtered = players
    .filter(p => {
      if (onlyFlagged && !p.risk_flag) return false
      if (!search) return true
      const q = search.toLowerCase()
      return p.display_name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      if (sortBy === 'volume')  return b.volume - a.volume
      if (sortBy === 'balance') return b.balance - a.balance
      if (sortBy === 'trades')  return b.trade_count - a.trade_count
      if (sortBy === 'pnl')    return b.total_pnl - a.total_pnl
      return 0
    })

  const whaleCount  = players.filter(p => p.volume >= 1000).length
  const activeCount = players.filter(p => p.volume >= 100 && p.volume < 1000).length
  const flagCount   = players.filter(p => p.risk_flag).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Summary strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
      }}>
        {[
          { label: 'Total Players', value: players.length, color: '#E6EDF3' },
          { label: 'Whales (≥1000¢)', value: whaleCount, color: '#F59E0B' },
          { label: 'Active (≥100¢)', value: activeCount, color: '#6C3FC5' },
          { label: 'Flagged', value: flagCount, color: flagCount > 0 ? '#DC2626' : '#374151' },
        ].map(s => (
          <div key={s.label} style={{
            backgroundColor: '#161B22',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12, padding: '14px 18px',
          }}>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: 'monospace', color: s.color }}>
              {s.value}
            </div>
            <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search players…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, minWidth: 180, padding: '8px 14px',
            backgroundColor: '#161B22',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, color: '#E6EDF3', fontSize: 13, outline: 'none',
          }}
        />
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as typeof sortBy)}
          style={{
            padding: '8px 12px', backgroundColor: '#161B22',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, color: '#9CA3AF', fontSize: 13, cursor: 'pointer', outline: 'none',
          }}
        >
          <option value="volume">Sort: Volume</option>
          <option value="balance">Sort: Balance</option>
          <option value="trades">Sort: Trades</option>
          <option value="pnl">Sort: P&L</option>
        </select>
        <button
          onClick={() => setOnlyFlagged(f => !f)}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            border: `1px solid ${onlyFlagged ? '#DC2626' : 'rgba(255,255,255,0.1)'}`,
            backgroundColor: onlyFlagged ? '#DC262618' : 'transparent',
            color: onlyFlagged ? '#DC2626' : '#6B7280',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}
        >
          Flagged only
        </button>
        <button
          onClick={load}
          style={{
            padding: '8px 14px', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.1)',
            backgroundColor: 'transparent', color: '#6B7280',
            fontSize: 12, cursor: 'pointer',
          }}
        >
          ↺ Refresh
        </button>
      </div>

      {/* Table */}
      <div style={{
        backgroundColor: '#161B22',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 80px 80px 80px 80px 80px 80px',
          padding: '10px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          backgroundColor: '#0D1117',
        }}>
          {['Player', 'Balance', 'Volume', 'Trades', 'Positions', 'P&L', 'Risk'].map(h => (
            <span key={h} style={{ fontSize: 10, fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              {h}
            </span>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#4B5563', fontSize: 13 }}>
            Loading players…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#4B5563', fontSize: 13 }}>
            No players found.
          </div>
        ) : (
          filtered.map(p => (
            <div
              key={p.id}
              onClick={() => openDetail(p.id)}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 80px 80px 80px 80px 80px 80px',
                padding: '12px 20px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                cursor: 'pointer',
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #6C3FC540, #00C85340)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: '#9CA3AF', flexShrink: 0,
                }}>
                  {p.display_name.charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ color: '#E6EDF3', fontSize: 13, fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.display_name}
                  </p>
                  <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                    <TierBadge volume={p.volume} />
                    {p.operator_id && (
                      <span style={{ fontSize: 9, color: '#4B5563' }}>{p.operator_id}</span>
                    )}
                  </div>
                </div>
              </div>
              <span style={{ color: '#E6EDF3', fontSize: 12, fontFamily: 'monospace', alignSelf: 'center' }}>
                {p.balance.toFixed(1)}¢
              </span>
              <span style={{ color: '#9CA3AF', fontSize: 12, fontFamily: 'monospace', alignSelf: 'center' }}>
                {p.volume.toFixed(0)}¢
              </span>
              <span style={{ color: '#9CA3AF', fontSize: 12, fontFamily: 'monospace', alignSelf: 'center' }}>
                {p.trade_count}
              </span>
              <span style={{ color: '#9CA3AF', fontSize: 12, fontFamily: 'monospace', alignSelf: 'center' }}>
                {p.open_positions}
              </span>
              <span style={{
                fontSize: 12, fontFamily: 'monospace', fontWeight: 700, alignSelf: 'center',
                color: p.total_pnl >= 0 ? '#00C853' : '#DC2626',
              }}>
                {p.total_pnl >= 0 ? '+' : ''}{p.total_pnl.toFixed(1)}¢
              </span>
              <div style={{ alignSelf: 'center' }}>
                <RiskBadge flag={p.risk_flag} />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Detail drawer */}
      {detailLoading && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 49,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ color: '#6B7280', fontSize: 14 }}>Loading player…</div>
        </div>
      )}
      {detail && !detailLoading && (
        <PlayerDrawer player={detail} onClose={() => setDetail(null)} />
      )}
    </div>
  )
}
