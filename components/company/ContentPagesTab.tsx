'use client'

import { useState } from 'react'

export interface CmsPage {
  slug:         string
  title:        string
  body:         string
  is_published: boolean
  updated_at:   string
}

const SLUG_LABELS: Record<string, string> = {
  about:   'About Verdikt',
  rewards: 'Rewards',
  privacy: 'Privacy Policy',
  terms:   'Terms of Service',
  support: 'Support',
}

export function ContentPagesTab({ pages: initial }: { pages: CmsPage[] }) {
  const [pages, setPages]   = useState<CmsPage[]>(initial)
  const [activeSlug, setActive] = useState<string>(initial[0]?.slug ?? 'about')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg]       = useState<string | null>(null)

  const active = pages.find(p => p.slug === activeSlug)

  const patch = (fields: Partial<CmsPage>) =>
    setPages(prev => prev.map(p => p.slug === activeSlug ? { ...p, ...fields } : p))

  const save = async () => {
    if (!active) return
    setSaving(true); setMsg(null)
    try {
      const res = await fetch('/api/company/cms', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          slug: active.slug, title: active.title, body: active.body, is_published: active.is_published,
        }),
      })
      const d = await res.json()
      if (res.ok) {
        setMsg('Saved ✓')
        if (d.page) patch({ updated_at: d.page.updated_at })
      } else {
        setMsg(d.error ?? 'Save failed')
      }
    } catch {
      setMsg('Network error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ color: 'var(--text-strong)', fontSize: 18, fontWeight: 800, margin: 0 }}>Content</h2>
        <p style={{ color: 'var(--text-faint)', fontSize: 12, margin: '4px 0 0' }}>
          Edit the info &amp; legal pages players see in their menu. Body supports light markdown
          (#, ##, lists, **bold**, [links](https://…)). Unpublish to hide a page.
        </p>
      </div>

      {/* Page selector */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {pages.map(p => {
          const on = p.slug === activeSlug
          return (
            <button
              key={p.slug}
              onClick={() => { setActive(p.slug); setMsg(null) }}
              style={{
                fontSize: 12, fontWeight: on ? 800 : 600, padding: '6px 12px', borderRadius: 999,
                border: `1px solid ${on ? '#00C853' : 'var(--border)'}`,
                backgroundColor: on ? 'rgba(0,200,83,0.14)' : 'var(--bg-inset)',
                color: on ? '#00A844' : 'var(--text-dim)', cursor: 'pointer',
              }}
            >
              {SLUG_LABELS[p.slug] ?? p.slug}{!p.is_published && ' · hidden'}
            </button>
          )
        })}
      </div>

      {active && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)' }}>
            Title
            <input
              value={active.title}
              onChange={e => patch({ title: e.target.value })}
              style={{
                display: 'block', width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: 10,
                border: '1px solid var(--border)', backgroundColor: 'var(--bg-inset)', color: 'var(--text-strong)',
                fontSize: 14, fontFamily: 'inherit',
              }}
            />
          </label>

          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)' }}>
            Body (markdown)
            <textarea
              value={active.body}
              onChange={e => patch({ body: e.target.value })}
              rows={16}
              style={{
                display: 'block', width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: 10,
                border: '1px solid var(--border)', backgroundColor: 'var(--bg-inset)', color: 'var(--text-strong)',
                fontSize: 13, fontFamily: 'ui-monospace, monospace', lineHeight: 1.5, resize: 'vertical',
              }}
            />
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-dim)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={active.is_published}
                onChange={e => patch({ is_published: e.target.checked })}
              />
              Published
            </label>
            <button
              onClick={save}
              disabled={saving}
              style={{
                fontSize: 13, fontWeight: 700, padding: '9px 20px', borderRadius: 10, border: 'none',
                backgroundColor: saving ? 'var(--border)' : '#00C853', color: saving ? 'var(--text-faint)' : '#FFFFFF',
                cursor: saving ? 'wait' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            {msg && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{msg}</span>}
            <span style={{ fontSize: 11, color: 'var(--text-faintest)', marginLeft: 'auto' }}>
              Last updated {active.updated_at ? new Date(active.updated_at).toLocaleString() : '—'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
