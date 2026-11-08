import type { CSSProperties, ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import LazyImg from '../LazyImg'
import { fieldLabel } from './characterStyles'

export interface EntryMarkdownProps {
  label: string
  body: string
}

// A cell holding one token (a die roll, a range such as 02-10, a number) stays on
// one line: with the body's break-anywhere wrapping, the table's automatic layout
// would otherwise shrink that column to a character or two.
function isSingleToken(children: ReactNode): boolean {
  return typeof children === 'string' && !/\s/.test(children.trim())
}

function cellStyle(header: boolean, children: ReactNode): CSSProperties {
  return {
    overflowWrap: 'normal',
    whiteSpace: isSingleToken(children) ? 'nowrap' : 'normal',
    border: '1px solid var(--border)',
    padding: '6px 10px',
    textAlign: 'left',
    background: header ? 'var(--bg)' : 'transparent',
    fontWeight: header ? 600 : 400,
  }
}

const components: Components = {
  img({ src, alt }) {
    return (
      <LazyImg
        src={typeof src === 'string' ? src : undefined}
        alt={alt || ''}
        style={{
          maxWidth: 'min(100%, 320px)',
          borderRadius: 8,
          display: 'block',
          margin: '8px 0',
          float: 'right',
          marginLeft: 12,
        }}
      />
    )
  },
  table({ children }) {
    return (
      <div style={{ overflowX: 'auto', clear: 'both' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', margin: '8px 0' }}>
          {children}
        </table>
      </div>
    )
  },
  th({ children }) {
    return <th style={cellStyle(true, children)}>{children}</th>
  },
  td({ children }) {
    return <td style={cellStyle(false, children)}>{children}</td>
  },
  blockquote({ children }) {
    return (
      <blockquote
        style={{
          borderLeft: '3px solid var(--border-light, var(--border))',
          margin: '8px 0',
          padding: '2px 14px',
          color: 'var(--text-dim)',
        }}
      >
        {children}
      </blockquote>
    )
  },
}

/**
 * A read-only rich-text field of a catalog entry (e.g. a compendium entry's
 * description), rendered as Markdown with the same element styling as the wiki.
 * Raw HTML is not rendered: react-markdown escapes it by default.
 */
export default function EntryMarkdown({ label, body }: EntryMarkdownProps) {
  return (
    <div>
      <div style={fieldLabel}>{label}</div>
      <div className="wiki-markdown" style={{ lineHeight: 1.5, overflowWrap: 'anywhere' }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {body}
        </ReactMarkdown>
      </div>
      <div style={{ clear: 'both' }} />
    </div>
  )
}
