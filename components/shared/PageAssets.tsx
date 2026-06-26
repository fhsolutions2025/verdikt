'use client'

import { createContext, useContext } from 'react'
import { getSlot } from '@/lib/pageAssets'

export interface PageAsset {
  slot_key:   string
  public_url: string
  alt_text:   string
  width:      number | null
  height:     number | null
}

const Ctx = createContext<Record<string, PageAsset>>({})

export function PageAssetsProvider({
  assets,
  children,
}: {
  assets: PageAsset[]
  children: React.ReactNode
}) {
  const map: Record<string, PageAsset> = {}
  for (const a of assets) map[a.slot_key] = a
  return <Ctx.Provider value={map}>{children}</Ctx.Provider>
}

// Returns the first candidate slot that has a live asset, or null.
export function usePageAsset(candidates: string | string[]): PageAsset | null {
  const map = useContext(Ctx)
  const keys = Array.isArray(candidates) ? candidates : [candidates]
  for (const k of keys) {
    if (map[k]) return map[k]
  }
  return null
}

interface ThemeImageProps {
  /** One slot key, or an ordered candidate list (first live asset wins). */
  slot:        string | string[]
  /** Fallback dimensions when the slot isn't in the registry (e.g. per-market override keys). */
  width?:      number
  height?:     number
  rounded?:    number | string
  className?:  string
  style?:      React.CSSProperties
  /** Override alt text; defaults to the asset's stored alt. */
  alt?:        string
  /** Shown inside the placeholder box when no asset exists yet. */
  placeholderLabel?: string
  /** object-fit for the image (default 'cover'). */
  fit?:        'cover' | 'contain'
}

// Renders the live asset for a slot at exact dimensions, or a labelled
// placeholder box of the same size (so layout never shifts before generation).
export function ThemeImage({
  slot, width, height, rounded = 12, className, style, alt, placeholderLabel, fit = 'cover',
}: ThemeImageProps) {
  const asset = usePageAsset(slot)

  // Dimensions: explicit props > registry slot > square fallback.
  const firstKey = Array.isArray(slot) ? slot[slot.length - 1] : slot
  const reg      = getSlot(firstKey)
  const w        = width  ?? reg?.width  ?? 96
  const h        = height ?? reg?.height ?? 96
  const radius   = typeof rounded === 'number' ? `${rounded}px` : rounded

  const box: React.CSSProperties = {
    width: w, height: h, borderRadius: radius, overflow: 'hidden', flexShrink: 0, ...style,
  }

  if (asset) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={asset.public_url}
        alt={alt ?? asset.alt_text}
        width={w}
        height={h}
        loading="lazy"
        className={className}
        style={{ ...box, objectFit: fit, display: 'block' }}
      />
    )
  }

  const label = placeholderLabel ?? reg?.label ?? 'image pending'
  return (
    <div
      className={className}
      aria-hidden="true"
      style={{
        ...box,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 6,
        backgroundColor: 'var(--bg-inset)',
        border: '1px dashed var(--border-strong)',
        color: 'var(--text-faint)',
        fontSize: Math.max(8, Math.min(11, Math.round(w / 9))),
        lineHeight: 1.2,
      }}
    >
      {label}
    </div>
  )
}
