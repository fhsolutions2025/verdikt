'use client'

import { useTheme, type ThemeSkin } from './ThemeProvider'

function IconClassic({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1.5" y="2.5" width="11" height="3" rx="1" stroke={color} strokeWidth="1.3" />
      <rect x="1.5" y="8.5" width="11" height="3" rx="1" stroke={color} strokeWidth="1.3" />
    </svg>
  )
}

function IconVisual({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1.5" y="2.5" width="11" height="9" rx="1.5" stroke={color} strokeWidth="1.3" />
      <circle cx="5" cy="6" r="1.2" fill={color} />
      <path d="M2.5 10.5L5.5 7.5L7.5 9.5L10 7L11.5 8.5" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const SKINS: { id: ThemeSkin; label: string; Icon: typeof IconClassic }[] = [
  { id: 'classic', label: 'Classic', Icon: IconClassic },
  { id: 'visual',  label: 'Visual',  Icon: IconVisual  },
]

// Skin is an axis independent of light/dark colour mode: it swaps the player
// market surface between the compact "classic" cards and the image-rich "visual"
// theme. Footer + Vega are unaffected.
export function SkinToggle({ compact = false }: { compact?: boolean }) {
  const { skin, setSkin } = useTheme()

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
      aria-label="Theme skin"
    >
      {SKINS.map(({ id, label, Icon }) => {
        const active = skin === id
        const color = active ? '#00C853' : 'var(--tt-fg, #6B7280)'
        return (
          <button
            key={id}
            onClick={() => setSkin(id)}
            title={`${label} theme`}
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
