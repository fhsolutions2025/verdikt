'use client'

import Link from 'next/link'
import { useState } from 'react'
import { VerdiktLogo } from '@/components/shared/VerdiktLogo'
import { KpiCard } from '@/components/company/KpiCard'
import { MmToggle } from '@/components/company/MmToggle'
import { SingleOperatorCard } from '@/components/company/SingleOperatorCard'
import { MarketRiskMonitor } from '@/components/company/MarketRiskMonitor'
import { PendingReviewSection } from '@/components/company/PendingReviewSection'
import { NewsMarketCreator } from '@/components/company/NewsMarketCreator'
import { DataSourcesSection } from '@/components/company/DataSourcesSection'
import { ApiHealthMonitor } from '@/components/company/ApiHealthMonitor'
import { AuditFeed } from '@/components/company/AuditFeed'
import { AgentsTab } from '@/components/company/AgentsTab'
import { ChatWidget } from '@/components/shared/ChatWidget'
import { Tooltip, InfoIcon } from '@/components/shared/Tooltip'
import { formatVolume } from '@/lib/calculations'
import type {
  PlatformTotals, MmConfig, AuditLogEntry,
  RiskMarket, ApiSource, Market,
} from '@/lib/types'

type Tab = 'overview' | 'markets' | 'review' | 'news' | 'sources' | 'health' | 'activity' | 'agents'

interface AiStats {
  calls_today:    number
  avg_latency_ms: number | null
  cost_today_usd: number
  cache_hit_rate: number
  last_error:     string | null
}

export interface CompanyDashboardProps {
  totals:        PlatformTotals | null
  mmConfig:      MmConfig | null
  auditLog:      AuditLogEntry[]
  riskMarkets:   RiskMarket[]
  allMarkets:    Market[]
  pendingReview: Market[]
  apiSources:    ApiSource[]
  aiStats:       AiStats
  callsToday:    Record<string, number>
  spreadIncome:  number
}

// ── Icons ────────────────────────────────────────────────────────────────────

function IconGrid() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="1" y="1" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="8.5" y="1" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="1" y="8.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  )
}
function IconAlert() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M7.5 1.5L13.5 12.5H1.5L7.5 1.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <line x1="7.5" y1="6" x2="7.5" y2="9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <circle cx="7.5" cy="10.75" r="0.75" fill="currentColor"/>
    </svg>
  )
}
function IconInbox() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="1" y="1" width="13" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M1 9.5H4.5L6 11.5H9L10.5 9.5H14" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    </svg>
  )
}
function IconNews() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="1" y="2" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <line x1="4" y1="5.5" x2="11" y2="5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="4" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="4" y1="10.5" x2="8" y2="10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}
function IconPlug() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M5 1V5M10 1V5M3 5H12V9C12 11.2 10.2 13 8 13H7C4.8 13 3 11.2 3 9V5Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="7.5" y1="13" x2="7.5" y2="15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}
function IconActivity() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <polyline points="1,8 4,4 7,10 10,6 13,8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function IconList() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <line x1="3" y1="4" x2="12" y2="4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="3" y1="7.5" x2="12" y2="7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="3" y1="11" x2="8" y2="11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}
function IconBot() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="2" y="5" width="11" height="8" rx="2" stroke="currentColor" strokeWidth="1.4"/>
      <circle cx="5.5" cy="9" r="1" fill="currentColor"/>
      <circle cx="9.5" cy="9" r="1" fill="currentColor"/>
      <path d="M7.5 1V4M6 4H9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}

// ── Nav item ─────────────────────────────────────────────────────────────────

