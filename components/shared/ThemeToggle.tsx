'use client'

import { useTheme, type ThemeMode } from './ThemeProvider'

function IconSun({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="3" stroke={color} strokeWidth="1.3" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map(a => {
        const r = (a * Math.PI) / 180
        return <line key={a} x1={7 + Math.cos(r) * 4.8} y1={7 + Math.sin(r) * 4.8} x2={7 + Math.cos(r) * 6} y2={7 + Math.sin(r) * 6} stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      })}
    </svg>
  )
}

function IconMoon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M11.5 8.5C10.8 8.8 10 9 9.2 9C6.3 9 4 6.7 4 3.8C4 3 4.2 2.2 4.5 1.5C2.4 2.4 1 4.5 1 7C1 10.3 3.7 13 7 13C9.5 13 11.6 11.6 11.5 8.5Z" stroke={color} strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

function IconAuto({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke={color} strokeWidth="1.3" />
      <path d="M7 1.5V12.5C4 12.5 1.5 10 1.5 7C1.5 4 4 1.5 7 1.5Z" fill={color} />
    </svg>
  )
}

const MODES: { id: ThemeMode; label: string; Icon: typeof IconSun }[] = [
  { id: 'light',  label: 'Light',  Icon: IconSun  },
  { id: 'dark',   label: 'Dark',   Icon: IconMoon },
  { id: 'system', label: 'System', Icon: IconAuto },
]

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { mode, setMode } = useTheme()

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        padding: 2,
        borderRadius: 999,
        border: '1px solid var(--tt-border, rgba(255,255,255,0.1))',
        backgroundColor: 'var(--tt-bg, rgba(255,255,255,0.03))',
      }}
      role="group"
      aria-label="Theme"
    >
      {MODES.map(({ id, label, Icon }) => {
        const active = mode === id
        const color = active ? '#00C853' : 'var(--tt-fg, #6B7280)'
        return (
          <button
            key={id}
            onClick={() => setMode(id)}
            title={`${label} mode`}
            aria-pressed={active}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: compact ? '5px 7px' : '5px 10px',
              borderRadius: 999,
              border: 'none',
              cursor: 'pointer',
              backgroundColor: active ? 'rgba(0,200,83,0.14)' : 'transparent',
              transition: 'all 0.12s',
            }}
          >
            <Icon color={color} />
            {!compact && (
              <span style={{ fontSize: 11, fontWeight: 600, color }}>{label}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
