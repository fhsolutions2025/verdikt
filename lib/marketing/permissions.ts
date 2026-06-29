// Per-control permission gating for the Campaign Workspace (interaction map §14).
// The app currently only distinguishes admin vs player at the route layer (every
// /v2/* marketing route is admin-gated), so in practice the workspace runs as an
// owner/admin and all capabilities are enabled. This module encodes the full role
// matrix so the gating *mechanism* is in place and ready when a richer workspace
// role model lands — controls a role can't use are disabled with a tooltip rather
// than silently hidden (destructive actions excepted).

export type WorkspaceRole =
  | 'owner' | 'admin' | 'marketer' | 'designer' | 'reviewer' | 'viewer'

export type Capability =
  | 'manage_campaigns' // create / rename / archive / delete campaigns
  | 'generate'         // run generation (image / video / copy)
  | 'comment'          // add comments
  | 'request_approval' // send an asset for review
  | 'approve'          // approve / reject / request-changes
  | 'publish'          // publish or export approved assets
  | 'manage_users'     // manage members / connections
  | 'view'             // read-only access

const ALL: Capability[] = [
  'manage_campaigns', 'generate', 'comment', 'request_approval',
  'approve', 'publish', 'manage_users', 'view',
]

// Role → capability set (interaction map §14).
const MATRIX: Record<WorkspaceRole, Capability[]> = {
  owner: ALL,
  admin: ['manage_campaigns', 'generate', 'comment', 'request_approval', 'approve', 'publish', 'manage_users', 'view'],
  marketer: ['manage_campaigns', 'generate', 'comment', 'request_approval', 'view'],
  designer: ['generate', 'comment', 'view'],
  reviewer: ['comment', 'approve', 'view'],
  viewer: ['view'],
}

const CAPS: Record<WorkspaceRole, Set<Capability>> = Object.fromEntries(
  (Object.keys(MATRIX) as WorkspaceRole[]).map((r) => [r, new Set(MATRIX[r])]),
) as Record<WorkspaceRole, Set<Capability>>

// Map the app's coarse auth role to a workspace role. Admins are treated as owners
// here (full marketing capabilities); anything else is view-only.
export function toWorkspaceRole(authRole: string | null | undefined): WorkspaceRole {
  if (authRole === 'admin') return 'owner'
  return 'viewer'
}

export function can(role: WorkspaceRole, cap: Capability): boolean {
  return CAPS[role]?.has(cap) ?? false
}

// Human-readable reason for a disabled control (shown as a tooltip).
export function denyReason(role: WorkspaceRole, cap: Capability): string {
  const label: Record<Capability, string> = {
    manage_campaigns: 'manage campaigns',
    generate: 'generate assets',
    comment: 'comment',
    request_approval: 'request approval',
    approve: 'approve assets',
    publish: 'publish',
    manage_users: 'manage members',
    view: 'view',
  }
  return `Your role (${role}) can't ${label[cap]}.`
}
