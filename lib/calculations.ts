// ============================================================
// lib/calculations.ts — BUSINESS_LOGIC.md single implementation
// Named to match document section references for traceability.
// Both client-side previews and server-side RPCs derive from here.
// ============================================================

// ─── §1. Fee Structure ──────────────────────────────────────

export function feeSplit(fee: number) {
  return {
    verdiktShare: fee * 0.75,
    makerRebate:  fee * 0.25,
  }
}

// ─── §2.1 Spread Income ────────────────────────────────────

export function spreadIncomeForecast(
  estVolume: number,
  spreadCents: number
): number {
  const spreadFraction = spreadCents / 100
  return estVolume * spreadFraction / 2
}

export function spreadIncomeRealized(
  sharesFilled: number,
  spreadCents: number
): number {
  return sharesFilled * (spreadCents / 100) / 2
}

// ─── §2.2 Fee Rebate ───────────────────────────────────────

export function feeRebateForecast(
  estVolume: number,
  feeRate: number,
  makerShare = 1.0
): number {
  // estVolume × feeRate × rebatePct × makerShare
  // NOT seedCapital × feeRate — that is explicitly wrong per §2.2
  return estVolume * feeRate * 0.25 * makerShare
}

export function feeRebateRealized(
  tradeAmount: number,
  feeRate: number
): number {
  return tradeAmount * feeRate * 0.25
}

// ─── §2.3 Creator Royalty ──────────────────────────────────

export function creatorRoyalty(
  tradeAmount: number,
  feeRate: number,
  royaltyRate = 0.10
): number {
  return tradeAmount * feeRate * royaltyRate
}

// ─── §3.1 Capital Deployed vs Capital at Risk ──────────────

export function capitalDeployed(
  yesShares: number,
  yesAsk: number,
  noShares: number,
  noAsk: number
): number {
  const yesCapital = yesShares * (yesAsk / 100)
  const noCapital  = noShares  * (noAsk  / 100)
  return yesCapital + noCapital
}

export function capitalAtRisk(
  yesCapital: number,
  noCapital: number
): number {
  return Math.min(yesCapital, noCapital)
}

// Helper: compute both in one call (used by "Be a Maker" preview)
export function makerCapitalBreakdown(
  yesShares: number,
  yesPrice: number,
  noShares: number,
  noPrice: number,
  spreadCents: number
) {
  const yesAsk     = yesPrice + spreadCents / 2
  const noAsk      = noPrice  + spreadCents / 2
  const yesCapital = yesShares * (yesAsk / 100)
  const noCapital  = noShares  * (noAsk  / 100)
  return {
    yesCapital,
    noCapital,
    capitalDeployed: yesCapital + noCapital,
    capitalAtRisk:   Math.min(yesCapital, noCapital),
  }
}

// ─── §3.3 Compliance tier from spread ──────────────────────

export type ComplianceTier = 'standard' | 'elevated' | 'high' | 'blocked'

export function complianceTier(spreadCents: number): ComplianceTier {
  if (spreadCents <= 2)               return 'standard'
  if (spreadCents <= 3)               return 'elevated'
  if (spreadCents <= 5)               return 'high'
  return 'blocked'
}

// ─── §4. Market imbalance threshold ────────────────────────

export function isMarketImbalanced(yesPrice: number): boolean {
  return yesPrice > 70 || yesPrice < 30
}

// ─── §5. Tournament / bundle normalisation ─────────────────

export function normaliseBundle(
  odds: number[]
): Array<{ rawProb: number; cleanProb: number; yesPrice: number; noPrice: number }> {
  const rawProbs = odds.map(o => 1 / o)
  const total    = rawProbs.reduce((a, b) => a + b, 0)
  return rawProbs.map(rp => {
    const cleanProb = rp / total
    const yesPrice  = Math.round(cleanProb * 100)
    return { rawProb: rp, cleanProb, yesPrice, noPrice: 100 - yesPrice }
  })
}

export function autoBalance(
  probs: number[]
): number[] {
  const total = probs.reduce((a, b) => a + b, 0)
  if (total === 0) return probs
  const scale = 1 / total
  return probs.map(p => p * scale)
}

// ─── §6. Holding reward multiplier (live-ticking display) ──

export function holdingRewardMultiplier(
  secondsHeld: number,
  apy = 0.04
): number {
  const perSecondRate = apy / (365 * 24 * 3600)
  return 1 + perSecondRate * secondsHeld
}

export function holdingRewardDisplayValue(
  entryValue: number,
  entryAt: Date,
  apy = 0.04
): number {
  const secondsHeld = (Date.now() - entryAt.getTime()) / 1000
  return entryValue * holdingRewardMultiplier(secondsHeld, apy)
}

// ─── §7. Trade execution (client-side preview) ─────────────

export function tradePreview(
  amount: number,
  yesPrice: number,
  noPrice: number,
  side: 'yes' | 'no',
  feeRate: number
) {
  const price          = side === 'yes' ? yesPrice : noPrice
  const shares         = Math.floor(amount / (price / 100))
  const fee            = amount * feeRate
  const totalCost      = amount + fee
  const potentialPayout = shares * 1.00

  return { price, shares, fee, totalCost, potentialPayout }
}

