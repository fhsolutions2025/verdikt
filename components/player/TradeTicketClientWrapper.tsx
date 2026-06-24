'use client'

import { useEffect, useState } from 'react'
import { Market, FeeConfig } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { TradeTicket } from './TradeTicket'

interface Props {
  marketId:  string
  feeConfig: FeeConfig | null
  playerId:  string
}

export function TradeTicketClientWrapper({ marketId, feeConfig, playerId }: Props) {
  const [market, setMarket] = useState<Market | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase
      .from('markets')
      .select('*')
      .eq('id', marketId)
      .single()
      .then(({ data }) => { if (data) setMarket(data) })

    const channel = supabase
      .channel(`trade-ticket-market-${marketId}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'markets',
          filter: `id=eq.${marketId}`,
        },
        payload => { setMarket(payload.new as Market) }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [marketId])

  if (!market) return null

  function handleTraded(result: { newYesPrice: number; newNoPrice: number }) {
    if (market) {
      setMarket({
        ...market,
        yes_price: result.newYesPrice,
        no_price:  result.newNoPrice,
      })
    }
  }

  return (
    <TradeTicket
      market={market}
      feeConfig={feeConfig}
      playerId={playerId}
      onTraded={handleTraded}
    />
  )
}
