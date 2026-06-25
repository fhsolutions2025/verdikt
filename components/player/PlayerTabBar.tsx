'use client'

import Link from 'next/link'

type Tab = 'markets' | 'positions' | 'create' | 'wallet'

const TABS: { label: string; href: string; key: Tab; icon: string }[] = [
  { label: 'Markets',   href: '/player',           key: 'markets',   icon: '⚡' },
  { label: 'Positions', href: '/player/positions', key: 'positions', icon: '📊' },
  { label: 'Create',    href: '/player/create',    key: 'create',    icon: '✨' },
  { label: 'Wallet',    href: '/player/wallet',    key: 'wallet',    icon: '💳' },
]

interface Props {
  active: Tab
}

export function PlayerTabBar({ active }: Props) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 max-w-[420px] mx-auto flex"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderTop: '1px solid var(--border)',
        zIndex: 50,
      }}
    >
      {TABS.map(tab => {
        const isActive = tab.key === active
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 no-underline min-h-[60px]"
            style={{ color: isActive ? '#00C853' : 'var(--text-faint)' }}
          >
            <span style={{ fontSize: 18 }}>{tab.icon}</span>
            <span
              className="text-xs font-bold"
              style={{ color: isActive ? '#00C853' : 'var(--text-faint)' }}
            >
              {tab.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
