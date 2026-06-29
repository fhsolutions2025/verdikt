'use client'

// WS-1…WS-7 — five-region Campaign Workspace shell (spec reference layout).
//   Topbar
//   Sidebar | CampaignExplorer | Director (embedded: chat + asset workspace + Inspector)
//   BottomAgentBar
// Plus the global surfaces: command palette (⌘K), notification center, publishing
// preview, approvals slide-over, keyboard shortcuts, permission gating, and responsive
// adaptation (desktop/tablet/mobile).

import React from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { CampaignExplorer, type ExplorerCampaign } from './CampaignExplorer'
import { BottomAgentBar } from './BottomAgentBar'
import { CommandPalette, type CommandItem } from './CommandPalette'
import { NotificationCenter } from './NotificationCenter'
import { PublishingPreviewModal } from './PublishingPreviewModal'
import { ApprovalsPanel } from './ApprovalsPanel'
import { useViewport } from './useViewport'
import { DirectorWorkspace } from '@/components/company/marketing/director/DirectorWorkspace'
import { can, type WorkspaceRole } from '@/lib/marketing/permissions'

// Sidebar ids that map to the Director's own slide-over panels.
const DIRECTOR_PANELS = new Set(['assets', 'knowledge', 'analytics', 'calendar', 'settings'])

