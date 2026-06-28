// Splash-page asset slots — the images the public splash / login screen renders.
// Same shape + storage as lib/pageAssets.ts (one active image per slot_key in the
// page_assets table), but kept in a separate registry so the company "Design Splash"
// module is scoped to just these slots. Each slot ships with a pre-written, IP-safe
// prompt + alt text + SEO tags; the admin can edit the prompt, Generate, preview,
// Save/Regenerate, and once saved it is pushed live to the splash.

import type { IdeogramRatio } from './pageAssets'

export interface SplashSlot {
  key:         string
  label:       string
  width:       number
  height:      number
  ratio:       IdeogramRatio
  prompt:      string
  altTemplate: string
  seoTags:     string[]
}

export const SPLASH_SLOTS: SplashSlot[] = [
  {
    key:    'splash_hero',
    label:  'Splash hero visual',
    width:  1100,
    height: 1100,
    ratio:  'ASPECT_1_1',
    prompt:
      'A clean, light, premium hero illustration for a prediction-market app: a softly ' +
      'dotted world globe rendered in light grey, with slender upward emerald-green data ' +
      'spikes (thin lines tipped with small glowing dots) rising from points across the ' +
      'continents, evoking live signals and forecasts. Bright airy white background, ' +
      'generous negative space, subtle green glow near the horizon. Abstract and brandable, ' +
      'no text, no logos, no real flags, no real people. Modern fintech, high clarity.',
    altTemplate: 'Verdikt — global prediction markets where your judgment meets real-world outcomes',
    seoTags:     ['prediction market', 'forecasting', 'verdikt', 'global', 'hero'],
  },
]

const BY_KEY: Record<string, SplashSlot> = Object.fromEntries(SPLASH_SLOTS.map(s => [s.key, s]))

export function getSplashSlot(key: string): SplashSlot | undefined {
  return BY_KEY[key]
}

export function isSplashSlotKey(key: string): boolean {
  return key in BY_KEY
}
