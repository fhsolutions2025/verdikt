'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTheme } from '@/components/shared/ThemeProvider'
import { usePageAsset } from '@/components/shared/PageAssets'

export interface PromoBannerLite {
  id:        string
  image_url: string
  headline:  string
  subtext:   string
  cta_label: string
  cta_href:  string
}

const AUTO_MS = 5000

// Home hero carousel — Visual skin only. Cycles the company-managed promo banners
// (image + overlay headline/subtext/CTA) with auto-advance, swipe and dots. Falls
// back to the single `hero_cta_banner` page asset when no banners are configured.
export function BannerCarousel({ banners }: { banners: PromoBannerLite[] }) {
  const { skin }   = useTheme()
  const fallback   = usePageAsset('hero_cta_banner')
  const [idx, setIdx] = useState(0)
  const touchX     = useRef<number | null>(null)

  const slides = banners.filter(b => b.image_url || b.headline)

  useEffect(() => {
    if (slides.length <= 1) return
    const t = setInterval(() => setIdx(i => (i + 1) % slides.length), AUTO_MS)
    return () => clearInterval(t)
  }, [slides.length])

  if (skin !== 'visual') return null

  // No banners configured → single fallback hero slide.
  if (slides.length === 0) {
    return (
      <div className="px-4 pb-4">
        <Link href="/player" className="block no-underline">
          <Slide
            image={fallback?.public_url ?? null}
            alt={fallback?.alt_text ?? 'Verdikt'}
            headline="Predict. Trade. Win."
            subtext="Turn your read on the world into real positions."
            cta="Explore markets →"
          />
        </Link>
      </div>
    )
  }

  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return
    const dx = e.changedTouches[0].clientX - touchX.current
    if (Math.abs(dx) > 40) {
      setIdx(i => (i + (dx < 0 ? 1 : -1) + slides.length) % slides.length)
    }
    touchX.current = null
  }

  const active = slides[idx]

  return (
    <div className="px-4 pb-4">
      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <Link href={active.cta_href || '/player'} className="block no-underline">
          <Slide
            image={active.image_url || null}
            alt={active.headline}
            headline={active.headline}
            subtext={active.subtext}
            cta={active.cta_label}
          />
        </Link>
      </div>

      {slides.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              aria-label={`Go to slide ${i + 1}`}
              style={{
                width: i === idx ? 18 : 7, height: 7, borderRadius: 999,
                border: 'none', cursor: 'pointer', padding: 0,
                backgroundColor: i === idx ? '#00C853' : 'var(--border-strong)',
                transition: 'all 0.2s',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Slide({
  image, alt, headline, subtext, cta,
}: {
  image: string | null; alt: string; headline: string; subtext: string; cta: string
}) {
  return (
    <div
      style={{
        position: 'relative', width: '100%', aspectRatio: '3 / 1', borderRadius: 18, overflow: 'hidden',
        background: image ? 'var(--bg-inset)' : 'linear-gradient(120deg, #06281A 0%, #0A3D26 55%, #00C853 140%)',
        border: '1px solid var(--border)',
      }}
    >
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={alt} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 45%, rgba(0,0,0,0) 75%)' }} />
      <div style={{ position: 'absolute', inset: 0, padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
        {headline && <p style={{ margin: 0, color: '#fff', fontSize: 17, fontWeight: 800, lineHeight: 1.15 }}>{headline}</p>}
        {subtext && <p style={{ margin: 0, color: 'rgba(255,255,255,0.85)', fontSize: 11, maxWidth: 220 }}>{subtext}</p>}
        {cta && (
          <span style={{ marginTop: 4, alignSelf: 'flex-start', padding: '6px 12px', borderRadius: 999, backgroundColor: '#00C853', color: '#04130B', fontSize: 11, fontWeight: 800 }}>
            {cta}
          </span>
        )}
      </div>
    </div>
  )
}
