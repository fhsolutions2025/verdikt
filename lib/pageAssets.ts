// Page-asset slot registry — the single source of truth for every image the
// Visual theme (Theme 2) can render. The company "Page Design" tab is generated
// from this list, and <ThemeImage> resolves a slot to its live image (or an
// exact-dimension placeholder) from this list.
//
// Resolution order for a market thumbnail (see thumbnailSlotFor):
//   market override (slot_key = "market:<id>")  →  category slot  →  default slot
//
// IP-safety: default prompts steer to GENERIC / ABSTRACT imagery only — no real
// people, team or brand logos, or real flags. The Page Design save route also
// enforces a banned-terms guard.

import type { MarketCategory } from './types'

export type AssetGroup = 'Market Cards' | 'Hero / CTA' | 'Empty States'

export interface AssetSlot {
  key:         string        // stable, unique slot id
  group:       AssetGroup
  label:       string        // human label in the Page Design tab
  width:       number        // exact display px (placeholder box + next/image)
  height:      number
  ratio:       IdeogramRatio // aspect passed to Ideogram at generation time
  prompt:      string        // default pre-prompt (editable in the tab)
  altTemplate: string        // default alt text
  seoTags:     string[]      // default SEO tags
}

// Valid Ideogram V_2 aspect ratios (mirrors ideogram-proxy VALID_RATIOS).
export type IdeogramRatio =
  | 'ASPECT_1_1' | 'ASPECT_16_9' | 'ASPECT_9_16' | 'ASPECT_4_3'
  | 'ASPECT_3_4' | 'ASPECT_2_3'  | 'ASPECT_3_2'  | 'ASPECT_10_16' | 'ASPECT_16_10'

const THUMB = { width: 96, height: 96, ratio: 'ASPECT_1_1' as const, group: 'Market Cards' as const }

// ── Category thumbnails ───────────────────────────────────────────────────────
// One generic image per category covers every card in that category.
const CATEGORY_THUMBS: AssetSlot[] = [
  {
    ...THUMB,
    key:   'market_thumb_sports',
    label: 'Sports thumbnail',
    prompt:
      'Flat geometric icon representing competitive sport in the abstract — a stylised ' +
      'generic trophy and motion arcs, no team logos, no real athletes, no text. ' +
      'Emerald green and charcoal, clean vector, centred, subtle depth, premium app icon.',
    altTemplate: 'Sports prediction market',
    seoTags:     ['sports', 'prediction market', 'thumbnail'],
  },
  {
    ...THUMB,
    key:   'market_thumb_finance',
    label: 'Finance / crypto thumbnail',
    prompt:
      'Flat geometric icon for finance and crypto markets in the abstract — a generic ' +
      'rising candlestick chart and an unbranded coin shape, no real logos or tickers, no text. ' +
      'Emerald green and charcoal, clean vector, centred, premium app icon.',
    altTemplate: 'Finance and crypto prediction market',
    seoTags:     ['finance', 'crypto', 'prediction market', 'thumbnail'],
  },
  {
    ...THUMB,
    key:   'market_thumb_politics',
    label: 'Politics thumbnail',
    prompt:
      'Flat geometric icon for civic and political markets in the abstract — a generic ' +
      'ballot box and check mark, no real flags, no real politicians, no party symbols, no text. ' +
      'Emerald green and charcoal, clean vector, centred, premium app icon.',
    altTemplate: 'Politics prediction market',
    seoTags:     ['politics', 'elections', 'prediction market', 'thumbnail'],
  },
  {
    ...THUMB,
    key:   'market_thumb_current_affairs',
    label: 'Current affairs thumbnail',
    prompt:
      'Flat geometric icon for news and current affairs in the abstract — a generic ' +
      'newspaper and a globe outline, no real logos, no recognisable people, no text. ' +
      'Emerald green and charcoal, clean vector, centred, premium app icon.',
    altTemplate: 'Current affairs prediction market',
    seoTags:     ['news', 'current affairs', 'prediction market', 'thumbnail'],
  },
  {
    ...THUMB,
    key:   'market_thumb_default',
    label: 'Default thumbnail (fallback)',
    prompt:
      'Flat geometric icon representing a prediction market in the abstract — a generic ' +
      'yes/no fork and an upward arrow, no text, no logos, no people. ' +
      'Emerald green and charcoal, clean vector, centred, premium app icon.',
    altTemplate: 'Prediction market',
    seoTags:     ['prediction market', 'thumbnail'],
  },
]

// ── Hero / CTA + empty states ─────────────────────────────────────────────────
const OTHER_SLOTS: AssetSlot[] = [
  {
    key:    'hero_cta_banner',
    group:  'Hero / CTA',
    label:  'Home hero / CTA banner',
    width:  1200,
    height: 400,            // 3:1 display box; generated 16:9 and cover-cropped
    ratio:  'ASPECT_16_9',
    prompt:
      'Wide premium banner for a prediction-market app, abstract and brandable — flowing ' +
      'emerald-green energy ribbons and soft geometric shapes over a deep charcoal background, ' +
      'a faint upward-trending line motif, generous negative space on the left for a headline. ' +
      'No text, no logos, no real people. Cinematic, modern fintech, high contrast.',
    altTemplate: 'Predict, trade, win — Verdikt markets',
    seoTags:     ['hero', 'cta', 'banner', 'prediction market'],
  },
  {
    key:    'empty_positions',
    group:  'Empty States',
    label:  'Empty positions illustration',
    width:  320,
    height: 240,
    ratio:  'ASPECT_4_3',
    prompt:
      'Friendly minimal illustration for an empty portfolio state — an abstract empty wallet ' +
      'and a small sprouting upward arrow, lots of negative space, no text, no logos. ' +
      'Emerald green and charcoal, soft flat vector, encouraging and calm.',
    altTemplate: 'No positions yet',
    seoTags:     ['empty state', 'positions', 'illustration'],
  },
]

export const ASSET_SLOTS: AssetSlot[] = [...CATEGORY_THUMBS, ...OTHER_SLOTS]

const SLOT_BY_KEY: Record<string, AssetSlot> = Object.fromEntries(
  ASSET_SLOTS.map(s => [s.key, s]),
)

export function getSlot(key: string): AssetSlot | undefined {
  return SLOT_BY_KEY[key]
}

export function slotsByGroup(): { group: AssetGroup; slots: AssetSlot[] }[] {
  const order: AssetGroup[] = ['Market Cards', 'Hero / CTA', 'Empty States']
  return order.map(group => ({ group, slots: ASSET_SLOTS.filter(s => s.group === group) }))
}

// Category → its thumbnail slot key (falls back to default).
export function categorySlotKey(category: MarketCategory | string | null | undefined): string {
  const key = `market_thumb_${category}`
  return SLOT_BY_KEY[key] ? key : 'market_thumb_default'
}

// Per-market override slot key.
export function marketOverrideKey(marketId: string): string {
  return `market:${marketId}`
}

// Ordered candidate slot keys for a market thumbnail: override → category → default.
// <ThemeImage> picks the first key that has a live asset.
export function thumbnailSlotCandidates(
  marketId: string,
  category: MarketCategory | string | null | undefined,
): string[] {
  return [marketOverrideKey(marketId), categorySlotKey(category), 'market_thumb_default']
}
