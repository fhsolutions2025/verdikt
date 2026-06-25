'use client'

import { useState, useEffect } from 'react'
import { Market } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { OpenBookRow } from './OpenBookRow'
import { AiReadyMarketCard } from './AiReadyMarketCard'

type Tab = 'open-book' | 'ai-ready'

interface Props {
  initialLiveMarkets: Market[]
  initialAiMarkets:   Market[]
  mmId:               string
}

export function MmDeskClient({ initialLiveMarkets, initialAiMarkets, mmId }: Props) {
  const [tab, setTab]             = useState<Tab>('open-book')
  const [liveMarkets, setLive]    = useState<Market[]>(initialLiveMarkets)
  const [aiMarkets, setAi]        = useState<Market[]>(initialAiMarkets)
  const supabase                  = createClient()

  useEffect(() => {
    const channel = supabase
      .channel('mm-desk-markets')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'markets' },
        payload => {
          const updated = payload.new as Market
          if (updated.status === 'live') {
            setLive(prev => {
              const exists = prev.find(m => m.id === updated.id)
              return exists
                ? prev.map(m => m.id === updated.id ? updated : m)
                : [...prev, updated]
            })
            setAi(prev => prev.filter(m => m.id !== updated.id))
          } else if (updated.status === 'ai_ready' || updated.status === 'pending_mm_review') {
            setAi(prev => {
              const exists = prev.find(m => m.id === updated.id)
              return exists
                ? prev.map(m => m.id === updated.id ? updated : m)
                : [...prev, updated]
            })
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  function handleApproved(id: string) {
    setAi(prev => prev.filter(m => m.id !== id))
  }

  function handleRejected(id: string) {
    setAi(prev => prev.filter(m => m.id !== id))
  }

  return (
    <div className="space-y-4">
      {/* Tab bar — Open Book is default/primary per DESIGN_SYSTEM §7.2 */}
      <div className="flex gap-1" style={{ borderBottom: '1px solid var(--border)' }}>
        <TabButton
          label={`Open Book (${liveMarkets.length})`}
          active={tab === 'open-book'}
          onClick={() => setTab('open-book')}
        />
        <TabButton
          label={`AI Ready (${aiMarkets.length})`}
          active={tab === 'ai-ready'}
          onClick={() => setTab('ai-ready')}
          badge={aiMarkets.length > 0 ? aiMarkets.length : undefined}
        />
      </div>

      {/* Open Book */}
      {tab === 'open-book' && (
        <div className="space-y-3">
          {liveMarkets.map(m => (
            <OpenBookRow key={m.id} market={m} />
          ))}
          {liveMarkets.length === 0 && (
            <EmptyState message="No live markets in the book." />
          )}
        </div>
      )}

      {/* AI Ready Markets */}
      {tab === 'ai-ready' && (
        <div className="space-y-3">
          {aiMarkets.map(m => (
            <AiReadyMarketCard
              key={m.id}
              market={m}
              mmId={mmId}
              onApproved={handleApproved}
              onRejected={handleRejected}
            />
          ))}
          {aiMarkets.length === 0 && (
            <EmptyState message="No AI-ready markets awaiting approval." />
          )}
        </div>
      )}
    </div>
  )
}

function TabButton({
  label, active, onClick, badge,
}: {
  label: string; active: boolean; onClick: () => void; badge?: number
}) {
  return (
    <button
      onClick={onClick}
      className="relative px-4 py-2.5 text-sm font-bold transition-all"
      style={{
        color:         active ? '#00A844' : 'var(--text-dim)',
        background:    'none',
        border:        'none',
        borderBottom:  active ? '2px solid #00C853' : '2px solid transparent',
        cursor:        'pointer',
      }}
    >
      {label}
      {badge != null && badge > 0 && (
        <span
          className="ml-1.5 text-xs font-bold px-1.5 py-0.5 rounded-full"
          style={{ backgroundColor: '#E05C2020', color: '#E05C20' }}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      className="rounded-2xl p-8 text-center"
      style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border)' }}
    >
      <p className="text-sm" style={{ color: 'var(--text-faint)' }}>{message}</p>
    </div>
  )
}
