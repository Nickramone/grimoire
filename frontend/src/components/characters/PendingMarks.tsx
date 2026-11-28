import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { LuTriangleAlert } from 'react-icons/lu'
import { PendingChoices, pendingFrom } from './sheetPrompts'

/**
 * A choice put off, marked where it belongs: beside the field whose pick
 * opened it, or on the row of a list - a feat's tools still to choose. Each
 * mark opens its choice again. Nothing shows on a sheet that cannot be edited.
 */
export default function PendingMarks({ source, rowRef }: { source: string; rowRef?: string }) {
  const { t } = useTranslation()
  const choices = useContext(PendingChoices)
  if (!choices) return null
  const own = pendingFrom(choices.pending, source, rowRef)
  if (!own.length) return null
  return (
    <span className="gc-pending" style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
      {own.map((request) => {
        const label = choices.label(request)
        return (
          <button
            key={`${request.prompt}:${request.ref || ''}`}
            type="button"
            className="gc-pending-mark"
            onClick={() => choices.reopen(request)}
            aria-label={t('characters.promptChooseNow', { name: label })}
            title={t('characters.promptChooseNow', { name: label })}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              border: '1px solid var(--warning)',
              borderRadius: 6,
              background: 'color-mix(in srgb, var(--warning) 12%, transparent)',
              color: 'var(--text)',
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >
            <LuTriangleAlert size={12} style={{ color: 'var(--warning)', flexShrink: 0 }} />
            {label}
          </button>
        )
      })}
    </span>
  )
}
