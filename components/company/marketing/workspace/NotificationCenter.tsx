'use client'

// WS-6 — notification center (interaction map §10). Derives notifications from the real
// activity feed (GET /v2/activity) — no fabricated events. Read/dismissed state is kept
// per-admin in localStorage; repeated AI updates of the same kind are grouped. The bell's
// unread badge is reported up via onUnreadChange. Clicking an item opens the related
// campaign. Never interrupts the conversation — it's an on-demand popover.

import React from 'react'
import { ACCENT, PURPLE, RED } from '@/components/company/marketing/director/theme'

interface ActivityRow {
  id: string
  campaign_id: string | null
  event: string | null    // mkt_activity.type
  detail: string | null   // mkt_activity.text
  severity: string | null // mkt_activity.severity (info | warn | error | …)
  actor: string | null
  created_at: string | null
}

interface NotifItem {
  id: string
  campaignId: string | null
  title: string
  detail: string
  icon: string
  tone: 'info' | 'success' | 'warn'
  at: string
  count: number // grouped repeats
}

const READ_KEY = 'verdikt_ws_notif_read'
const DISMISS_KEY = 'verdikt_ws_notif_dismissed'

function loadSet(key: string): Set<string> {
  try { const v = JSON.parse(localStorage.getItem(key) ?? '[]'); return new Set(Array.isArray(v) ? v : []) } catch { return new Set() }
}
function saveSet(key: string, s: Set<string>): void {
  try { localStorage.setItem(key, JSON.stringify(Array.from(s).slice(-400))) } catch { /* ignore */ }
}

function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === 'object' && v !== null }

function classify(event: string): { icon: string; tone: NotifItem['tone'] } {
  const e = event.toLowerCase()
  if (e.includes('fail') || e.includes('error') || e.includes('reject') || e.includes('block')) return { icon: '⚠️', tone: 'warn' }
  if (e.includes('publish')) return { icon: '🚀', tone: 'success' }
  if (e.includes('approv')) return { icon: '✅', tone: 'success' }
  if (e.includes('video')) return { icon: '🎬', tone: 'info' }
  if (e.includes('comment') || e.includes('mention')) return { icon: '💬', tone: 'info' }
  if (e.includes('health') || e.includes('score')) return { icon: '📈', tone: 'success' }
  return { icon: '•', tone: 'info' }
}

