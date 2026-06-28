'use client'

import { useMemo, useState } from 'react'
import type { CSSProperties, ReactNode, JSX } from 'react'
import { ACCENT, S, Btn } from './theme'
import type { AssetItem, AssetType } from './types'
import { AssetCard } from './AssetCard'

type FilterKey = 'all' | AssetType

const TABS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All Assets' },
  { key: 'image', label: 'Images' },
  { key: 'video', label: 'Videos' },
  { key: 'carousel', label: 'Carousels' },
  { key: 'copy', label: 'Copy' },
]

type ViewMode = 'grid' | 'list'

export function AssetGrid({
  assets,
  onGenerateVideo,
  onSelectVariation,
  generatingId,
}: {
  assets: AssetItem[]
  onGenerateVideo: (taskId: string) => void
  onSelectVariation?: (taskId: string, url: string) => void
  generatingId?: string | null
}): JSX.Element {
  const [filter, setFilter] = useState<FilterKey>('all')
  const [view, setView] = useState<ViewMode>('grid')

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { all: assets.length, image: 0, video: 0, carousel: 0, copy: 0 }
    for (const a of assets) c[a.type] += 1
    return c
  }, [assets])

  const visible = useMemo(
    () => (filter === 'all' ? assets : assets.filter((a) => a.type === filter)),
    [assets, filter],
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        {/* Filter tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {TABS.map((t) => {
            const active = filter === t.key
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setFilter(t.key)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '6px 11px',
                  borderRadius: 999,
                  border: `1px solid ${active ? ACCENT : 'var(--border)'}`,
                  color: active ? ACCENT : 'var(--text)',
                  backgroundColor: active ? 'transparent' : 'var(--bg-surface)',
                }}
              >
                {t.label}
                <span style={{ color: 'var(--text-faint)', fontWeight: 700 }}>({counts[t.key]})</span>
              </button>
            )
          })}
        </div>

        {/* View toggle + filter (visual only) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'inline-flex', ...S.inset, padding: 2, gap: 2 }}>
            <ViewToggleBtn active={view === 'grid'} onClick={() => setView('grid')} label="Grid">
              ▦
            </ViewToggleBtn>
            <ViewToggleBtn active={view === 'list'} onClick={() => setView('list')} label="List">
              ☰
            </ViewToggleBtn>
          </div>
          <Btn variant="soft" size="sm">⛃ Filter</Btn>
        </div>
      </div>

      {/* Grid / empty */}
      {visible.length === 0 ? (
        <div
          style={{
            ...S.inset,
            padding: 36,
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--text-dim)',
          }}
        >
          No assets in this view yet.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              view === 'list' ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 14,
          }}
        >
          {visible.map((a) => (
            <AssetCard
              key={a.id}
              asset={a}
              onGenerateVideo={onGenerateVideo}
              onSelectVariation={onSelectVariation}
              generating={generatingId === a.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ViewToggleBtn({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  children: ReactNode
}) {
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 24,
    fontSize: 13,
    cursor: 'pointer',
    borderRadius: 6,
    border: 'none',
    color: active ? '#fff' : 'var(--text-dim)',
    background: active ? ACCENT : 'transparent',
  }
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} style={style}>
      {children}
    </button>
  )
}
