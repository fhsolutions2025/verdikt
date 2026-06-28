// Asset Intelligence (VERDIKT Marketing Studio § Asset Awareness / Asset Library).
//
// Pure helpers (safe to import server or client) for deriving an asset's intelligence
// — quality score, approval state — and the dependency graph used for dynamic
// synchronization ("if an asset changes, downstream assets are automatically
// identified for regeneration").

export interface AssetIntelligence {
  id: string
  type: string
  channel: string | null
  title: string
  status: string          // draft | needs_review | approved | ...
  version: number
  agent: string | null
  quality_score: number | null   // 0-100
  asset_url: string | null
  campaign_id: string | null
  campaign_name: string | null
  updated_at: string
}

// Approval state buckets for the spec's asset card.
export function approvalLabel(status: string): 'Approved' | 'In Review' | 'Draft' | 'Rejected' {
  switch (status) {
    case 'approved': return 'Approved'
    case 'needs_review': return 'In Review'
    case 'rejected': case 'voided': return 'Rejected'
    default: return 'Draft'
  }
}

// Pull an overall 0-100 quality score out of a stored artifact-version content blob.
// Copy assets store {score:{overall}}, media assets store {review:{qa:{score}}}.
export function deriveQualityScore(content: unknown): number | null {
  if (!content || typeof content !== 'object') return null
  const c = content as Record<string, unknown>
  const score = c.score as { overall?: unknown } | undefined
  if (score && typeof score.overall === 'number') return Math.round(score.overall)
  const review = c.review as { qa?: { score?: unknown } } | undefined
  if (review?.qa && typeof review.qa.score === 'number') return Math.round(review.qa.score)
  return null
}

// Dependency graph (spec § Dynamic Synchronization). When an asset of a given type is
// changed/regenerated, these downstream types likely need a refresh too.
export const DEPENDENCY_GRAPH: Record<string, string[]> = {
  // A message/copy change ripples to every visual that carries or echoes it.
  copy:     ['image', 'carousel', 'video'],
  social:   ['image', 'carousel', 'video'],
  // A hero/image change ripples to the carousel and video that build on it.
  image:    ['carousel', 'video'],
  carousel: ['video'],
  // A blog change can ripple to the social/copy that promote it.
  blog:     ['social', 'copy'],
  video:    [],
}

export function downstreamOf(type: string): string[] {
  return DEPENDENCY_GRAPH[type] ?? []
}