export function WorkspaceShell({
  brands, campaigns, regions, role = 'owner', onNavigate, onOpenCampaign, onRefreshCampaigns,
}: {
  brands: { id: string; name: string }[]
  campaigns: ExplorerCampaign[]
  regions: { region: string; framing: string }[]
  role?: WorkspaceRole
  onNavigate: (view: string) => void
  onOpenCampaign?: (id: string) => void
  onRefreshCampaigns?: () => void
}): React.JSX.Element {
  const [selectedCampaign, setSelectedCampaign] = React.useState<string | null>(null)
  const [requestedPanel, setRequestedPanel] = React.useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const [notifOpen, setNotifOpen] = React.useState(false)
  const [unread, setUnread] = React.useState(0)
  const [publishOpen, setPublishOpen] = React.useState(false)
  const [approvalsOpen, setApprovalsOpen] = React.useState(false)

  const viewport = useViewport()
  const [collapsedOverride, setCollapsedOverride] = React.useState<boolean | null>(null)
  // Auto-collapse the sidebar on tablet/mobile; ⌘B (override) wins until viewport changes.
  React.useEffect(() => { setCollapsedOverride(null) }, [viewport])
  const sidebarCollapsed = collapsedOverride ?? (viewport !== 'desktop')
  const showExplorer = viewport === 'desktop'
  const showSidebar = viewport !== 'mobile'

  const canManage = can(role, 'manage_campaigns')
  const canPublish = can(role, 'publish')
  const canApprove = can(role, 'approve')

  const handleSidebar = (id: string) => {
    if (id === 'director') return
    if (id === 'approvals') { setApprovalsOpen(true); return }
    if (id === 'publishing') { setPublishOpen(true); return }
    if (DIRECTOR_PANELS.has(id)) { setRequestedPanel(id); return }
    onNavigate(id) // dashboard / campaigns / brand … bubble to the outer router
  }

  // ── Keyboard shortcuts (interaction map §13) ──────────────────────────────────
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(o => !o); return }
      if (meta && e.key.toLowerCase() === 'b') { e.preventDefault(); setCollapsedOverride(c => !(c ?? (viewport !== 'desktop'))); return }
      if (e.key === 'Escape') { setPaletteOpen(false); setNotifOpen(false); setPublishOpen(false); setApprovalsOpen(false); return }
      if (typing || meta) return
      if (e.key === 'n') { e.preventDefault(); if (canManage) { setSelectedCampaign(null); onNavigate('director') } }
      else if (e.shiftKey && e.key === 'A') { e.preventDefault(); setRequestedPanel('assets') }
      else if (e.shiftKey && e.key === 'C') { e.preventDefault(); onNavigate('campaigns') }
      else if (e.shiftKey && e.key === 'P') { e.preventDefault(); if (canPublish) setPublishOpen(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewport, canManage, canPublish, onNavigate])

  // ── Command palette items ─────────────────────────────────────────────────────
  const actions: CommandItem[] = [
    ...(canManage ? [{ id: 'act:new-campaign', label: 'New campaign', hint: 'n', icon: '✨', group: 'Actions' as const, keywords: 'create', run: () => { setSelectedCampaign(null); onNavigate('director') } }] : []),
    ...(canManage ? [{ id: 'act:gen-image', label: 'Generate image', icon: '🎨', group: 'Actions' as const, keywords: 'create asset', run: () => setRequestedPanel('assets') }] : []),
    ...(canManage ? [{ id: 'act:gen-video', label: 'Generate video', icon: '🎬', group: 'Actions' as const, keywords: 'create asset', run: () => setRequestedPanel('assets') }] : []),
    { id: 'act:upload-knowledge', label: 'Upload knowledge', icon: '📚', group: 'Actions' as const, keywords: 'brand kb', run: () => setRequestedPanel('knowledge') },
    ...(canPublish ? [{ id: 'act:publish', label: 'Publish campaign', hint: '⇧P', icon: '🚀', group: 'Actions' as const, keywords: 'publish export', run: () => setPublishOpen(true) }] : []),
    ...(canApprove ? [{ id: 'act:approvals', label: 'Review approvals', icon: '✅', group: 'Actions' as const, keywords: 'approve review', run: () => setApprovalsOpen(true) }] : []),
  ]
  const navItems: CommandItem[] = [
    { id: 'nav:home', label: 'Home', icon: '🏠', group: 'Navigate', run: () => onNavigate('dashboard') },
    { id: 'nav:campaigns', label: 'Campaigns', hint: '⇧C', icon: '🗂️', group: 'Navigate', run: () => onNavigate('campaigns') },
    { id: 'nav:assets', label: 'Asset Library', hint: '⇧A', icon: '🖼️', group: 'Navigate', run: () => setRequestedPanel('assets') },
    { id: 'nav:brand', label: 'Brand Kit', icon: '🏷️', group: 'Navigate', run: () => onNavigate('brand') },
    { id: 'nav:knowledge', label: 'Knowledge Base', icon: '📚', group: 'Navigate', run: () => setRequestedPanel('knowledge') },
    { id: 'nav:analytics', label: 'Analytics', icon: '📊', group: 'Navigate', run: () => setRequestedPanel('analytics') },
    { id: 'nav:settings', label: 'Settings', icon: '⚙️', group: 'Navigate', run: () => setRequestedPanel('settings') },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg-base)', color: 'var(--text-strong)' }}>
      <Topbar
        campaignTitle="Campaign Director"
        campaignStatus="Workspace"
        activeAgents={12}
        unread={unread}
        canCreate={canManage}
        onBreadcrumb={() => onNavigate('campaigns')}
        onCreate={(t) => { if (t === 'campaign') { setSelectedCampaign(null); onNavigate('director') } else setRequestedPanel('assets') }}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenNotifications={() => setNotifOpen(o => !o)}
      />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {showSidebar && (
          <Sidebar
            active="director"
            onNavigate={handleSidebar}
            org={{ name: 'Verdikt Studio', plan: 'Marketing' }}
            user={{ name: 'Admin', role: 'Admin' }}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setCollapsedOverride(c => !(c ?? (viewport !== 'desktop')))}
          />
        )}
        {showExplorer && (
          <CampaignExplorer
            campaigns={campaigns}
            selectedId={selectedCampaign}
            onSelect={(id) => setSelectedCampaign(id)}
            onNew={() => setSelectedCampaign(null)}
            onRefresh={onRefreshCampaigns}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <DirectorWorkspace
            brands={brands}
            regions={regions}
            embedded
            requestedPanel={requestedPanel}
            onPanelHandled={() => setRequestedPanel(null)}
            loadCampaignId={selectedCampaign}
            onNavigate={onNavigate}
            onOpenCampaign={onOpenCampaign}
          />
        </div>
      </div>
      <BottomAgentBar />

      {/* Global overlays */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={actions}
        navItems={navItems}
        campaigns={campaigns.map(c => ({ id: c.id, name: c.name }))}
        onSelectCampaign={(id) => setSelectedCampaign(id)}
      />
      <NotificationCenter
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        onOpenCampaign={(id) => setSelectedCampaign(id)}
        onUnreadChange={setUnread}
      />
      <PublishingPreviewModal
        open={publishOpen}
        campaignId={selectedCampaign}
        canPublish={canPublish}
        onClose={() => setPublishOpen(false)}
        onPublished={() => onRefreshCampaigns?.()}
      />
      <ApprovalsPanel
        open={approvalsOpen}
        campaignId={selectedCampaign}
        canApprove={canApprove}
        onClose={() => setApprovalsOpen(false)}
        onChanged={() => onRefreshCampaigns?.()}
      />
    </div>
  )
}
