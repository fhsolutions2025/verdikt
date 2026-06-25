'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Tooltip, InfoIcon } from '@/components/shared/Tooltip'

const MM_CONFIG_ID = '20000000-0000-0000-0000-000000000001'

interface Props {
  initial: boolean
  platformFees:  number
  makerRebates:  number
  spreadIncome?: number
}

export function MmToggle({ initial, platformFees, makerRebates, spreadIncome = 0 }: Props) {
  const [isOn, setIsOn]   = useState(initial)
  const [saving, setSaving] = useState(false)
  const supabase            = createClient()

  async function toggle() {
    setSaving(true)
    const next = !isOn
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('mm_config')
      .update({ is_verdikt_acting_as_mm: next })
      .eq('id', MM_CONFIG_ID)
    setIsOn(next)
    setSaving(false)
  }

  const verdiktRevenue = isOn
    ? platformFees + makerRebates + spreadIncome
    : platformFees

  return (
    <div
      className="rounded-2xl p-5 space-y-4"
      style={{
        backgroundColor: '#161B22',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p
            className="text-xs font-bold uppercase tracking-widest flex items-center gap-1.5"
            style={{ color: '#6B7280', letterSpacing: '0.08em' }}
          >
            Verdikt Acts as Institutional MM
            <Tooltip content="When ON, Verdikt seeds all markets and collects maker rebates + spread income on top of platform fees." position="bottom">
              <InfoIcon />
            </Tooltip>
          </p>
          <p className="text-xs mt-0.5" style={{ color: '#4B5563' }}>
            {isOn ? 'Collecting platform fee + rebate + spread' : 'Platform fee only'}
          </p>
        </div>

        {/* Toggle switch — DESIGN_SYSTEM §5.9 */}
        <button
          onClick={toggle}
          disabled={saving}
          className="relative flex-shrink-0"
          style={{
            width: 48,
            height: 26,
            borderRadius: 13,
            backgroundColor: isOn ? '#00C853' : '#374151',
            transition: 'background-color 0.2s ease',
            cursor: saving ? 'wait' : 'pointer',
            border: 'none',
          }}
          aria-checked={isOn}
          role="switch"
        >
          <span
            className="absolute top-[3px] rounded-full bg-white"
            style={{
              width: 20,
              height: 20,
              left: isOn ? 25 : 3,
              transition: 'left 0.2s ease',
            }}
          />
        </button>
      </div>

      {/* Revenue breakdown panel */}
      <div
        className="rounded-xl p-4 space-y-2"
        style={{ backgroundColor: '#0D1117' }}
      >
        <RevenueRow
          label="Platform Fee (75% share)"
          value={platformFees}
          color="#00C853"
          tooltip="75% of all taker fees across every trade. The remaining 25% is the maker rebate."
        />
        {isOn && (
          <>
            <RevenueRow
              label="Maker Rebate (25% share, collected as MM)"
              value={makerRebates}
              color="#00E676"
              tooltip="Verdikt earns this by acting as the liquidity provider (market maker) on both sides of each trade."
            />
            <RevenueRow
              label="Spread Income"
              value={spreadIncome}
              color="#00E676"
              tooltip="Half the bid-ask spread × shares traded. Accrues to Verdikt when acting as MM."
            />
          </>
        )}
        <div
          className="border-t pt-2"
          style={{ borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <RevenueRow
            label={isOn ? 'Total Verdikt Revenue' : 'Verdikt Revenue (platform only)'}
            value={verdiktRevenue}
            color="#FFFFFF"
            bold
          />
        </div>
      </div>
    </div>
  )
}

function RevenueRow({
  label,
  value,
  color,
  bold = false,
  tooltip,
}: {
  label: string
  value: number
  color: string
  bold?: boolean
  tooltip?: string
}) {
  return (
    <div className="flex justify-between items-center">
      <span
        className="text-xs flex items-center gap-1"
        style={{ color: bold ? '#9CA3AF' : '#6B7280', fontWeight: bold ? 600 : 400 }}
      >
        {label}
        {tooltip && (
          <Tooltip content={tooltip} position="bottom">
            <InfoIcon />
          </Tooltip>
        )}
      </span>
      <span
        className="font-mono text-sm"
        style={{ color, fontWeight: bold ? 700 : 600 }}
      >
        {value.toFixed(2)}
      </span>
    </div>
  )
}
