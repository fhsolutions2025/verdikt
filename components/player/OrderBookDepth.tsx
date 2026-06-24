'use client'

import { Order } from '@/lib/types'

interface Props {
  orders: Order[]
}

const LEVELS = 4

export function OrderBookDepth({ orders }: Props) {
  const yesOrders = orders
    .filter(o => o.side === 'yes' && o.status !== 'cancelled' && o.status !== 'filled')
    .sort((a, b) => a.price - b.price)
    .slice(0, LEVELS)

  const noOrders = orders
    .filter(o => o.side === 'no' && o.status !== 'cancelled' && o.status !== 'filled')
    .sort((a, b) => a.price - b.price)
    .slice(0, LEVELS)

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: '#6B7280', letterSpacing: '0.08em' }}>
        Order Book
      </h3>

      <div className="grid grid-cols-2 gap-3">
        {/* YES side */}
        <div className="space-y-1">
          <p className="text-xs font-bold text-center" style={{ color: '#00A844' }}>YES (Buy)</p>
          {yesOrders.length > 0 ? yesOrders.map(o => (
            <OrderRow key={o.id} order={o} side="yes" />
          )) : <EmptyRows />}
        </div>

        {/* NO side */}
        <div className="space-y-1">
          <p className="text-xs font-bold text-center" style={{ color: '#E05C20' }}>NO (Buy)</p>
          {noOrders.length > 0 ? noOrders.map(o => (
            <OrderRow key={o.id} order={o} side="no" />
          )) : <EmptyRows />}
        </div>
      </div>
    </div>
  )
}

function OrderRow({ order, side }: { order: Order; side: 'yes' | 'no' }) {
  const isYes = side === 'yes'
  const remaining = order.shares - order.shares_filled

  return (
    <div
      className="flex justify-between items-center px-2.5 py-1.5 rounded-lg"
      style={{
        backgroundColor: isYes
          ? 'rgba(0,200,83,0.06)'
          : 'rgba(224,92,32,0.06)',
      }}
    >
      <span
        className="font-mono font-bold text-sm"
        style={{ color: isYes ? '#00A844' : '#E05C20' }}
      >
        {order.price}¢
      </span>
      <span
        className="font-mono text-xs"
        style={{ color: '#9CA3AF' }}
      >
        {remaining.toFixed(0)}
      </span>
    </div>
  )
}

function EmptyRows() {
  return (
    <>
      {Array.from({ length: LEVELS }).map((_, i) => (
        <div
          key={i}
          className="h-8 rounded-lg"
          style={{ backgroundColor: '#F3F4F6' }}
        />
      ))}
    </>
  )
}
