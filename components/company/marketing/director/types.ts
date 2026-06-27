// Shared types for the Campaign Director flagship workspace.
// Pure types — safe to import from server or client modules.

export type AssetType = 'image' | 'video' | 'carousel' | 'copy'
export type AssetState = 'queued' | 'in_progress' | 'completed' | 'failed'

// One card in the right-pane asset grid. Derived server-side by joining the
// per-asset mkt_agent_tasks with their mkt_artifacts (and mkt_video_jobs for video).
export interface AssetItem {
  id: string            // task id (stable key for the card + generate-on-click)
  type: AssetType
  channel: string | null
  label: string         // e.g. "Video / Hero Ad", "Square Post"
  dims: string          // e.g. "1080x1920"
  state: AssetState
  progress?: number     // 0-100 when in_progress (video jobs only; else omitted)
  url?: string          // image/video asset url when completed
  text?: string         // copy body when completed (type === 'copy')
  artifactId?: string   // mkt_artifacts id when an artifact exists
  jobId?: string        // mkt_video_jobs id when a video render is in flight/done
  error?: string
}

// The brief captured by the interview (mirrors lib/marketing/directorInterview CampaignBrief).
export interface Brief {
  brand_id: string
  vertical: string
  goal: string
  audience: string
  region: string
  channels: string[]
  tone: string
  notes: string
}

// Counts for the progress bar + stat tiles.
export interface AssetStats {
  total: number
  generated: number
  in_progress: number
  queued: number
}

// What GET /v2/director?run_id= returns once the run is created.
export interface DirectorRun {
  run: { id: string; status: string; campaign_id: string; error: string | null; finished_at: string | null } | null
  assets: AssetItem[]
  stats: AssetStats
  // The three Phase-U sub-agent task rows (copywriter/prompt-optimizer/router) — kept
  // for the "Plan" detail view / activity.
  agents: { id: string; agent: string; status: string; outputs: Record<string, unknown> | null; error: string | null }[]
}

// A turn in the left chat transcript.
export interface ChatTurn {
  id: string
  role: 'assistant' | 'user'
  text?: string
  // When the assistant is asking an interview step rendered as MCQ option cards.
  stepId?: string
}

// A nav-rail entry.
export interface NavItem {
  id: string
  label: string
  icon: string          // emoji or short glyph
  badge?: number
  soon?: boolean        // disabled "Coming soon"
}

// The campaign header shown atop the creation canvas.
export interface CampaignHeader {
  title: string
  live: boolean
  brandName: string
  vertical: string
  goal: string
  audience: string
}
