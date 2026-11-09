import { entryImage, typeLabel } from './compendiumEntry'
import type { CatalogEntry, TypeSummary } from './compendiumEntry'

export interface EntryCardProps {
  entry: CatalogEntry
  type?: TypeSummary
  showType: boolean
  onOpen: () => void
}

export default function EntryCard({ entry, type, showType, onOpen }: EntryCardProps) {
  const image = entryImage(entry)
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        textAlign: 'left',
        padding: 12,
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        color: 'var(--text)',
        cursor: 'pointer',
        font: 'inherit',
      }}
    >
      {image ? (
        <img
          src={image}
          alt=""
          loading="lazy"
          style={{
            width: 48,
            height: 48,
            objectFit: 'contain',
            borderRadius: 6,
            background: 'var(--bg-deep)',
            flexShrink: 0,
          }}
        />
      ) : null}
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontWeight: 600, overflowWrap: 'anywhere' }}>
          {entry.name}
        </span>
        {showType || entry.display ? (
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>
            {[showType ? typeLabel(type) : '', entry.display].filter(Boolean).join(' · ')}
          </span>
        ) : null}
      </span>
    </button>
  )
}
