'use client'

interface Props {
  variant?: 'live' | 'hedge'
  size?: number
}

export function LiveDot({ variant = 'live', size = 8 }: Props) {
  const color  = variant === 'live' ? '#00C853' : '#E05C20'
  const animDuration = variant === 'live' ? '1.8s' : '1.2s'

  return (
    <span
      className="inline-block rounded-full flex-shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        animation: `verdikt-pulse ${animDuration} ease infinite`,
      }}
    />
  )
}
