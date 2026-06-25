'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { VerdiktLogo } from './VerdiktLogo'
import { ThemeToggle } from './ThemeToggle'

const PORTALS = [
  { label: 'Company',  href: '/company',  key: '/company'  },
  { label: 'MM Desk',  href: '/mm-desk',  key: '/mm-desk'  },
  { label: 'Player',   href: '/player',   key: '/player'   },
]

export function PersonaSwitcher() {
  const pathname = usePathname()
  if (pathname.startsWith('/(auth)') || pathname === '/') return null

  const isCompany  = pathname.startsWith('/company')

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
        <span className="mx-1" style={{ width: 1, height: 18, backgroundColor: 'var(--border-strong)' }} />
        <ThemeToggle compact />
      </nav>
    </header>
  )
}
