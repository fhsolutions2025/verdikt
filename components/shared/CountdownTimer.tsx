'use client'

import { useEffect, useState } from 'react'

interface Props {
  closesAt: string
}

export function CountdownTimer({ closesAt }: Props) {
  const [remaining, setRemaining] = useState(calcRemaining(closesAt))

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(calcRemaining(closesAt))
    }, 60_000)
    return () => clearInterval(interval)
  }, [closesAt])

  const urgent = remaining.days < 3
  const color  = urgent ? '#DC2626' : '#E05C20'
  const prefix = urgent ? '⚠' : '⏱'

  if (remaining.total <= 0) {
    return <span style={{ color: '#DC2626' }} className="text-xs font-semibold">Closed</span>
  }

  return (
    <span className="text-xs font-semibold" style={{ color }}>
      {prefix} {remaining.days}d {remaining.hours}h {remaining.mins}m remaining
    </span>
  )
}

function calcRemaining(closesAt: string) {
  const diff   = new Date(closesAt).getTime() - Date.now()
  const total  = Math.max(0, diff)
  const days   = Math.floor(total / (1000 * 60 * 60 * 24))
  const hours  = Math.floor((total % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const mins   = Math.floor((total % (1000 * 60 * 60)) / (1000 * 60))
  return { total, days, hours, mins }
}
