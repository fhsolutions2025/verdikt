import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActivePageAssets } from '@/lib/pageAssetsServer'
import { getSplashSlot } from '@/lib/splashAssets'
import { VerdiktLogo } from '@/components/shared/VerdiktLogo'
import { LoginForm } from '@/components/auth/LoginForm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Verdikt — Predict. Trade. Shape Tomorrow.',
  description: 'Verdikt is a play-money prediction-market platform where your judgment meets the world’s outcomes. For research and education only.',
}

export default async function SplashPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/player')

  // Resolve the admin-designed splash hero (Design Splash module) or fall back to a placeholder.
  const slot = getSplashSlot('splash_hero')!
  const assets = await getActivePageAssets()
  const hero = assets.find(a => a.slot_key === 'splash_hero') ?? null

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#FFFFFF', color: '#0B1220' }}>
      <div className="flex flex-col lg:flex-row" style={{ flex: 1 }}>
        {/* ── Left: hero ─────────────────────────────────────────────── */}
        <section className="p-8 lg:p-16" style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <VerdiktLogo size={40} />
            <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '0.18em', color: '#0B1220' }}>VERDIKT</span>
          </div>

          {/* Headline */}
          <div style={{ marginTop: 48 }}>
            <h1 style={{ fontSize: 'clamp(40px, 6vw, 68px)', fontWeight: 800, lineHeight: 1.04, margin: 0 }}>
              <span style={{ display: 'block', color: '#0B1220' }}>Predict.</span>
              <span style={{ display: 'block', color: '#0B1220' }}>Trade.</span>
              <span style={{ display: 'block', background: 'linear-gradient(90deg, #00C853, #A8E80B)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Shape Tomorrow.</span>
            </h1>
            <p style={{ marginTop: 22, maxWidth: 440, fontSize: 17, lineHeight: 1.5, color: '#475569' }}>
              Verdikt is a play-money prediction-market platform where your judgment meets the world’s outcomes.
            </p>
          </div>

          {/* Hero visual (admin-designed slot, or a sized placeholder) */}
          <div style={{ flex: 1, minHeight: 220, position: 'relative', marginTop: 24 }}>
            {hero ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={hero.public_url}
                alt={hero.alt_text || slot.altTemplate}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'left bottom' }}
              />
            ) : (
              <div role="img" aria-label={slot.altTemplate} style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 8, borderRadius: 20, border: '1px dashed #CBD5E1', background: 'linear-gradient(180deg, #F8FAFC, #F1F5F9)', color: '#94A3B8',
              }}>
                <span style={{ fontSize: 32 }}>🌐</span>
                <span style={{ fontSize: 12 }}>Hero visual · {slot.width}×{slot.height}</span>
                <span style={{ fontSize: 11 }}>Generate it in Company → Design Splash</span>
              </div>
            )}
          </div>

          {/* Feature chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, marginTop: 24 }}>
            <Feature icon="🌐" a="Real Events" b="Real Outcomes" />
            <Feature icon="⚡" a="Free to Play" b="Anytime, Anywhere" />
            <Feature icon="🛡" a="Fair & Transparent" b="Play-money fun" />
          </div>
        </section>

        {/* ── Right: sign-in ────────────────────────────────────────── */}
        <section className="p-6 lg:p-12" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC' }}>
          <LoginForm />
        </section>
      </div>

      {/* Footer — disclaimer only */}
      <footer style={{ padding: '16px 24px', textAlign: 'center', borderTop: '1px solid #EEF2F6' }}>
        <p style={{ margin: 0, fontSize: 12, color: '#94A3B8' }}>
          For research and education purposes only. No real money involved. © 2026 Verdikt.
        </p>
      </footer>
    </div>
  )
}

function Feature({ icon, a, b }: { icon: string; a: string; b: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ width: 48, height: 48, borderRadius: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, background: '#FFFFFF', border: '1px solid #E2E8F0', boxShadow: '0 2px 6px rgba(15,23,42,0.05)' }}>{icon}</span>
      <div style={{ lineHeight: 1.35 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0B1220' }}>{a}</div>
        <div style={{ fontSize: 12.5, color: '#64748B' }}>{b}</div>
      </div>
    </div>
  )
}
