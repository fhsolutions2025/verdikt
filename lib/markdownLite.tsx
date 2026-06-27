import React from 'react'

// Tiny markdown renderer for CMS info pages — no dependency. Supports headings
// (#, ##, ###), unordered lists (-, *), bold (**…**), links ([t](url)), and
// paragraphs separated by blank lines. Anything else renders as plain text.
// This is for trusted, admin-authored content (cms_pages), not user input.

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  // Split on **bold** and [label](href), preserving the delimiters.
  const re = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**')) {
      nodes.push(<strong key={`${keyPrefix}-b${i}`}>{tok.slice(2, -2)}</strong>)
    } else {
      const lm = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      if (lm) {
        nodes.push(
          <a
            key={`${keyPrefix}-a${i}`}
            href={lm[2]}
            style={{ color: '#00A844', textDecoration: 'underline' }}
            target={lm[2].startsWith('http') ? '_blank' : undefined}
            rel={lm[2].startsWith('http') ? 'noopener noreferrer' : undefined}
          >
            {lm[1]}
          </a>,
        )
      } else {
        nodes.push(tok)
      }
    }
    last = m.index + tok.length
    i++
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

export function MarkdownLite({ body }: { body: string }) {
  const lines = body.replace(/\r\n/g, '\n').split('\n')
  const blocks: React.ReactNode[] = []
  let para: string[] = []
  let list: string[] = []
  let key = 0

  const flushPara = () => {
    if (para.length) {
      blocks.push(
        <p key={`p${key++}`} style={{ margin: '0 0 12px', lineHeight: 1.6, color: 'var(--text-muted)', fontSize: 14 }}>
          {renderInline(para.join(' '), `p${key}`)}
        </p>,
      )
      para = []
    }
  }
  const flushList = () => {
    if (list.length) {
      blocks.push(
        <ul key={`u${key++}`} style={{ margin: '0 0 12px', paddingLeft: 20, lineHeight: 1.6, color: 'var(--text-muted)', fontSize: 14 }}>
          {list.map((li, idx) => <li key={idx} style={{ marginBottom: 4 }}>{renderInline(li, `u${key}-${idx}`)}</li>)}
        </ul>,
      )
      list = []
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) { flushPara(); flushList(); continue }

    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) {
      flushPara(); flushList()
      const level = h[1].length
      const size = level === 1 ? 24 : level === 2 ? 19 : 16
      blocks.push(
        React.createElement(
          `h${level}`,
          { key: `h${key++}`, style: { margin: '18px 0 10px', fontWeight: 800, fontSize: size, color: 'var(--text-strong)', lineHeight: 1.25 } },
          renderInline(h[2], `h${key}`),
        ),
      )
      continue
    }

    const li = line.match(/^[-*]\s+(.*)$/)
    if (li) { flushPara(); list.push(li[1]); continue }

    flushList()
    para.push(line.trim())
  }
  flushPara(); flushList()

  return <>{blocks}</>
}
