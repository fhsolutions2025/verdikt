'use client'

import { useState, useTransition } from 'react'
import { ApiSource } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/shared/Toast'

const CATEGORY_ORDER = ['finance', 'sports', 'news', 'scraping', 'politics', 'ai']

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  finance:  { label: 'Finance',  icon: '📈' },
  sports:   { label: 'Sports',   icon: '⚽' },
  news:     { label: 'News',     icon: '📰' },
  scraping: { label: 'Scraping', icon: '🔍' },
  politics: { label: 'Politics', icon: '🗳' },
  ai:       { label: 'AI / LLM', icon: '🤖' },
}

const LICENSE_COLORS: Record<string, string> = {
  free_unrestricted:      '#00C853',
  free_demo_only:         '#E05C20',
  metered:                '#6C3FC5',
  paid_required_at_scale: '#9CA3AF',
}

interface Props {
  initial:      ApiSource[]
  defaultOpen?: boolean
}

export function DataSourcesSection({ initial, defaultOpen = false }: Props) {
  const [open, setOpen]         = useState(defaultOpen)
  const [sources, setSources]   = useState(initial)
  const [pending, startTransition] = useTransition()
  const supabase                = createClient()
  const { toast }               = useToast()

  const enabledCount = sources.filter(s => s.enabled && s.category !== 'ai').length

  async function toggle(name: string, nextEnabled: boolean) {
    setSources(prev => prev.map(s => s.name === name ? { ...s, enabled: nextEnabled } : s))

    startTransition(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc('toggle_api_source', {
        p_name:    name,
        p_enabled: nextEnabled,
      })
      if (error) {
        setSources(prev => prev.map(s => s.name === name ? { ...s, enabled: !nextEnabled } : s))
        toast(`Failed to toggle ${name}: ${error.message}`, 'error')
      } else {
        toast(`${name} ${nextEnabled ? 'enabled' : 'disabled'}`, 'success')
      }
    })
  }

  const grouped = CATEGORY_ORDER.reduce<Record<string, ApiSource[]>>((acc, cat) => {
    const items = sources.filter(s => s.category === cat)
    if (items.length) acc[cat] = items
    return acc
  }, {})

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: '#161B22',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Collapsible header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4"
        style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <div className="flex items-center gap-3">
          <h2
            className="text-xs font-bold uppercase tracking-widest"
            style={{ color: '#6B7280', letterSpacing: '0.08em' }}
          >
            Data Sources
          </h2>
          <span className="text-xs" style={{ color: '#4B5563' }}>
            — {enabledCount} of {sources.filter(s => s.category !== 'ai').length} data sources active
          </span>
        </div>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
          <path
            d={open ? 'M2 8L6 4L10 8' : 'M2 4L6 8L10 4'}
            stroke="#4B5563"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5">
          <p className="text-xs leading-snug" style={{ color: '#4B5563' }}>
            Toggle sources on/off to control what data feeds into AI market pricing and live price strips on player cards.
            Changes take effect on the next scheduled run.
          </p>

          {Object.entries(grouped).map(([cat, items]) => {
            const meta = CATEGORY_LABELS[cat] ?? { label: cat, icon: '•' }
            return (
              <section key={cat} className="space-y-2">
                <p className="text-xs font-bold uppercase" style={{ color: '#374151' }}>
                  {meta.icon} {meta.label}
                </p>
                <div className="space-y-1">
                  {items.map(src => {
                    const color = LICENSE_COLORS[src.license_tier] ?? '#6B7280'
                    const isAi  = src.category === 'ai'
                    return (
                      <div
                        key={src.id}
                        className="flex items-start justify-between gap-3 rounded-xl px-3 py-2.5"
                        style={{
                          backgroundColor: src.enabled ? 'rgba(0,200,83,0.04)' : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${src.enabled ? 'rgba(0,200,83,0.12)' : 'rgba(255,255,255,0.04)'}`,
                          opacity: isAi ? 0.6 : 1,
                        }}
                      >
                        <div className="space-y-0.5 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium" style={{ color: '#D1D5DB' }}>
                              {src.name}
                            </span>
                            <span
                              className="text-xs px-1.5 py-0.5 rounded font-bold"
                              style={{ backgroundColor: color + '18', color }}
                            >
                              {src.license_tier.replace(/_/g, ' ')}
                            </span>
                            {src.rate_limit_per_minute != null && (
                              <span className="text-xs font-mono" style={{ color: '#4B5563' }}>
                                {src.rate_limit_per_minute}/min
                              </span>
                            )}
                          </div>
                          {src.commercial_note && (
                            <p className="text-xs leading-snug" style={{ color: '#4B5563' }}>
                              {src.commercial_note}
                            </p>
                          )}
                        </div>

                        {/* Toggle — AI sources are always on (managed via Anthropic dashboard) */}
                        {isAi ? (
                          <span className="text-xs flex-shrink-0 mt-0.5" style={{ color: '#4B5563' }}>
                            always on
                          </span>
                        ) : (
                          <button
                            onClick={() => toggle(src.name, !src.enabled)}
                            disabled={pending}
                            className="flex-shrink-0 mt-0.5"
                            style={{
                              width: 40, height: 22,
                              borderRadius: 11,
                              backgroundColor: src.enabled ? '#00C853' : '#374151',
                              border: 'none',
                              cursor: pending ? 'wait' : 'pointer',
                              position: 'relative',
                              transition: 'background-color 0.15s',
                            }}
                            aria-label={`${src.enabled ? 'Disable' : 'Enable'} ${src.name}`}
                          >
                            <span
                              style={{
                                position: 'absolute',
                                top: 3, left: src.enabled ? 21 : 3,
                                width: 16, height: 16,
                                borderRadius: '50%',
                                backgroundColor: '#FFFFFF',
                                transition: 'left 0.15s',
                              }}
                            />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
