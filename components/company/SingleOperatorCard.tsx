'use client'

import { formatVolume } from '@/lib/calculations'

const REVENUE_SHARE_PCT = 25

interface Props {
  totalVolume: number
  totalFees:   number
}

export function SingleOperatorCard({ totalVolume, totalFees }: Props) {
  const operatorEarn = totalFees * (REVENUE_SHARE_PCT / 100)

  return (
    <div
      style={{
        backgroundColor: '#161B22',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: 20,
      }}
    >
      {/* Row 1: name + ACTIVE badge */}
      <div className="flex items-center justify-between mb-4">
        <span style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 700 }}>
          Betika Kenya
        </span>
        <span
          style={{
            backgroundColor: '#00C85320',
            color: '#00C853',
            fontSize: 10,
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: 999,
            letterSpacing: '0.07em',
          }}
        >
          ACTIVE
        </span>
      </div>

      {/* Row 2: four stats */}
      <div className="grid grid-cols-4 gap-3">
        <StatItem label="VOLUME"        value={formatVolume(totalVolume)} />
        <StatItem label="FEES"          value={totalFees.toFixed(2)} />
        <StatItem label="REV SHARE"     value="25%" />
        <StatItem label="OPERATOR EARN" value={operatorEarn.toFixed(2)} accent="#00C853" />
      </div>
    </div>
  )
}

function StatItem({
  label, value, accent,
}: {
  label: string; value: string; accent?: string
}) {
  return (
    <div className="space-y-0.5">
      <p
        className="uppercase font-bold"
        style={{ color: '#6B7280', fontSize: 10, letterSpacing: '0.07em' }}
      >
        {label}
      </p>
      <p
        className="font-mono font-bold"
        style={{ color: accent ?? '#FFFFFF', fontSize: 18 }}
      >
        {value}
      </p>
    </div>
  )
}