function NavItem({
  icon, label, active, onClick, badge, badgeColor = '#E05C20',
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
  badge?: number
  badgeColor?: string
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        width: '100%',
        padding: '8px 14px',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        borderRadius: 0,
        backgroundColor: active ? 'rgba(0,200,83,0.08)' : 'transparent',
        borderLeft: `2px solid ${active ? '#00C853' : 'transparent'}`,
        color: active ? '#00C853' : '#6B7280',
        transition: 'all 0.12s',
      }}
      onMouseEnter={e => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.color = '#9CA3AF'
      }}
      onMouseLeave={e => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.color = '#6B7280'
      }}
    >
      <span style={{ flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: active ? 700 : 500, flex: 1 }}>{label}</span>
      {badge != null && (
        <span style={{
          backgroundColor: badgeColor + '20',
          color: badgeColor,
          fontSize: 10,
          fontWeight: 700,
          padding: '1px 6px',
          borderRadius: 999,
          flexShrink: 0,
        }}>
          {badge}
        </span>
      )}
    </button>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function TabSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 style={{ color: '#E6EDF3', fontSize: 18, fontWeight: 700, margin: 0 }}>{title}</h2>
        {subtitle && <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function CompanyDashboard({
  totals, mmConfig, auditLog, riskMarkets,
  allMarkets, pendingReview, apiSources,
  aiStats, callsToday, spreadIncome,
}: CompanyDashboardProps) {
  const [tab, setTab] = useState<Tab>('overview')

  const totalVolume   = totals?.total_volume        ?? 0
  const totalFees     = totals?.total_platform_fees  ?? 0
  const totalRebates  = totals?.total_maker_rebates  ?? 0
  const activeMarkets = allMarkets.length
  const liveCount     = riskMarkets.length
  const flaggedCount  = riskMarkets.filter(m => m.is_imbalanced).length
  const pendingCount  = pendingReview.length
  const isMMOn        = mmConfig?.is_verdikt_acting_as_mm ?? false

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#0D1117', overflow: 'hidden' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header style={{
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        backgroundColor: '#0D1117',
        flexShrink: 0,
        zIndex: 40,
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <VerdiktLogo size={24} />
          <span style={{ color: '#FFFFFF', fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em' }}>Verdikt</span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Link href="/mm-desk" style={{
            padding: '5px 12px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            color: '#9CA3AF',
            textDecoration: 'none',
            border: '1px solid rgba(255,255,255,0.08)',
            backgroundColor: 'transparent',
            transition: 'all 0.12s',
          }}>
            MM Desk
          </Link>
          <Link href="/player" style={{
            padding: '5px 12px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            color: '#9CA3AF',
            textDecoration: 'none',
            border: '1px solid rgba(255,255,255,0.08)',
            backgroundColor: 'transparent',
          }}>
            Player
          </Link>
          <span style={{
            backgroundColor: '#00C85310',
            border: '1px solid #00C85330',
            color: '#00C853',
            fontSize: 11,
            fontWeight: 700,
            padding: '4px 10px',
            borderRadius: 999,
            letterSpacing: '0.06em',
            marginLeft: 4,
          }}>
            LIVE
          </span>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside style={{
          width: 210,
          flexShrink: 0,
          borderRight: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          paddingTop: 16,
          paddingBottom: 16,
        }}>
          {/* Section label */}
          <p style={{
            color: '#4B5563',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            padding: '0 14px 10px',
          }}>
            Operations
          </p>

          {/* Primary nav */}
          <NavItem icon={<IconGrid />}     label="Overview"      active={tab === 'overview'} onClick={() => setTab('overview')} />
          <NavItem icon={<IconAlert />}    label="Markets"       active={tab === 'markets'}  onClick={() => setTab('markets')}
            badge={flaggedCount > 0 ? flaggedCount : undefined} badgeColor="#E05C20" />
          <NavItem icon={<IconInbox />}    label="Review"        active={tab === 'review'}   onClick={() => setTab('review')}
            badge={pendingCount > 0 ? pendingCount : undefined} badgeColor="#E05C20" />
          <NavItem icon={<IconNews />}     label="News → Market" active={tab === 'news'}     onClick={() => setTab('news')} />

          {/* Divider */}
          <div style={{ margin: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.06)' }} />

          {/* System nav */}
          <NavItem icon={<IconPlug />}     label="Data Sources"  active={tab === 'sources'}  onClick={() => setTab('sources')} />
          <NavItem icon={<IconActivity />} label="API Health"    active={tab === 'health'}   onClick={() => setTab('health')}
            badge={aiStats.last_error ? 1 : undefined} badgeColor="#DC2626" />
          <NavItem icon={<IconList />}     label="Activity"      active={tab === 'activity'} onClick={() => setTab('activity')} />
          <NavItem icon={<IconBot />}      label="Agents"        active={tab === 'agents'}   onClick={() => setTab('agents')} />

          {/* Bottom: MM status */}
          <div style={{ marginTop: 'auto', padding: '12px 14px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 0' }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                backgroundColor: isMMOn ? '#00C853' : '#374151',
                flexShrink: 0,
              }} />
              <span style={{ color: '#6B7280', fontSize: 11, fontWeight: 600 }}>
                MM {isMMOn ? 'ON' : 'OFF'}
              </span>
            </div>
          </div>
        </aside>

        {/* ── Main content ─────────────────────────────────────────────────── */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>

          {/* Overview */}
          {tab === 'overview' && (
            <TabSection title="Overview">
              {/* Revenue banner */}
              <div style={{
                backgroundColor: '#0A2A0A',
                border: '1px solid #00C85330',
                borderRadius: 12,
                padding: '14px 20px',
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 16,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#6B7280', fontSize: 12, fontWeight: 600 }}>Fee income</span>
                  <span style={{ color: '#00E676', fontSize: 14, fontWeight: 700, fontFamily: 'monospace' }}>
                    {totalFees.toFixed(2)}¢
                  </span>
                </div>
                <span style={{ color: '#374151' }}>+</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#6B7280', fontSize: 12, fontWeight: 600 }}>MM spread</span>
                  <span style={{ color: '#00E676', fontSize: 14, fontWeight: 700, fontFamily: 'monospace' }}>
                    {spreadIncome.toFixed(2)}¢
                  </span>
                </div>
                <span style={{ color: '#374151' }}>=</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 600 }}>Total revenue</span>
                  <span style={{ color: '#00C853', fontSize: 16, fontWeight: 800, fontFamily: 'monospace' }}>
                    {(totalFees + spreadIncome).toFixed(2)}¢
                  </span>
                  <Tooltip content="Fee income is 75% of all taker fees. MM spread is half the bid-ask × volume traded while Verdikt acts as market maker." position="bottom">
                    <InfoIcon />
                  </Tooltip>
                </div>
              </div>

              {/* KPI grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard
                  label="Total Volume"
                  value={formatVolume(totalVolume)}
                  sub="cumulative traded"
                  tooltip="Cumulative cents traded across all live markets since launch."
                />
                <KpiCard
                  label="Platform Fees"
                  value={totalFees.toFixed(2)}
                  sub="75% Verdikt share"
                  accent="#00C853"
                  tooltip="Verdikt's 75% share of all taker fees collected."
                />
                <KpiCard
                  label="Active Markets"
                  value={activeMarkets}
                  sub={`${liveCount} live`}
                  live={false}
                  tooltip="Markets live plus those in AI review or MM approval queues."
                />
                <KpiCard
                  label="Active Operators"
                  value="1"
                  sub="Betika Kenya"
                  live={false}
                  tooltip="B2B partners who embed Verdikt markets in their platforms."
                />
              </div>

              {/* MM Toggle */}
              {mmConfig && (
                <MmToggle
                  initial={mmConfig.is_verdikt_acting_as_mm}
                  platformFees={totalFees}
                  makerRebates={totalRebates}
                  spreadIncome={spreadIncome}
                />
              )}

              {/* Operator */}
              <SingleOperatorCard totalVolume={totalVolume} totalFees={totalFees} />
            </TabSection>
          )}

          {/* Markets */}
          {tab === 'markets' && (
            <TabSection
              title="Market Risk Monitor"
              subtitle={`${liveCount} live market${liveCount !== 1 ? 's' : ''} · ${flaggedCount} flagged`}
            >
              <MarketRiskMonitor initial={riskMarkets} />
            </TabSection>
          )}

          {/* Review */}
          {tab === 'review' && (
            <TabSection
              title="Pending Review"
              subtitle="Player-submitted markets awaiting company approval"
            >
              {pendingCount === 0 ? (
                <div style={{
                  backgroundColor: '#161B22',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 16,
                  padding: '48px 24px',
                  textAlign: 'center',
                }}>
                  <p style={{ color: '#4B5563', fontSize: 14 }}>No submissions pending review.</p>
                </div>
              ) : (
                <PendingReviewSection initial={pendingReview} />
              )}
            </TabSection>
          )}

          {/* News → Market */}
          {tab === 'news' && (
            <TabSection
              title="News → Market"
              subtitle="Curate headlines and generate prediction markets with one click"
            >
              <NewsMarketCreator />
            </TabSection>
          )}

          {/* Data Sources */}
          {tab === 'sources' && (
            <TabSection
              title="Data Sources"
              subtitle="Toggle feeds on/off to control what drives AI market pricing"
            >
              <DataSourcesSection initial={apiSources} defaultOpen />
            </TabSection>
          )}

          {/* API Health */}
          {tab === 'health' && (
            <TabSection
              title="API Health"
              subtitle="External data source status and Claude usage today"
            >
              <ApiHealthMonitor sources={apiSources} callsToday={callsToday} aiStats={aiStats} defaultOpen />
            </TabSection>
          )}

          {/* Activity */}
          {tab === 'activity' && (
            <TabSection
              title="Live Activity"
              subtitle="Real-time audit log of all platform events"
            >
              <AuditFeed initial={auditLog} defaultOpen />
            </TabSection>
          )}

          {/* Agents */}
          {tab === 'agents' && (
            <TabSection
              title="AI Agents"
              subtitle="Configure system prompts, tools, rate limits, and guardrails for each assistant"
            >
              <AgentsTab />
            </TabSection>
          )}

        </main>
      </div>

      {/* Company AI chat assistant */}
      <ChatWidget agentType="company" />
    </div>
  )
}
