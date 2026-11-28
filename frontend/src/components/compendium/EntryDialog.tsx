import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { compendium as compendiumApi } from '../../api'
import type { Schema } from '../../api'
import Spinner from '../Spinner'
import ContentEntryDetail from '../characters/ContentEntryDetail'
import type { ContentTypeDefinition } from '../characters/ContentEntryDetail'
import ContentEntryDialog from '../characters/ContentEntryDialog'
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

  const type = data?.content_type
  return (
    <ContentEntryDialog
      title={data?.entry.name || (data ? t('compendium.title') : '…')}
      subtitle={
        data
          ? [typeLabel(type), data.entry.display, data.entry.ruleset_name]
              .filter(Boolean)
              .join(' · ')
          : undefined
      }
      onClose={onClose}
    >
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
    </ContentEntryDialog>
  )
}
