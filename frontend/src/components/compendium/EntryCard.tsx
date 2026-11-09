import type { ViewMode } from '../../hooks/useViewMode'
import { entryImage, typeLabel } from './compendiumEntry'
import type { CatalogEntry, TypeSummary } from './compendiumEntry'

export interface EntryCardProps {
  entry: CatalogEntry
  type?: TypeSummary
  showType: boolean
  onOpen: () => void
  /** card: picture and two lines; compact: smaller tile; list: one row. */
  mode?: ViewMode
}

const IMAGE_SIZE: Record<ViewMode, number> = { card: 48, compact: 32, list: 24 }

export default function EntryCard({
  entry,
  type,
  showType,
  onOpen,
  mode = 'card',
}: EntryCardProps) {
  const image = entryImage(entry)
  const size = IMAGE_SIZE[mode]
  const detail = [showType ? typeLabel(type) : '', entry.display].filter(Boolean).join(' · ')
  const list = mode === 'list'
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        gap: list ? 10 : 12,
        alignItems: 'center',
        textAlign: 'left',
        padding: mode === 'card' ? 12 : list ? '6px 12px' : 8,
        background: list ? 'transparent' : 'var(--bg-panel)',
        border: list ? 'none' : '1px solid var(--border)',
        borderRadius: list ? 6 : mode === 'compact' ? 8 : 10,
        color: 'var(--text)',
        cursor: 'pointer',
        font: 'inherit',
        fontSize: mode === 'card' ? undefined : 14,
      }}
    >
      {image ? (
        <img
          src={image}
          alt=""
          loading="lazy"
          style={{
            width: size,
            height: size,
            objectFit: 'contain',
            borderRadius: list ? 4 : 6,
            background: 'var(--bg-deep)',
            flexShrink: 0,
          }}
        />
      ) : list ? (
        // Keeps the names in one column whether or not a row has a picture.
        <span aria-hidden="true" style={{ width: size, flexShrink: 0 }} />
      ) : null}
      {list ? (
        <span style={{ minWidth: 0, flex: 1, display: 'flex', gap: 12, alignItems: 'baseline' }}>
          <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{entry.name}</span>
          {detail ? (
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 12,
                color: 'var(--text-muted)',
                textAlign: 'right',
              }}
            >
              {detail}
            </span>
          ) : null}
        </span>
      ) : (
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', fontWeight: 600, overflowWrap: 'anywhere' }}>
            {entry.name}
          </span>
          {detail ? (
            <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>
              {detail}
            </span>
          ) : null}
        </span>
      )}
    </button>
  )
}
