'use client'

// Per-asset-type preview used by the Inspector (spec §Inspector asset_preview).
// Self-contained: depends only on React + the ACCENT brand token. All surfaces
// use CSS variables so both themes come for free. SSR-safe (navigator/window
// access is guarded).

import React from 'react'
import { ACCENT } from '@/components/company/marketing/director/theme'

type AssetPreviewProps = {
  type: string
  url?: string
  text?: string
}

const BOX_MAX_HEIGHT = 260

const boxStyle: React.CSSProperties = {
  width: '100%',
  maxHeight: BOX_MAX_HEIGHT,
  borderRadius: 12,
  background: 'var(--bg-inset)',
  border: '1px solid var(--border-soft)',
  objectFit: 'contain',
  display: 'block',
}

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginTop: 8,
}

const buttonStyle: React.CSSProperties = {
  appearance: 'none',
  border: '1px solid var(--border)',
  background: 'var(--bg-surface)',
  color: 'var(--text-strong)',
  borderRadius: 10,
  padding: '6px 12px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}

const linkStyle: React.CSSProperties = {
  ...buttonStyle,
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
}

function Placeholder(): React.JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: 140,
        borderRadius: 12,
        background: 'var(--bg-inset)',
        border: '1px solid var(--border-soft)',
        color: 'var(--text-muted)',
        fontSize: 13,
      }}
    >
      No preview available.
    </div>
  )
}

function ImagePreview({ url }: { url: string }): React.JSX.Element {
  const [zoom, setZoom] = React.useState(false)

  return (
    <div>
      <img src={url} alt="Asset preview" loading="lazy" style={boxStyle} />
      <div style={toolbarStyle}>
        <button
          type="button"
          onClick={() => setZoom((v) => !v)}
          style={{
            ...buttonStyle,
            borderColor: zoom ? ACCENT : 'var(--border)',
            color: zoom ? ACCENT : 'var(--text-strong)',
          }}
          aria-pressed={zoom}
        >
          {zoom ? 'Zoom on' : 'Zoom'}
        </button>
        <a href={url} target="_blank" rel="noreferrer" download style={linkStyle}>
          Download
        </a>
      </div>

      {zoom ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setZoom(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') setZoom(false)
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 90,
            background: 'rgba(0,0,0,0.82)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            cursor: 'zoom-out',
          }}
        >
          <img
            src={url}
            alt="Asset preview enlarged"
            style={{
              maxWidth: '95vw',
              maxHeight: '95vh',
              objectFit: 'contain',
              borderRadius: 12,
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          />
        </div>
      ) : null}
    </div>
  )
}

function VideoPreview({ url }: { url: string }): React.JSX.Element {
  return (
    <div>
      <video
        src={url}
        controls
        preload="metadata"
        style={{
          width: '100%',
          maxHeight: BOX_MAX_HEIGHT,
          borderRadius: 12,
          background: 'var(--bg-inset)',
          border: '1px solid var(--border-soft)',
          display: 'block',
        }}
      />
      <div style={toolbarStyle}>
        <a href={url} target="_blank" rel="noreferrer" download style={linkStyle}>
          Download
        </a>
      </div>
    </div>
  )
}

function TextPreview({ text }: { text: string }): React.JSX.Element {
  const [copied, setCopied] = React.useState(false)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const onCopy = React.useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setCopied(false), 1500)
      },
      () => {
        /* ignore clipboard rejection */
      },
    )
  }, [text])

  return (
    <div>
      <div
        style={{
          maxHeight: BOX_MAX_HEIGHT,
          overflowY: 'auto',
          padding: 12,
          borderRadius: 12,
          background: 'var(--bg-inset)',
          border: '1px solid var(--border-soft)',
          color: 'var(--text-strong)',
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, "Cascadia Code", monospace',
          fontSize: 13,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {text}
      </div>
      <div style={toolbarStyle}>
        <button
          type="button"
          onClick={onCopy}
          style={{
            ...buttonStyle,
            borderColor: copied ? ACCENT : 'var(--border)',
            color: copied ? ACCENT : 'var(--text-strong)',
          }}
        >
          {copied ? 'Copied' : 'Copy text'}
        </button>
      </div>
    </div>
  )
}

export function AssetPreview({ type, url, text }: AssetPreviewProps): React.JSX.Element {
  const normalized = type.toLowerCase()

  if ((normalized === 'image' || normalized === 'carousel') && url) {
    return <ImagePreview url={url} />
  }

  if (normalized === 'video' && url) {
    return <VideoPreview url={url} />
  }

  if (
    (normalized === 'copy' || normalized === 'social' || normalized === 'blog') &&
    text
  ) {
    return <TextPreview text={text} />
  }

  return <Placeholder />
}
