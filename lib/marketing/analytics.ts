// Campaign analytics + health score (VERDIKT Marketing Studio § Campaign Health Score).
//
// Pure computation over real campaign signals (asset counts, quality, approvals,
// compliance, publication). The health score is a weighted composite that "updates
// continuously" as assets are generated, reviewed, approved, and published.

export interface CampaignSignals {
  total: number          // assets in the campaign
  approved: number       // approved assets
  published: number      // assets published/exported
  avgQuality: number | null  // mean 0-100 quality score across scored assets
  complianceFlags: number    // count of assets with a compliance block/warn
  coveragePlanned: number    // planned asset slots
  coverageDone: number       // generated/succeeded asset slots
}

export interface HealthBreakdown {
  creative: number    // avg quality
  coverage: number    // generated / planned
  approval: number    // approved / total
  compliance: number  // clean rate
  reach: number       // published / approved
}

export interface CampaignHealth {
  score: number               // 0-100 overall
  breakdown: HealthBreakdown
  gaps: string[]              // proactive missing-asset / action hints
}

function pct(n: number, d: number, fallback = 0): number {
  if (d <= 0) return fallback
  return Math.max(0, Math.min(100, Math.round((n / d) * 100)))
}

export function computeHealth(s: CampaignSignals): CampaignHealth {
  const creative = s.avgQuality != null ? Math.round(s.avgQuality) : 80
  const coverage = pct(s.coverageDone, s.coveragePlanned, s.total > 0 ? 100 : 0)
  const approval = pct(s.approved, s.total, 0)
  const compliance = s.total > 0 ? pct(s.total - s.complianceFlags, s.total, 100) : 100
  const reach = s.approved > 0 ? pct(s.published, s.approved, 0) : 0

  const breakdown: HealthBreakdown = { creative, coverage, approval, compliance, reach }

  // Weighted composite — creative quality + coverage carry the most, then approval,
  // compliance as a guardrail, reach as a smaller bonus.
  const score = Math.round(
    creative * 0.30 + coverage * 0.25 + approval * 0.20 + compliance * 0.15 + reach * 0.10,
  )

  const gaps: string[] = []
  if (s.coverageDone < s.coveragePlanned) gaps.push(`${s.coveragePlanned - s.coverageDone} planned asset(s) not yet generated`)
  if (s.total > 0 && s.approved < s.total) gaps.push(`${s.total - s.approved} asset(s) awaiting approval`)
  if (s.complianceFlags > 0) gaps.push(`${s.complianceFlags} asset(s) flagged for compliance review`)
  if (s.approved > 0 && s.published === 0) gaps.push('No assets published yet')

  return { score, breakdown, gaps }
}
