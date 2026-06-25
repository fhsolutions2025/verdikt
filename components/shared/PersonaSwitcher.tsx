'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { VerdiktLogo } from './VerdiktLogo'

const PORTALS = [
  { label: 'Company',  href: '/company',  key: '/company'  },
  { label: 'MM Desk',  href: '/mm-desk',  key: '/mm-desk'  },
  { label: 'Player',   href: '/player',   key: '/player'   },
]

export function PersonaSwitcher() {
  const pathname = usePathname()
  if (pathname.startsWith('/(auth)') || pathname === '/') return null

  const isCompany  = pathname.startsWith('/company')
  const isMmDesk   = pathname.startsWith('/mm-desk')
  const isDark     = isCompany

  // Company portal has its own full-screen layout with embedded header
  if (isCompany) return null

  return (
    <header
      className="flex items-center justify-between px-4 py-3"
      style={{
        backgroundColor: isDark ? '#0D1117' : isMmDesk ? '#F6F8F6' : '#FFFFFF',
        borderBottom: isDark
          ? '1px solid rgba(255,255,255,0.08)'
          : '1px solid #E5E7EB',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}
    >
      <Link href="/" className="flex items-center gap-2 no-underline">
        <VerdiktLogo size={26} />
        <span
          className="font-bold text-sm tracking-tight"
          style={{ color: isDark ? '#FFFFFF' : '#111A11' }}
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
                backgroundColor: active
                  ? isDark ? 'rgba(0,200,83,0.15)' : '#00C853'
                  : 'transparent',
                color: active
                  ? isDark ? '#00C853' : '#FFFFFF'
                  : isDark ? '#6B7280' : '#374151',
              }}
            >
              {p.label}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
