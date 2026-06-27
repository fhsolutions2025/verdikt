'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { VerdiktLogo } from './VerdiktLogo'
import { ThemeToggle } from './ThemeToggle'
import { PlayerMenuDrawer } from '@/components/player/PlayerMenuDrawer'

function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      {[5, 10, 15].map(y => (
        <line key={y} x1="3" y1={y} x2="17" y2={y} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      ))}
    </svg>
  )
}

const PORTALS = [
  { label: 'Company',  href: '/company',  key: '/company'  },
  { label: 'MM Desk',  href: '/mm-desk',  key: '/mm-desk'  },
  { label: 'Player',   href: '/player',   key: '/player'   },
]

export function PersonaSwitcher() {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  if (pathname.startsWith('/(auth)') || pathname === '/') return null

  const isCompany  = pathname.startsWith('/company')
  const isPlayer   = pathname.startsWith('/player')

  // Company portal has its own full-screen layout with embedded header
  if (isCompany) return null

  return (
    <header
      className="flex items-center justify-between px-4 py-3"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}
    >
      <Link href="/" className="flex items-center gap-2 no-underline">
        <VerdiktLogo size={26} />
        <span
          className="font-bold text-sm tracking-tight"
          style={{ color: 'var(--text-strong)' }}
        >
          Verdikt
        </span>
      </Link>

      <nav className="flex items-center gap-1">
        {PORTALS.map(p => {
          const active = pathname.startsWith(p.key)
          return (
            <Link
              key={p.href}
              href={p.href}
              className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all no-underline"
              style={{
                backgroundColor: active ? 'rgba(0,200,83,0.15)' : 'transparent',
                color: active ? '#00C853' : 'var(--text-dim)',
              }}
            >
              {p.label}
            </Link>
          )
        })}
        {isPlayer ? (
          <>
            <span className="mx-1" style={{ width: 1, height: 18, backgroundColor: 'var(--border-strong)' }} />
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              className="flex items-center justify-center rounded-xl"
              style={{ width: 38, height: 38, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-strong)', cursor: 'pointer' }}
            >
              <HamburgerIcon />
            </button>
          </>
        ) : (
          <>
            <span className="mx-1" style={{ width: 1, height: 18, backgroundColor: 'var(--border-strong)' }} />
            <ThemeToggle compact />
          </>
        )}
      </nav>

      {isPlayer && <PlayerMenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />}
    </header>
  )
}
