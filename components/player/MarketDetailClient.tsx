'use client'

import { useEffect, useRef, useState } from 'react'
import { Market } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

interface Props {
  market: Market
}

export function MarketDetailClient({ market: initial }: Props) {
  const [market, setMarket]   = useState(initial)
  const [flash, setFlash]     = useState<'yes-up' | 'yes-down' | 'no-up' | 'no-down' | null>(null)
  const supabase              = createClient()
  const marketRef             = useRef(market)

  useEffect(() => { marketRef.current = market }, [market])

  useEffect(() => {
    const channel = supabase
      .channel(`market-detail-${initial.id}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'markets',
          filter: `id=eq.${initial.id}`,
        },
        payload => {
          const updated = payload.new as Market
          const prevYes = marketRef.current.yes_price

          if (updated.yes_price > prevYes) setFlash('yes-up')
          else if (updated.yes_price < prevYes) setFlash('yes-down')

          setMarket(updated)
          setTimeout(() => setFlash(null), 450)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [initial.id])

  return (
    <div className="flex gap-2 w-full">
      <PriceBlock
        side="yes"
        price={market.yes_price}
        flash={flash === 'yes-up' ? 'up' : flash === 'yes-down' ? 'down' : null}
      />
      <PriceBlock
        side="no"
        price={market.no_price}
        flash={flash === 'no-up' ? 'up' : flash === 'no-down' ? 'down' : null}
      />
    </div>
  )
}

function PriceBlock({
  side, price, flash,
}: {
  side: 'yes' | 'no'
  price: number
  flash: 'up' | 'down' | null
}) {
  const isYes = side === 'yes'
  const flashBg = flash === 'up'
    ? 'rgba(0,200,83,0.2)'
    : flash === 'down'
    ? 'rgba(224,92,32,0.15)'
    : isYes ? '#F0FFF4' : '#FFF8F0'

  return (
    <div
      className="flex-1 flex items-center justify-between px-4 py-3 rounded-xl"
      style={{
        backgroundColor: flashBg,
        transition: 'background-color 0.4s ease',
      }}
    >
      <span
        className="text-xs font-bold uppercase"
        style={{ color: isYes ? '#00A844' : '#E05C20' }}
      >
        {side}
      </span>
      <span
        className="font-mono font-bold"
        style={{ fontSize: 24, color: isYes ? '#00A844' : '#E05C20' }}
      >
        {price}¢
      </span>
    </div>
  )
}
