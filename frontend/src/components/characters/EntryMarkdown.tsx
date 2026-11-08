import type { CSSProperties } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import LazyImg from '../LazyImg'
import { fieldLabel } from './characterStyles'

export interface EntryMarkdownProps {
  label: string
  body: string
}

function cellStyle(header: boolean): CSSProperties {
  return {
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
    return <th style={cellStyle(true)}>{children}</th>
  },
  td({ children }) {
    return <td style={cellStyle(false)}>{children}</td>
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
