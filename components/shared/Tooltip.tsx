'use client'

import { useState } from 'react'

interface Props {
  content:   string
  children:  React.ReactNode
  position?: 'top' | 'bottom'
  width?:    number
}

export function Tooltip({ content, children, position = 'top', width = 210 }: Props) {
  const [show, setShow] = useState(false)

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          className="absolute z-50 pointer-events-none"
          style={{
            ...(position === 'top'
              ? { bottom: 'calc(100% + 8px)' }
              : { top: 'calc(100% + 8px)' }),
            left: '50%',
            transform: 'translateX(-50%)',
            width,
          }}
        >
          <span
            className="block text-xs leading-snug rounded-lg px-2.5 py-2 text-center"
            style={{
              backgroundColor: '#1F2937',
              color: '#D1D5DB',
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              whiteSpace: 'normal',
            }}
          >
            {content}
          </span>
          <span
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              ...(position === 'top'
                ? { bottom: -4, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid #1F2937' }
                : { top: -4, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '5px solid #1F2937' }),
            }}
          />
        </span>
      )}
    </span>
  )
}

export function InfoIcon() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 13,
        height: 13,
        borderRadius: '50%',
        border: '1px solid currentColor',
        fontSize: 8,
        fontWeight: 700,
        lineHeight: 1,
        opacity: 0.5,
        cursor: 'default',
        flexShrink: 0,
      }}
    >
      i
    </span>
  )
}
