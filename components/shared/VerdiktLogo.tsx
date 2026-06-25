'use client'

interface Props {
  size?: number
  className?: string
}

export function VerdiktLogo({ size = 28, className = '' }: Props) {
  return (
    <svg
      viewBox="0 0 44 44"
      fill="none"
      width={size}
      height={size}
      className={className}
      aria-label="Verdikt"
      data-keep-color
    >
      <polygon
        points="22,4 38,34 6,34"
        fill="none"
        stroke="#00C853"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <line x1="22" y1="4" x2="22" y2="34" stroke="#00C853" strokeWidth="2" />
    </svg>
  )
}
