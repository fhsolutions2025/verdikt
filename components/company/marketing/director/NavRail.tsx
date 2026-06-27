'use client'

import type { CSSProperties, JSX } from 'react'
import { ACCENT, Avatar, Badge } from '@/components/company/marketing/director/theme'
import type { NavItem } from '@/components/company/marketing/director/types'

const RAIL_WIDTH = 210
const ACTIVE_BG = 'rgba(0,200,83,0.12)'

export function NavRail({
  items,
  activeId,
  onNavigate,
  user,
}: {
  items: NavItem[]
  activeId: string
  onNavigate: (id: string) => void
  user?: { name: string; plan?: string }
}): JSX.Element {
  return (
    <nav
      style={{
        width: RAIL_WIDTH,
        flexShrink: 0,
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid var(--border)',
        backgroundColor: 'var(--bg-surface)',
        padding: '16px 12px',
      }}
    >
      {/* Wordmark */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 8px 16px',
        }}
      >
        <span
          style={{
            fontWeight: 800,
            fontSize: 18,
            letterSpacing: '0.02em',
            color: ACCENT,
          }}
        >
          VERDIKT
        </span>
      </div>

      {/* Nav items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map((item) => {
          const active = item.id === activeId
          const disabled = !!item.soon

          const rowStyle: CSSProperties = {
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            width: '100%',
            boxSizing: 'border-box',
            padding: '9px 10px',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            background: active ? ACTIVE_BG : 'transparent',
            color: active ? ACCENT : 'var(--text-dim)',
            fontSize: 13.5,
            fontWeight: active ? 600 : 500,
            textAlign: 'left',
            cursor: disabled ? 'default' : 'pointer',
            opacity: disabled ? 0.5 : 1,
            transition: 'background 120ms ease, color 120ms ease',
            font: 'inherit',
          }

          return (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                if (disabled) return
                onNavigate(item.id)
              }}
              style={rowStyle}
            >
              <span
                aria-hidden
                style={{
                  fontSize: 16,
                  lineHeight: 1,
                  width: 18,
                  textAlign: 'center',
                  flexShrink: 0,
                  filter: active ? 'none' : 'grayscale(0.15)',
                }}
              >
                {item.icon}
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {item.label}
              </span>
              {typeof item.badge === 'number' ? (
                <Badge color={active ? ACCENT : 'var(--text-dim)'} soft={!active}>
                  {item.badge}
                </Badge>
              ) : item.soon ? (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--text-faint)',
                    background: 'var(--fill-soft)',
                    borderRadius: 999,
                    padding: '2px 7px',
                    lineHeight: 1,
                  }}
                >
                  Soon
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      {/* User footer */}
      {user ? (
        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            paddingTop: 12,
            borderTop: '1px solid var(--border-soft)',
          }}
        >
          <Avatar label={user.name} size={32} />
          <div style={{ minWidth: 0, lineHeight: 1.3 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-strong)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {user.name}
            </div>
            {user.plan ? (
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-faint)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user.plan}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </nav>
  )
}
