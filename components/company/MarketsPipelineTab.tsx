'use client'

export interface CronRunRow {
  id:               string
  job_name:         string
  started_at:       string
  feeds_active:     number | null
  headlines_fetched: number | null
  viable_count:     number | null
  inserted_count:   number | null
  skipped_count:    number | null
  error_text:       string | null
  duration_ms:      number | null
}

export interface PipelineMarket {
  id:           string
  question:     string
  status:       string
  creator_type: string
  source_feed:  string | null
  created_at:   string
  volume:       number
  category:     string
}

export interface LiquidityRow {
  market_id: string
  sim_vol:   number
  total_vol: number
}

interface Props {
  cronRunLog:      CronRunRow[]
  pipelineMarkets: PipelineMarket[]
  tradeLiquidity:  LiquidityRow[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  if (mins < 2)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function todayISO(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

const SOURCE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  'BBC RSS':            { bg: 'rgba(59,130,246,0.12)',  text: '#3B82F6', label: 'BBC' },
  'Al Jazeera RSS':     { bg: 'rgba(220,38,38,0.10)',   text: '#DC2626', label: 'AJ' },
  'Reuters RSS':        { bg: 'rgba(234,88,12,0.10)',   text: '#EA580C', label: 'Reuters' },
  'football-data.org':  { bg: 'rgba(22,163,74,0.12)',   text: '#16A34A', label: 'Football' },
  'CoinGecko':          { bg: 'rgba(202,138,4,0.12)',   text: '#CA8A04', label: 'CoinGecko' },
  'Alpha Vantage':      { bg: 'rgba(147,51,234,0.12)',  text: '#9333EA', label: 'AlphaV' },
  'Frankfurter':        { bg: 'rgba(8,145,178,0.12)',   text: '#0891B2', label: 'Forex' },
}

function SourceBadge({ source, creatorType }: { source: string | null; creatorType: string }) {
  if (source && SOURCE_COLORS[source]) {
    const c = SOURCE_COLORS[source]
    return (
      <span style={{
        backgroundColor: c.bg, color: c.text,
        fontSize: 9, fontWeight: 700, padding: '1px 6px',
        borderRadius: 999, flexShrink: 0, letterSpacing: '0.04em',
      }}>
        {c.label}
      </span>
    )
  }
  if (creatorType === 'player_mm' || creatorType === 'institutional_mm') {
    return (
      <span style={{
        backgroundColor: 'rgba(0,200,83,0.10)', color: '#00A844',
        fontSize: 9, fontWeight: 700, padding: '1px 6px',
        borderRadius: 999, flexShrink: 0,
      }}>
        BYV
      </span>
    )
  }
  return (
    <span style={{
      backgroundColor: 'var(--bg-inset)', color: 'var(--text-dim)',
      fontSize: 9, fontWeight: 700, padding: '1px 6px',
      borderRadius: 999, flexShrink: 0,
    }}>
      AI
    </span>
  )
}

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  pending_ai:       { bg: 'rgba(202,138,4,0.12)',  text: '#CA8A04' },
  ai_ready:         { bg: 'rgba(59,130,246,0.10)', text: '#3B82F6' },
  pending_mm_review:{ bg: 'rgba(234,88,12,0.10)',  text: '#EA580C' },
  live:             { bg: 'rgba(0,200,83,0.10)',   text: '#00A844' },
  resolved:         { bg: 'rgba(100,100,100,0.1)', text: '#888'    },
  voided:           { bg: 'rgba(220,38,38,0.08)',  text: '#DC2626' },
}

function StatusChip({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { bg: 'var(--bg-inset)', text: 'var(--text-dim)' }
  return (
    <span style={{
      backgroundColor: s.bg, color: s.text,
      fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 999,
      letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

// ── Sub-sections ──────────────────────────────────────────────────────────────

function PipelineFunnel({ markets }: { markets: PipelineMarket[] }) {
  const counts = markets.reduce<Record<string, number>>((acc, m) => {
    acc[m.status] = (acc[m.status] ?? 0) + 1
    return acc
  }, {})

  const stages = [
    { key: 'pending_ai',        label: 'Pending AI',   color: '#CA8A04' },
    { key: 'ai_ready',          label: 'AI Ready',     color: '#3B82F6' },
    { key: 'pending_mm_review', label: 'MM Review',    color: '#EA580C' },
    { key: 'live',              label: 'Live',         color: '#00C853' },
  ]
  const resolved = (counts['resolved'] ?? 0) + (counts['voided'] ?? 0)

  return (
    <div style={{
      backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 16, padding: '20px 24px',
    }}>
      <p style={{ color: 'var(--text-dim)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
        Pipeline Funnel
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {stages.map((s, i) => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              backgroundColor: s.color + '15',
              border: `1px solid ${s.color}40`,
              borderRadius: 10,
              padding: '10px 18px',
              textAlign: 'center',
              minWidth: 80,
            }}>
              <div style={{ color: s.color, fontSize: 22, fontWeight: 800, fontFamily: 'monospace', lineHeight: 1 }}>
                {counts[s.key] ?? 0}
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: 10, fontWeight: 600, marginTop: 4 }}>
                {s.label}
              </div>
            </div>
            {i < stages.length - 1 && (
              <span style={{ color: 'var(--text-faintest)', fontSize: 16 }}>→</span>
            )}
          </div>
        ))}
        {resolved > 0 && (
          <>
            <span style={{ color: 'var(--text-faintest)', fontSize: 16 }}>→</span>
            <div style={{
              backgroundColor: 'var(--bg-inset)', border: '1px solid var(--border)',
              borderRadius: 10, padding: '10px 18px', textAlign: 'center', minWidth: 80,
            }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 22, fontWeight: 800, fontFamily: 'monospace', lineHeight: 1 }}>
                {resolved}
              </div>
              <div style={{ color: 'var(--text-faint)', fontSize: 10, fontWeight: 600, marginTop: 4 }}>
                Done
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function TodayStats({ markets }: { markets: PipelineMarket[] }) {
  const today = todayISO()
  const todayMarkets = markets.filter(m => m.created_at >= today)

  const rssCount     = todayMarkets.filter(m => m.source_feed && ['BBC RSS', 'Al Jazeera RSS', 'Reuters RSS'].includes(m.source_feed)).length
  const sportsCount  = todayMarkets.filter(m => m.source_feed === 'football-data.org').length
  const financeCount = todayMarkets.filter(m => m.source_feed && ['CoinGecko', 'Alpha Vantage', 'Frankfurter'].includes(m.source_feed)).length
  const byvCount     = todayMarkets.filter(m => !m.source_feed || m.creator_type !== 'ai_system').length
  const liveTotal    = markets.filter(m => m.status === 'live').length

  const stats = [
    { label: 'RSS (News)',   value: rssCount,     color: '#3B82F6' },
    { label: 'Sports',       value: sportsCount,  color: '#16A34A' },
    { label: 'Finance',      value: financeCount, color: '#CA8A04' },
    { label: 'BYV (Players)', value: byvCount,    color: '#00A844' },
    { label: 'Total Live',   value: liveTotal,    color: '#00C853' },
  ]

  return (
    <div style={{
      backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 16, padding: '16px 24px',
      display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center',
    }}>
      <p style={{ color: 'var(--text-dim)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>
        Today
      </p>
      {stats.map((s, i) => (
        <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {i > 0 && <span style={{ color: 'var(--border-strong)' }}>·</span>}
          <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{s.label}</span>
          <span style={{ color: s.color, fontWeight: 800, fontFamily: 'monospace', fontSize: 14 }}>{s.value}</span>
        </div>
      ))}
    </div>
  )
}

function CronLog({ rows }: { rows: CronRunRow[] }) {
  const JOB_LABELS: Record<string, string> = {
    'seed-rss-markets':     'RSS (News)',
    'seed-sports-markets':  'Sports',
    'seed-finance-markets': 'Finance',
  }

  return (
    <div style={{
      backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <p style={{ color: 'var(--text-dim)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Cron Run Log
        </p>
      </div>
      {rows.length === 0 ? (
        <p style={{ color: 'var(--text-faint)', fontSize: 12, padding: '20px', textAlign: 'center' }}>No runs recorded yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-inset)' }}>
              {['Job', 'Time', 'Fetched', 'Viable', 'Inserted', 'Duration', ''].map(h => (
                <th key={h} style={{
                  padding: '6px 12px', textAlign: 'left',
                  color: 'var(--text-faint)', fontWeight: 600, fontSize: 11,
                  borderBottom: '1px solid var(--border)',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  {JOB_LABELS[row.job_name] ?? row.job_name}
                </td>
                <td style={{ padding: '8px 12px', color: 'var(--text-dim)', fontFamily: 'monospace' }}>
                  {relativeTime(row.started_at)}
                </td>
                <td style={{ padding: '8px 12px', color: 'var(--text-dim)', fontFamily: 'monospace' }}>
                  {row.headlines_fetched ?? '—'}
                </td>
                <td style={{ padding: '8px 12px', color: 'var(--text-dim)', fontFamily: 'monospace' }}>
                  {row.viable_count ?? '—'}
                </td>
                <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 700,
                  color: (row.inserted_count ?? 0) > 0 ? '#00A844' : 'var(--text-faint)' }}>
                  {row.inserted_count ?? 0}
                </td>
                <td style={{ padding: '8px 12px', color: 'var(--text-faint)', fontFamily: 'monospace' }}>
                  {row.duration_ms != null ? `${(row.duration_ms / 1000).toFixed(1)}s` : '—'}
                </td>
                <td style={{ padding: '8px 12px' }}>
                  {row.error_text
                    ? <span style={{ color: '#DC2626', fontWeight: 700 }}>✗</span>
                    : <span style={{ color: '#00A844', fontWeight: 700 }}>✓</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function MarketTimeline({ markets }: { markets: PipelineMarket[] }) {
  // Group by day
  const byDay = new Map<string, PipelineMarket[]>()
  for (const m of markets) {
    const day = m.created_at.slice(0, 10)
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day)!.push(m)
  }

  const days = Array.from(byDay.keys()).sort((a, b) => b.localeCompare(a)).slice(0, 10)

  return (
    <div style={{
      backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <p style={{ color: 'var(--text-dim)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Market Creation Timeline
        </p>
      </div>
      {days.length === 0 ? (
        <p style={{ color: 'var(--text-faint)', fontSize: 12, padding: '20px', textAlign: 'center' }}>No markets yet.</p>
      ) : (
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {days.map(day => (
            <div key={day}>
              <div style={{
                padding: '6px 16px', backgroundColor: 'var(--bg-inset)',
                color: 'var(--text-faint)', fontSize: 10, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                borderBottom: '1px solid var(--border-soft)',
                position: 'sticky', top: 0,
              }}>
                {new Date(day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
              </div>
              {byDay.get(day)!.map(m => (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 16px',
                  borderBottom: '1px solid var(--border-soft)',
                }}>
                  <SourceBadge source={m.source_feed} creatorType={m.creator_type} />
                  <StatusChip status={m.status} />
                  <span style={{
                    flex: 1, fontSize: 12, color: 'var(--text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {m.question}
                  </span>
                  <span style={{ color: 'var(--text-faintest)', fontSize: 10, flexShrink: 0 }}>
                    {relativeTime(m.created_at)}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LiquidityHealth({ markets, liquidity }: { markets: PipelineMarket[]; liquidity: LiquidityRow[] }) {
  const liqMap = new Map(liquidity.map(r => [r.market_id, r]))
  const liveMarkets = markets.filter(m => m.status === 'live' && liqMap.has(m.id))

  if (liveMarkets.length === 0) {
    return (
      <div style={{
        backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '32px 24px', textAlign: 'center',
      }}>
        <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>No live markets with trading activity yet.</p>
      </div>
    )
  }

  return (
    <div style={{
      backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
        <p style={{ color: 'var(--text-dim)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Liquidity Health
        </p>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ backgroundColor: 'var(--bg-inset)' }}>
            {['Market', 'Total Vol', 'Real', 'Sim', 'Mix'].map(h => (
              <th key={h} style={{
                padding: '6px 12px', textAlign: h === 'Market' ? 'left' : 'right',
                color: 'var(--text-faint)', fontWeight: 600, fontSize: 11,
                borderBottom: '1px solid var(--border)',
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {liveMarkets.slice(0, 20).map(m => {
            const liq     = liqMap.get(m.id)!
            const realVol  = liq.total_vol - liq.sim_vol
            const realPct  = liq.total_vol > 0 ? (realVol / liq.total_vol) * 100 : 0
            const simPct   = 100 - realPct

            return (
              <tr key={m.id} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                <td style={{
                  padding: '8px 12px', color: 'var(--text)',
                  maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {m.question}
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-dim)', fontFamily: 'monospace' }}>
                  {liq.total_vol.toLocaleString()}¢
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#00A844', fontFamily: 'monospace', fontWeight: 600 }}>
                  {realPct.toFixed(0)}%
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-faint)', fontFamily: 'monospace' }}>
                  {simPct.toFixed(0)}%
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                  <div style={{ width: 80, height: 6, borderRadius: 999, backgroundColor: 'var(--bg-inset)', overflow: 'hidden', marginLeft: 'auto' }}>
                    <div style={{ width: `${realPct}%`, height: '100%', backgroundColor: '#00C853', borderRadius: 999 }} />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function MarketsPipelineTab({ cronRunLog, pipelineMarkets, tradeLiquidity }: Props) {
  const sortedMarkets = [...pipelineMarkets].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PipelineFunnel markets={pipelineMarkets} />
      <TodayStats markets={pipelineMarkets} />
      <CronLog rows={cronRunLog.slice(0, 12)} />
      <MarketTimeline markets={sortedMarkets.slice(0, 50)} />
      <LiquidityHealth markets={pipelineMarkets} liquidity={tradeLiquidity} />
    </div>
  )
}
