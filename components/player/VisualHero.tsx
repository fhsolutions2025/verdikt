'use client'

import Link from 'next/link'
import { useTheme } from '@/components/shared/ThemeProvider'
import { usePageAsset } from '@/components/shared/PageAssets'

// Home hero / CTA banner — only rendered in the Visual skin. Uses the
// `hero_cta_banner` page asset as the backdrop (or a gradient placeholder until
// one is generated), with an overlaid headline and CTA.
export function VisualHero() {
  const { skin } = useTheme()
  const asset    = usePageAsset('hero_cta_banner')
  if (skin !== 'visual') return null

  return (
    <div className="px-4 pb-4">
      <Link href="/player" className="block no-underline">
        <div
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '3 / 1',
            borderRadius: 18,
            overflow: 'hidden',
            background: asset ? 'var(--bg-inset)' : 'linear-gradient(120deg, #06281A 0%, #0A3D26 55%, #00C853 140%)',
            border: '1px solid var(--border)',
          }}
        >
          {asset && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={asset.public_url}
              alt={asset.alt_text}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
          {/* Left-side scrim so text stays legible over any image */}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 45%, rgba(0,0,0,0) 75%)' }} />
          <div style={{ position: 'absolute', inset: 0, padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
            <p style={{ margin: 0, color: '#fff', fontSize: 17, fontWeight: 800, lineHeight: 1.15 }}>Predict. Trade. Win.</p>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.85)', fontSize: 11, maxWidth: 200 }}>
              Turn your read on the world into real positions.
            </p>
            <span
              style={{
                marginTop: 4, alignSelf: 'flex-start', padding: '6px 12px', borderRadius: 999,
                backgroundColor: '#00C853', color: '#04130B', fontSize: 11, fontWeight: 800,
              }}
            >
              Explore markets →
            </span>
          </div>
        </div>
      </Link>
    </div>
  )
}
