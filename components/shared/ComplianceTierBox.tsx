'use client'

import { complianceTier } from '@/lib/calculations'

interface Props {
  spreadCents: number
}

const TIER_CONFIG = {
  standard: {
    bg:   '#F0FFF4',
    text: '#00A844',
    msg:  '✓ Standard spread. Auto-approved.',
  },
  elevated: {
    bg:   '#FFF8F0',
    text: '#E05C20',
    msg:  '→ Elevated spread. Risk team review within 1 hour.',
  },
  high: {
    bg:   '#FEF2F2',
    text: '#DC2626',
    msg:  '⚠ High spread. Senior approval required.',
  },
  blocked: {
    bg:   '#FEF2F2',
    text: '#DC2626',
    msg:  '✗ Spread exceeds maximum of 5¢. Not permitted.',
  },
}

export function ComplianceTierBox({ spreadCents }: Props) {
  const tier   = complianceTier(spreadCents)
  const config = TIER_CONFIG[tier]

  return (
    <div
      className="rounded-xl px-4 py-3 text-sm font-semibold"
      style={{ backgroundColor: config.bg, color: config.text }}
    >
      {config.msg}
    </div>
  )
}
