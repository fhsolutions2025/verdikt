'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { SkinToggle } from '@/components/shared/SkinToggle'
import { SideDrawer } from './SideDrawer'
import { ResultsDrawer } from './ResultsDrawer'

interface Props {
  open:    boolean
  onClose: () => void
}

interface MenuLink {
  label: string
  href:  string
  icon:  string
}

// Grouped exactly as the design: account/activity links, then info pages.
const ACCOUNT_LINKS: MenuLink[] = [
  { label: 'Profile',   href: '/player/profile',       icon: '👤' },
  { label: 'Rewards',   href: '/player/info/rewards',  icon: '🎁' },
  { label: 'Wallet',    href: '/player/wallet',        icon: '💳' },
  { label: 'Positions', href: '/player/positions',     icon: '📊' },
]

const INFO_LINKS: MenuLink[] = [
  { label: 'About Verdikt',   href: '/player/info/about',   icon: 'ℹ️' },
  { label: 'Privacy Policy',  href: '/player/info/privacy', icon: '🔒' },
  { label: 'Terms of Service', href: '/player/info/terms',  icon: '📄' },
  { label: 'Support',         href: '/player/info/support', icon: '🎧' },
]

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 pt-4 pb-2">
      <p className="text-xs font-bold uppercase mb-2" style={{ color: 'var(--text-faint)', letterSpacing: '0.06em' }}>
        {label}
      </p>
      {children}
    </div>
  )
}

function Row({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left"
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-strong)' }}
    >
      <span style={{ fontSize: 17, width: 22, textAlign: 'center' }}>{icon}</span>
      <span className="text-sm font-semibold">{label}</span>
    </button>
  )
}

function Divider() {
  return <div style={{ height: 1, backgroundColor: 'var(--border)', margin: '4px 0' }} />
}

export function PlayerMenuDrawer({ open, onClose }: Props) {
  const router = useRouter()
  const [resultsOpen, setResultsOpen] = useState(false)
  const [loggingOut, setLoggingOut]   = useState(false)

  const go = (href: string) => { onClose(); router.push(href) }

  const openResults = () => { onClose(); setResultsOpen(true) }

  const logout = async () => {
    setLoggingOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
      <SideDrawer open={open} onClose={onClose} title="Menu" width={340}>
        {/* Theme */}
        <Section label="Theme">
          <ThemeToggle />
        </Section>
        <Divider />

        {/* Display (with / without image) */}
        <Section label="Display">
          <SkinToggle />
        </Section>
        <Divider />

        {/* Activity + account */}
        <div className="py-1">
          <Row icon="📈" label="Results" onClick={openResults} />
          {ACCOUNT_LINKS.map(l => (
            <Row key={l.href} icon={l.icon} label={l.label} onClick={() => go(l.href)} />
          ))}
        </div>
        <Divider />

        {/* Info / legal (CMS-managed) */}
        <div className="py-1">
          {INFO_LINKS.map(l => (
            <Row key={l.href} icon={l.icon} label={l.label} onClick={() => go(l.href)} />
          ))}
        </div>
        <Divider />

        {/* Log out */}
        <div className="py-1 pb-6">
          <button
            onClick={logout}
            disabled={loggingOut}
            className="w-full flex items-center gap-3 px-4 py-3 text-left"
            style={{ background: 'none', border: 'none', cursor: loggingOut ? 'wait' : 'pointer', color: '#DC2626' }}
          >
            <span style={{ fontSize: 17, width: 22, textAlign: 'center' }}>⎋</span>
            <span className="text-sm font-bold">{loggingOut ? 'Logging out…' : 'Log Out'}</span>
          </button>
        </div>
      </SideDrawer>

      {/* Results lives outside the menu so it can layer above it */}
      <ResultsDrawer open={resultsOpen} onClose={() => setResultsOpen(false)} />
    </>
  )
}
