'use client'

import { useState } from 'react'
import type { CSSProperties, ReactNode, JSX } from 'react'
import {
  ACCENT,
  PURPLE,
  RED,
  S,
  Btn,
  Badge,
  VLoader,
  ProgressBar,
  assetStateColor,
  assetStateLabel,
} from './theme'
import type { AssetItem } from './types'

const MEDIA_H = 150

function DownloadIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function MediaShell({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        position: 'relative',
        height: MEDIA_H,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 14,
        backgroundColor: 'var(--bg-inset)',
        borderBottom: '1px solid var(--border-soft)',
        textAlign: 'center',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function AssetCard({
  asset,
  onGenerateVideo,
  generating,
}: {
  asset: AssetItem
  onGenerateVideo: (taskId: string) => void
  generating: boolean
}): JSX.Element {
  const stateColor = assetStateColor(asset.state)
  const isImageLike = asset.type === 'image' || asset.type === 'carousel'
  const showSpinnerState = asset.state === 'in_progress' || (generating && asset.state !== 'completed')

  const handleDownload = () => {
    if (asset.url) window.open(asset.url, '_blank', 'noopener,noreferrer')
  }

  // ── Media region by state ──────────────────────────────────────────────────
  let media: ReactNode

  if (showSpinnerState) {
    const pct = typeof asset.progress === 'number' ? Math.round(asset.progress) : null
    media = (
      <MediaShell>
        {pct !== null ? (
          <div style={{ fontSize: 30, fontWeight: 800, color: PURPLE, lineHeight: 1 }}>{pct}%</div>
        ) : (
          <VLoader size={42} />
        )}
        <div style={{ width: '100%' }}>
          <ProgressBar value={pct ?? 35} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          {asset.type === 'copy' ? 'Generating…' : 'Optimizing visuals'}
        </div>
      </MediaShell>
    )
  } else if (asset.state === 'completed') {
    if (asset.type === 'video' && asset.url) {
      media = (
        <MediaShell style={{ padding: 0 }}>
          <video
            controls
            preload="metadata"
            src={asset.url}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </MediaShell>
      )
    } else if (isImageLike && asset.url) {
      media = (
        <MediaShell style={{ padding: 0 }}>
          <LazyImage src={asset.url} alt={asset.label} />
        </MediaShell>
      )
    } else {
      // copy / text preview (or media with missing url)
      media = (
        <MediaShell style={{ alignItems: 'stretch', justifyContent: 'flex-start' }}>
          <div
            style={{
              ...S.inset,
              padding: 10,
              fontSize: 11,
              lineHeight: 1.45,
              color: 'var(--text)',
              textAlign: 'left',
              width: '100%',
              height: '100%',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 6,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {asset.text || 'No preview available.'}
          </div>
        </MediaShell>
      )
    }
  } else if (asset.state === 'failed') {
    media = (
      <MediaShell>
        <div style={{ fontSize: 22 }} aria-hidden>
          ⚠️
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: RED }}>Generation failed</div>
        {asset.error ? (
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{asset.error}</div>
        ) : null}
      </MediaShell>
    )
  } else {
    // queued
    media = (
      <MediaShell>
        <div style={{ fontSize: 28 }} aria-hidden>
          ⏳
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Queued — waiting for resources</div>
        {asset.type === 'video' ? (
          <Btn variant="primary" onClick={() => onGenerateVideo(asset.id)} style={{ marginTop: 2 }}>
            Generate
          </Btn>
        ) : null}
      </MediaShell>
    )
  }

  const canDownload = asset.state === 'completed' && (asset.type === 'video' || isImageLike) && !!asset.url

  return (
    <div style={{ ...S.card }}>
      {media}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '10px 12px',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--text-strong)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={asset.label}
          >
            {asset.label}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>{asset.dims}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {asset.type === 'copy' && asset.state === 'completed' && typeof asset.score === 'number' ? (
            <Badge color={asset.score >= 80 ? ACCENT : asset.score >= 60 ? '#E0A020' : RED}>
              {asset.score}/100
            </Badge>
          ) : null}
          <Badge color={stateColor}>{assetStateLabel(asset.state)}</Badge>
          {canDownload ? (
            <button
              type="button"
              onClick={handleDownload}
              title="Download"
              aria-label="Download asset"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 26,
                height: 26,
                padding: 0,
                cursor: 'pointer',
                color: 'var(--text)',
                backgroundColor: 'var(--bg-inset)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <DownloadIcon />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// Lazy-loaded image: native lazy loading + a draw-on "V" placeholder until decoded.
function LazyImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {!loaded && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-inset)' }}>
          <VLoader />
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: loaded ? 1 : 0, transition: 'opacity .3s' }}
      />
    </div>
  )
}