// ─── §7.1 Price nudge ──────────────────────────────────────

const NUDGE_CONSTANT = 0.001
const MAX_PRICE_DELTA = 5  // 5¢ cap (answer B)

export function priceNudge(
  currentYesPrice: number,
  side: 'yes' | 'no',
  amount: number
): { newYesPrice: number; newNoPrice: number } {
  const rawDelta  = (side === 'yes' ? 1 : -1) * amount * NUDGE_CONSTANT
  const delta     = Math.sign(rawDelta) * Math.min(Math.abs(rawDelta), MAX_PRICE_DELTA)
  const newYes    = Math.max(1, Math.min(99, currentYesPrice + delta))
  return { newYesPrice: newYes, newNoPrice: 100 - newYes }
}

// ─── §8. Margin stripping (match result markets) ───────────

export function marginStrip(
  oddsHome: number,
  oddsDraw: number,
  oddsAway: number
) {
  const rawHome  = 1 / oddsHome
  const rawDraw  = 1 / oddsDraw
  const rawAway  = 1 / oddsAway
  const total    = rawHome + rawDraw + rawAway
  const margin   = (total - 1) * 100

  return {
    margin,
    cleanProbHome:  rawHome / total,
    cleanProbDraw:  rawDraw / total,
    cleanProbAway:  rawAway / total,
  }
}

// ─── §9. Finance market pricing ────────────────────────────

const EMERGING_CURRENCIES = [
  'NGN', 'KES', 'GHS', 'UGX', 'TZS', 'ZMW', 'ETB', 'XOF', 'XAF'
]

export function financePricing(
  currentPrice: number,
  target: number,
  direction: 'above' | 'below',
  deadlineDate: Date,
  asset: string
): {
  pctMove: number
  daysToDeadline: number
  volatilityFactor: number
  timeScaleFactor: number
  impliedProb: number
  yesPrice: number
  noPrice: number
  directionWarning: boolean
} {
  const pctMove   = Math.abs(target - currentPrice) / currentPrice * 100
  const daysDiff  = (deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  const days      = Math.max(1, daysDiff)
  const isEmerging = EMERGING_CURRENCIES.some(c =>
    asset.toUpperCase().includes(c)
  )
  const volatilityFactor = isEmerging ? 1.4 : 1.0
  const timeScaleFactor  = Math.sqrt(days / 30)
  const rawProb          = pctMove * 1.5 * volatilityFactor * timeScaleFactor
  const impliedProb      = Math.max(5, Math.min(90, rawProb))
  const yesPrice         = Math.round(impliedProb)

  // Direction mismatch warning (§9)
  const actualDirection = target > currentPrice ? 'above' : 'below'
  const directionWarning = direction !== actualDirection

  return {
    pctMove,
    daysToDeadline: Math.round(days),
    volatilityFactor,
    timeScaleFactor,
    impliedProb,
    yesPrice,
    noPrice: 100 - yesPrice,
    directionWarning,
  }
}

// ─── §10. Politics market pricing ──────────────────────────

export function politicsPricing(pollPct: number) {
  const adjustedProb = Math.round(pollPct * 0.85 + 7.5)
  return {
    adjustedProb,
    yesPrice: adjustedProb,
    noPrice:  100 - adjustedProb,
  }
}

// ─── §11. AI confidence → publication gate ─────────────────

export type ConfidenceAction =
  | 'auto_publish_full'
  | 'publish_wide_spread'
  | 'hold_for_review'
  | 'reject'

export function confidenceGate(score: number): ConfidenceAction {
  if (score >= 85) return 'auto_publish_full'
  if (score >= 65) return 'publish_wide_spread'
  if (score >= 40) return 'hold_for_review'
  return 'reject'
}

// ─── §12. Resolution / payout ──────────────────────────────

export function resolutionPayout(
  shares: number,
  side: 'yes' | 'no',
  outcome: 'yes' | 'no' | 'void',
  entryValue: number
): number {
  if (outcome === 'void') return entryValue
  if (outcome === side)   return shares * 1.00
  return 0
}

// ─── §13. Operator revenue share ───────────────────────────

export function operatorShare(
  verdiktPlatformFee: number,
  operatorRevenueSharePct: number
): number {
  return verdiktPlatformFee * (operatorRevenueSharePct / 100)
}

// ─── Maker earnings preview (combined, for "Be a Maker" UI) ─

export function makerEarningsPreview(params: {
  estVolume: number
  spreadCents: number
  feeRate: number
  makerShare?: number
}) {
  const { estVolume, spreadCents, feeRate, makerShare = 1.0 } = params
  const spread  = spreadIncomeForecast(estVolume, spreadCents)
  const rebate  = feeRebateForecast(estVolume, feeRate, makerShare)
  const total   = spread + rebate
  return { spread, rebate, total }
}

// ─── Utility: format volume for display ────────────────────

export function formatVolume(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `${Math.round(v / 1_000)}K`
  return v.toFixed(0)
}
