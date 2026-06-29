'use client'

import { useMemo, useState } from 'react'
import type { CSSProperties, ReactNode, JSX } from 'react'
import { ACCENT, S, Btn } from './theme'
import type { AssetItem, AssetType } from './types'
import { AssetCard } from './AssetCard'
import { AssetTimelineView, AssetKanbanView, AssetContextMenu } from './AssetViews'

type FilterKey = 'all' | AssetType

const TABS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All Assets' },
  { key: 'image', label: 'Images' },
  { key: 'video', label: 'Videos' },
  { key: 'carousel', label: 'Carousels' },
  { key: 'copy', label: 'Copy' },
]

type ViewMode = 'grid' | 'list' | 'timeline' | 'kanban'

export function AssetGrid({
  assets,
  onGenerateVideo,
  onSelectVariation,
  onSelectAsset,
  generatingId,
}: {
  assets: AssetItem[]
  onGenerateVideo: (taskId: string) => void
  onSelectVariation?: (taskId: string, url: string) => void
  onSelectAsset?: (asset: AssetItem) => void
  generatingId?: string | null
}): JSX.Element {
  const [filter, setFilter] = useState<FilterKey>('all')
  const [view, setView] = useState<ViewMode>('grid')
  const [menu, setMenu] = useState<{ asset: AssetItem; x: number; y: number } | null>(null)
  const byId = (id: string) => assets.find(a => a.id === id)

  const onAssetAction = (asset: AssetItem, action: string) => {
    if (action === 'export' && asset.url) window.open(asset.url, '_blank', 'noopener,noreferrer')
    else if (action === 'regenerate' && asset.type === 'video') onGenerateVideo(asset.id)
    else onSelectAsset?.(asset) // open / approve / review / rename / … happen in the Inspector
  }

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
            <ViewToggleBtn active={view === 'grid'} onClick={() => setView('grid')} label="Grid">▦</ViewToggleBtn>
            <ViewToggleBtn active={view === 'list'} onClick={() => setView('list')} label="List">☰</ViewToggleBtn>
            <ViewToggleBtn active={view === 'timeline'} onClick={() => setView('timeline')} label="Timeline">⧗</ViewToggleBtn>
            <ViewToggleBtn active={view === 'kanban'} onClick={() => setView('kanban')} label="Kanban">▥</ViewToggleBtn>
          </div>
          <Btn variant="soft" size="sm">⛃ Filter</Btn>
        </div>
      </div>

      {/* Views */}
      {visible.length === 0 ? (
        <div style={{ ...S.inset, padding: 36, textAlign: 'center', fontSize: 13, color: 'var(--text-dim)' }}>
          No assets in this view yet.
        </div>
      ) : view === 'timeline' ? (
        <AssetTimelineView assets={visible} onSelect={(id) => { const a = byId(id); if (a) onSelectAsset?.(a) }} />
      ) : view === 'kanban' ? (
        <AssetKanbanView assets={visible} onSelect={(id) => { const a = byId(id); if (a) onSelectAsset?.(a) }} />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: view === 'list' ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 14,
          }}
        >
          {visible.map((a) => (
            <div key={a.id} onContextMenu={(e) => { e.preventDefault(); setMenu({ asset: a, x: e.clientX, y: e.clientY }) }}>
              <AssetCard
                asset={a}
                onGenerateVideo={onGenerateVideo}
                onSelectVariation={onSelectVariation}
                generating={generatingId === a.id}
              />
            </div>
          ))}
        </div>
      )}

      {menu && (
        <AssetContextMenu
          x={menu.x} y={menu.y} asset={menu.asset}
          onAction={(action) => onAssetAction(menu.asset, action)}
          onClose={() => setMenu(null)}
        />
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
