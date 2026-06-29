'use client'

// WS-1 — five-region Campaign Workspace shell (spec reference layout).
//   Topbar
//   Sidebar | CampaignExplorer | Director (embedded: chat + asset workspace)
//   BottomAgentBar
// The working Director (chat + asset grid + inspector) is embedded in the center so no
// functionality regresses; the shell adds the global chrome the spec requires.

import React from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { CampaignExplorer, type ExplorerCampaign } from './CampaignExplorer'
import { BottomAgentBar } from './BottomAgentBar'
import { DirectorWorkspace } from '@/components/company/marketing/director/DirectorWorkspace'

// Sidebar ids that map to the Director's own slide-over panels.
const DIRECTOR_PANELS = new Set(['assets', 'knowledge', 'analytics', 'calendar', 'settings'])

export function WorkspaceShell({
  brands, campaigns, regions, onNavigate, onOpenCampaign,
}: {
  brands: { id: string; name: string }[]
  campaigns: ExplorerCampaign[]
  regions: { region: string; framing: string }[]
  onNavigate: (view: string) => void
  onOpenCampaign?: (id: string) => void
}): React.JSX.Element {
  const [selectedCampaign, setSelectedCampaign] = React.useState<string | null>(null)
  const [requestedPanel, setRequestedPanel] = React.useState<string | null>(null)

  const handleSidebar = (id: string) => {
    if (id === 'director') return
    if (DIRECTOR_PANELS.has(id)) { setRequestedPanel(id); return }
    onNavigate(id) // dashboard / campaigns / brand … bubble to the outer router
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg-base)', color: 'var(--text-strong)' }}>
      <Topbar
        campaignTitle="Campaign Director"
        campaignStatus="Workspace"
        activeAgents={12}
        onBreadcrumb={() => onNavigate('campaigns')}
        onCreate={(t) => { if (t === 'campaign') onNavigate('director'); else setRequestedPanel('assets') }}
        onOpenPalette={() => { /* WS-6 command palette */ }}
      />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Sidebar
          active="director"
          onNavigate={handleSidebar}
          org={{ name: 'Verdikt Studio', plan: 'Marketing' }}
          user={{ name: 'Admin', role: 'Admin' }}
        />
        <CampaignExplorer
          campaigns={campaigns}
          selectedId={selectedCampaign}
          onSelect={(id) => { setSelectedCampaign(id); onOpenCampaign?.(id) }}
          onNew={() => onNavigate('director')}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <DirectorWorkspace
            brands={brands}
            regions={regions}
            embedded
            requestedPanel={requestedPanel}
            onPanelHandled={() => setRequestedPanel(null)}
            onNavigate={onNavigate}
            onOpenCampaign={onOpenCampaign}
          />
        </div>
      </div>
      <BottomAgentBar />
    </div>
  )
}
