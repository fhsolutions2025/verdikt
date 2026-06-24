'use client'

import { OperatorRevenue } from '@/lib/types'
import { operatorShare, formatVolume } from '@/lib/calculations'

interface Props {
  operators: OperatorRevenue[]
}

export function OperatorTable({ operators }: Props) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: '#161B22',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div className="px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <h2
          className="text-xs font-bold uppercase tracking-widest"
          style={{ color: '#6B7280', letterSpacing: '0.08em' }}
        >
          Operator Revenue
        </h2>
      </div>

      <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
        {operators.map(op => {
          const share = operatorShare(op.fees, op.revenue_share_pct)
          return (
            <div key={op.id} className="px-5 py-4 space-y-1">
              <p className="text-sm font-bold" style={{ color: '#D1D5DB' }}>
                {op.name}
              </p>
              <div className="flex items-center gap-6 text-xs">
                <span style={{ color: '#6B7280' }}>
                  Vol: <span className="font-mono font-semibold" style={{ color: '#9CA3AF' }}>
                    {formatVolume(op.volume)}
                  </span>
                </span>
                <span style={{ color: '#6B7280' }}>
                  Fees: <span className="font-mono font-semibold" style={{ color: '#9CA3AF' }}>
                    {op.fees.toFixed(2)}
                  </span>
                </span>
                <span style={{ color: '#6B7280' }}>
                  Rev share ({op.revenue_share_pct}%):
                  <span className="font-mono font-semibold ml-1" style={{ color: '#00C853' }}>
                    {share.toFixed(2)}
                  </span>
                </span>
              </div>
            </div>
          )
        })}

        {operators.length === 0 && (
          <p className="px-5 py-6 text-sm" style={{ color: '#374151' }}>
            No operators yet.
          </p>
        )}
      </div>
    </div>
  )
}
