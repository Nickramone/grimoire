import { useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { ghostBtn, goldBtn } from './wikiShared'

export type Visibility = 'party' | 'gm' | 'self'

const VISIBILITIES: Visibility[] = ['party', 'gm', 'self']
// The backend's limit (ANNOTATION_MAX_LENGTH).
const MAX_LENGTH = 4000

const select: CSSProperties = {
  padding: '6px 8px',
  background: 'var(--bg-deep)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text)',
  fontSize: 13,
}

const textarea: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: 64,
  padding: '8px 10px',
  background: 'var(--bg-deep)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text)',
  font: 'inherit',
  fontSize: 14,
  resize: 'vertical',
}

/** The text box and visibility picker, for a new note or an edit. */
export default function WikiAnnotationForm({
  initialBody = '',
  initialVisibility = 'party',
  shared,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initialBody?: string
  initialVisibility?: string
  shared: boolean
  submitLabel: string
  onSubmit: (body: string, visibility: Visibility) => Promise<boolean>
  onCancel?: () => void
}) {
  const { t } = useTranslation()
  const [body, setBody] = useState(initialBody)
  const [visibility, setVisibility] = useState<Visibility>(initialVisibility as Visibility)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!body.trim() || busy) return
    setBusy(true)
    const ok = await onSubmit(body.trim(), visibility)
    setBusy(false)
    if (ok && !onCancel) setBody('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <textarea
        aria-label={t('wikiNotes.text')}
        placeholder={t('wikiNotes.placeholder')}
        value={body}
        maxLength={MAX_LENGTH}
        onChange={(e) => setBody(e.target.value)}
        style={textarea}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {shared && (
          <select
            aria-label={t('wikiNotes.visibility')}
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as Visibility)}
            style={select}
          >
            {VISIBILITIES.map((v) => (
              <option key={v} value={v}>
                {t(`wikiNotes.vis.${v}`)}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={submit}
          disabled={!body.trim() || busy}
          style={{ ...goldBtn, opacity: !body.trim() || busy ? 0.6 : 1 }}
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button onClick={onCancel} style={ghostBtn}>
            {t('common.cancel')}
          </button>
        )}
      </div>
    </div>
  )
}
