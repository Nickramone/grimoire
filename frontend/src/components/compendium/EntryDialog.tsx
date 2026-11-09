import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuX } from 'react-icons/lu'
import { compendium as compendiumApi } from '../../api'
import type { Schema } from '../../api'
import Spinner from '../Spinner'
import ContentEntryDetail from '../characters/ContentEntryDetail'
import type { ContentTypeDefinition } from '../characters/ContentEntryDetail'
import { iconBtn } from '../characters/characterStyles'
import { typeLabel } from './compendiumEntry'

export interface EntryDialogProps {
  schemaId: string
  contentType: string
  entryId: string
  onClose: () => void
}

export default function EntryDialog({ schemaId, contentType, entryId, onClose }: EntryDialogProps) {
  const { t } = useTranslation()
  const [data, setData] = useState<Schema<'CompendiumEntryResponse'> | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    setData(null)
    setError('')
    compendiumApi
      .entry(schemaId, contentType, entryId)
      .then((result) => live && setData(result))
      .catch((e: Error) => live && setError(e.message || t('compendium.loadFailed')))
    return () => {
      live = false
    }
  }, [schemaId, contentType, entryId, t])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const type = data?.content_type
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={data?.entry.name || t('compendium.title')}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--scrim-strong)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          width: '100%',
          maxWidth: 820,
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 20 }}>{data?.entry.name || '…'}</h2>
            {data ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {[typeLabel(type), data.entry.display, data.entry.ruleset_name]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            ) : null}
          </div>
          <button onClick={onClose} aria-label={t('common.close')} style={iconBtn}>
            <LuX size={18} />
          </button>
        </header>
        <div style={{ overflowY: 'auto', padding: '4px 20px 20px' }}>
          {error ? (
            <p role="alert" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          ) : data && type ? (
            <ContentEntryDetail
              entry={data.entry}
              typeDefinition={type as unknown as ContentTypeDefinition}
            />
          ) : (
            <div style={{ padding: 24, textAlign: 'center' }}>
              <Spinner />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
