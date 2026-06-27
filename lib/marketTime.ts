// Human-friendly time-to-close for market cards / detail.
// "Ends in 2d 6h" · "Ends in 5h" · "Ends in 42m" · "Closing soon" · "Closed"

export interface TimeToClose {
  text:        string
  closed:      boolean
  closingSoon: boolean   // < 1h
  endingToday: boolean   // < 24h
}

export function timeToClose(closesAt: string | Date, now: number = Date.now()): TimeToClose {
  const end = (closesAt instanceof Date ? closesAt : new Date(closesAt)).getTime()
  const ms  = end - now

  if (ms <= 0) return { text: 'Closed', closed: true, closingSoon: false, endingToday: false }

  const mins  = Math.floor(ms / 60_000)
  const hours = Math.floor(mins / 60)
  const days  = Math.floor(hours / 24)

  let text: string
  if (days >= 1)       text = `Ends in ${days}d ${hours % 24}h`
  else if (hours >= 1) text = `Ends in ${hours}h ${mins % 60}m`
  else if (mins >= 1)  text = `Ends in ${mins}m`
  else                 text = 'Closing soon'

  return {
    text,
    closed:      false,
    closingSoon: ms < 3_600_000,        // < 1h
    endingToday: ms < 86_400_000,       // < 24h
  }
}
