'use client'

import { isMarketImbalanced } from '@/lib/calculations'
import { LiveDot } from './LiveDot'

interface Props {
  yesPrice:      number
  portal:        'company' | 'mm-desk'
  showLabels?:   boolean
  isImbalanced?: boolean  // pass from v_market_risk_status when available; computed as fallback
}

export function BalanceBar({ yesPrice, portal, showLabels = true, isImbalanced }: Props) {
  const noPrice    = 100 - yesPrice
  const imbalanced = isImbalanced ?? isMarketImbalanced(yesPrice)
  const isDark   = portal === 'company'

  const trackBg = isDark ? '#374151' : '#E5E7EB'

  return (
    <div className="space-y-1.5">
      {/* Track */}
      <div
        className="relative h-2 rounded-full overflow-hidden"
        style={{ backgroundColor: trackBg }}
      >
        <div
          className="absolute left-0 top-0 h-full rounded-full"
          style={{
            width: `${yesPrice}%`,
            backgroundColor: '#00C853',
            transition: 'width 0.6s ease',
          }}
        />
      </div>

      {/* Labels + badge */}
      {showLabels && (
        <div className="flex items-center justify-between">
          <span
            className="font-mono text-xs font-semibold"
            style={{ color: '#00A844' }}
          >
            {yesPrice}¢ YES
          </span>

          <ImbalanceBadge imbalanced={imbalanced} portal={portal} />

          <span
            className="font-mono text-xs font-semibold"
            style={{ color: '#E05C20' }}
          >
            {noPrice}¢ NO
          </span>
        </div>
      )}
    </div>
  )
}

function ImbalanceBadge({
  imbalanced,
  portal,
}: {
  imbalanced: boolean
  portal: 'company' | 'mm-desk'
}) {
  if (!imbalanced) {
    return (
      <span
        className="text-xs font-bold px-2 py-0.5 rounded-full"
        style={{ backgroundColor: '#F0FFF4', color: '#00A844' }}
      >
        ✓ BALANCED
      </span>
    )
  }

  if (portal === 'mm-desk') {
    return (
      <span
        className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
        style={{ backgroundColor: '#FFF8F0', color: '#E05C20' }}
      >
        <LiveDot variant="hedge" size={6} />
        ⚠ HEDGE
      </span>
    )
  }

  return (
    <span
      className="text-xs font-bold px-2 py-0.5 rounded-full"
      style={{ backgroundColor: '#FFF8F0', color: '#E05C20' }}
    >
      ⚠ IMBALANCED
    </span>
  )
}
