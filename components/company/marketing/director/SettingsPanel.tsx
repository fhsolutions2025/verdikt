'use client'

// Settings panel — a read-only slide-over inside the Campaign Director workspace.
// Surfaces the marketing AI agents (status / provider / model / version) and the
// configured brands. No mutations — edits happen in Company → AI Agents.

import React from 'react'
import { ACCENT, PURPLE } from '@/components/company/marketing/director/theme'

interface ChannelRow { channel: string; label: string; connected: boolean; account_id: string | null; note: string | null }

interface AgentConfig {
  agent_type: string
  is_active: boolean
  provider: string | null
  model: string | null
  version: number
}

function asAgentConfig(v: unknown): AgentConfig | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (typeof o.agent_type !== 'string') return null
  return {
    agent_type: o.agent_type,
    is_active: Boolean(o.is_active),
    provider: typeof o.provider === 'string' ? o.provider : null,
    model: typeof o.model === 'string' ? o.model : null,
    version: typeof o.version === 'number' ? o.version : Number(o.version ?? 1) || 1,
  }
}

function isMarketingAgent(t: string): boolean {
  return t.startsWith('mkt_') || t === 'campaign_director_agent'
}

export function SettingsPanel({
  brands, onClose,
}: {
  brands: { id: string; name: string }[]
  onClose: () => void
}): React.JSX.Element {
  const [agents, setAgents] = React.useState<AgentConfig[]>([])
  const [loading, setLoading] = React.useState(false)
  const [channels, setChannels] = React.useState<ChannelRow[]>([])
  const [editChan, setEditChan] = React.useState<string | null>(null)
  const [acct, setAcct] = React.useState('')
  const [token, setToken] = React.useState('')
  const [chanBusy, setChanBusy] = React.useState(false)

  const loadChannels = React.useCallback(async () => {
    try {
      const r = await fetch('/api/company/marketing/v2/channels')
      const d: unknown = await r.json()
      const raw = d && typeof d === 'object' ? (d as Record<string, unknown>).channels : undefined
      setChannels(Array.isArray(raw) ? (raw as ChannelRow[]) : [])
    } catch { setChannels([]) }
  }, [])

  React.useEffect(() => { void loadChannels() }, [loadChannels])

  const connect = async (channel: string) => {
    if (chanBusy || !token.trim()) return
    setChanBusy(true)
    try {
      await fetch('/api/company/marketing/v2/channels', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, account_id: acct.trim() || undefined, access_token: token.trim() }),
      })
      setEditChan(null); setAcct(''); setToken(''); await loadChannels()
    } finally { setChanBusy(false) }
  }
  const disconnect = async (channel: string) => {
    await fetch(`/api/company/marketing/v2/channels?channel=${channel}`, { method: 'DELETE' }).catch(() => {})
    await loadChannels()
  }

  React.useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const r = await fetch('/api/agents/configs')
        const d: unknown = await r.json()
        const raw = d && typeof d === 'object' ? (d as Record<string, unknown>).configs : undefined
        const list = Array.isArray(raw)
          ? raw.map(asAgentConfig).filter((a): a is AgentConfig => a !== null).filter(a => isMarketingAgent(a.agent_type))
          : []
        if (!cancelled) setAgents(list)
      } catch {
        if (!cancelled) setAgents([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)', height: '100%', background: 'var(--bg-base)',
          borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
          boxShadow: '-12px 0 32px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 18 }}>⚙️</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-strong)' }}>Settings</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Marketing agents and brands (read-only).</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--text-faint)' }}>×</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 22 }}>
          {/* AI Agents */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', marginBottom: 8 }}>
              AI Agents {agents.length ? `(${agents.length})` : ''}
            </div>
            {loading ? (
              <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Loading…</div>
            ) : agents.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>No marketing agents configured.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {agents.map(a => (
                  <div key={a.agent_type} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    border: '1px solid var(--border-soft)', borderRadius: 10, background: 'var(--bg-inset)',
                  }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: 999, flexShrink: 0,
                      background: a.is_active ? ACCENT : 'var(--text-faint)',
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.agent_type}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>
                        {a.provider || a.model
                          ? `${a.provider ?? '—'}${a.model ? ` · ${a.model}` : ''}`
                          : 'task router default'}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)' }}>v{a.version}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 10 }}>
              Edit agents in the Company → AI Agents screen.
            </div>
          </div>

          {/* Channel connections */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', marginBottom: 8 }}>
              Channel Connections
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {channels.map(c => (
                <div key={c.channel} style={{ padding: '10px 12px', border: '1px solid var(--border-soft)', borderRadius: 10, background: 'var(--bg-inset)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: c.connected ? ACCENT : 'var(--text-faint)' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-strong)' }}>{c.label}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{c.connected ? `Connected${c.account_id ? ` · ${c.account_id}` : ''}` : (c.note ?? 'Not connected')}</div>
                    </div>
                    {c.connected ? (
                      <button onClick={() => disconnect(c.channel)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', fontSize: 11.5, fontWeight: 700, color: 'var(--text-dim)', cursor: 'pointer' }}>Disconnect</button>
                    ) : (
                      <button onClick={() => { setEditChan(editChan === c.channel ? null : c.channel); setAcct(''); setToken('') }} style={{ background: 'none', border: `1px solid ${PURPLE}55`, borderRadius: 8, padding: '5px 10px', fontSize: 11.5, fontWeight: 700, color: PURPLE, cursor: 'pointer' }}>Connect</button>
                    )}
                  </div>
                  {editChan === c.channel && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                      <input value={acct} onChange={e => setAcct(e.target.value)} placeholder="Account / page id (optional)" style={chanInput} />
                      <input value={token} onChange={e => setToken(e.target.value)} placeholder="Access token" type="password" style={chanInput} />
                      <button onClick={() => connect(c.channel)} disabled={chanBusy || !token.trim()} style={{ alignSelf: 'flex-start', background: ACCENT, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: chanBusy || !token.trim() ? 'default' : 'pointer', opacity: token.trim() ? 1 : 0.6 }}>{chanBusy ? 'Saving…' : 'Save connection'}</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 10 }}>
              Live posting activates when a channel is connected; otherwise publishing records an export.
            </div>
          </div>

          {/* Brands */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', marginBottom: 8 }}>
              Brands {brands.length ? `(${brands.length})` : ''}
            </div>
            {brands.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>No brands configured.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {brands.map(b => (
                  <div key={b.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    border: '1px solid var(--border-soft)', borderRadius: 10, background: 'var(--bg-inset)',
                  }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const chanInput: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: 'var(--bg-base)',
  border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px',
  color: 'var(--text-strong)', fontSize: 12.5, outline: 'none',
}