function humanizeEvent(event: string): string {
  return event.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function NotificationCenter({
  open, onClose, onOpenCampaign, onUnreadChange,
}: {
  open: boolean
  onClose: () => void
  onOpenCampaign: (id: string) => void
  onUnreadChange: (n: number) => void
}): React.JSX.Element | null {
  const [rows, setRows] = React.useState<ActivityRow[]>([])
  const [read, setRead] = React.useState<Set<string>>(new Set())
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set())
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => { setRead(loadSet(READ_KEY)); setDismissed(loadSet(DISMISS_KEY)) }, [])

  const fetchRows = React.useCallback(async () => {
    setLoading(true)
    try {
      const r: unknown = await fetch('/api/company/marketing/v2/activity?limit=40').then((x) => x.json()).catch(() => null)
      const data = isRecord(r) && Array.isArray(r.data) ? r.data : []
      const parsed: ActivityRow[] = data.filter(isRecord).map((d) => ({
        id: String(d.id ?? ''),
        campaign_id: typeof d.campaign_id === 'string' ? d.campaign_id : null,
        event: typeof d.type === 'string' ? d.type : null,
        detail: typeof d.text === 'string' ? d.text : null,
        severity: typeof d.severity === 'string' ? d.severity : null,
        actor: typeof d.actor === 'string' ? d.actor : null,
        created_at: typeof d.created_at === 'string' ? d.created_at : null,
      })).filter((d) => d.id)
      setRows(parsed)
    } finally { setLoading(false) }
  }, [])

  // Poll quietly for the badge; refresh immediately on open.
  React.useEffect(() => {
    void fetchRows()
    const t = setInterval(() => { void fetchRows() }, 30000)
    return () => clearInterval(t)
  }, [fetchRows])
  React.useEffect(() => { if (open) void fetchRows() }, [open, fetchRows])

  // Build grouped notification items (collapse repeated identical events).
  const items: NotifItem[] = React.useMemo(() => {
    const visible = rows.filter((r) => !dismissed.has(r.id))
    const out: NotifItem[] = []
    const lastByKey = new Map<string, number>() // event key → index in out
    for (const r of visible) {
      const event = r.event ?? 'update'
      const base = classify(event)
      const sev = (r.severity ?? '').toLowerCase()
      const tone: NotifItem['tone'] = sev === 'error' || sev === 'warn' || sev === 'warning' ? 'warn' : base.tone
      const icon = tone === 'warn' && base.tone !== 'warn' ? '⚠️' : base.icon
      const key = `${event}|${r.campaign_id ?? ''}`
      const existingIdx = lastByKey.get(key)
      if (existingIdx !== undefined && out.length - existingIdx <= 1) {
        out[existingIdx].count += 1
        continue
      }
      lastByKey.set(key, out.length)
      out.push({
        id: r.id, campaignId: r.campaign_id, title: humanizeEvent(event),
        detail: r.detail ?? '', icon, tone, at: r.created_at ?? '', count: 1,
      })
    }
    return out
  }, [rows, dismissed])

  const unread = React.useMemo(() => items.filter((i) => !read.has(i.id)).length, [items, read])
  React.useEffect(() => { onUnreadChange(unread) }, [unread, onUnreadChange])

  const markAllRead = () => {
    const next = new Set(read); items.forEach((i) => next.add(i.id)); setRead(next); saveSet(READ_KEY, next)
  }
  const dismiss = (id: string) => {
    const next = new Set(dismissed); next.add(id); setDismissed(next); saveSet(DISMISS_KEY, next)
  }
  const openItem = (i: NotifItem) => {
    const next = new Set(read); next.add(i.id); setRead(next); saveSet(READ_KEY, next)
    if (i.campaignId) { onClose(); onOpenCampaign(i.campaignId) }
  }

  if (!open) return null

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
      <div style={{ position: 'fixed', top: 56, right: 12, zIndex: 61, width: 360, maxHeight: '70vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 16px 44px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-strong)' }}>Notifications</span>
          {items.length > 0 && unread > 0 && (
            <button onClick={markAllRead} style={{ background: 'none', border: 'none', cursor: 'pointer', color: PURPLE, fontSize: 12, fontWeight: 600 }}>Mark all read</button>
          )}
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading && items.length === 0 ? (
            <Empty>Loading…</Empty>
          ) : items.length === 0 ? (
            <Empty>You&apos;re all caught up.</Empty>
          ) : items.map((i) => {
            const isUnread = !read.has(i.id)
            const toneColor = i.tone === 'warn' ? RED : i.tone === 'success' ? ACCENT : 'var(--text-dim)'
            return (
              <div key={i.id} style={{ display: 'flex', gap: 10, padding: '11px 14px', borderBottom: '1px solid var(--border-soft)', background: isUnread ? 'var(--bg-inset)' : 'transparent', cursor: i.campaignId ? 'pointer' : 'default' }} onClick={() => openItem(i)}>
                <span style={{ fontSize: 15, color: toneColor, flexShrink: 0 }}>{i.icon}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>{i.title}</span>
                    {i.count > 1 && <span style={{ fontSize: 10.5, fontWeight: 700, color: PURPLE, background: PURPLE + '22', borderRadius: 999, padding: '1px 6px' }}>×{i.count}</span>}
                    {isUnread && <span style={{ width: 7, height: 7, borderRadius: 999, background: ACCENT, marginLeft: 'auto', flexShrink: 0 }} />}
                  </div>
                  {i.detail && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.detail}</div>}
                  <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 3 }}>{i.at ? new Date(i.at).toLocaleString() : ''}</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); dismiss(i.id) }} title="Dismiss" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 13, alignSelf: 'flex-start' }}>✕</button>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--text-faint)' }}>{children}</div>
}
