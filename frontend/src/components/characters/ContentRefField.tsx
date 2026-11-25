import { useState } from 'react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { LuSearch, LuX, LuPencil, LuInfo } from 'react-icons/lu'
import ContentBrowser from './ContentBrowser'
import ContentEntryDetail from './ContentEntryDetail'
import { catalogFilters, catalogNote } from './catalogFilters'
import ContentEntryDialog from './ContentEntryDialog'
import type { ContentRefValue } from './ContentBrowser'
import FieldRenderer from './FieldRenderer'
import type { FieldDefinition } from './FieldRenderer'
import type { ContentFieldDefinition, ContentTypeDefinition } from './ContentEntryDetail'
import { iconBtn, fieldLabel, ghostBtn } from './characterStyles'

export interface ContentRefFieldProps {
  name: string
  definition?: ContentFieldDefinition
  value?: unknown
  // Resolved catalog entries, keyed by id.
  entries?: Record<string, unknown>
  schemaId?: string
  typeDefinition?: ContentTypeDefinition
  // `meta.entry` is the picked entry's own properties, or null.
  onChange?: (
    value: ContentRefValue | null,
    meta: { entry: Record<string, unknown> | null }
  ) => void
  readOnly?: boolean
  hideLabel?: boolean
  // The character as formulas read it, for the field's `filter_from`.
  context?: Record<string, unknown>
}

/**
 * A single pick from the catalog — a class, an ancestry, a kit.
 *
 * Stores `{_ref, _source}`, never a copy of the entry, so an erratum or a
 * ruleset edit reaches every character that chose it. The entry's own values
 * come from `entries`, which the sheet resolves in one request.
 *
 * `allow_freeform` adds an `_inline` value: something the player types rather
 * than picks. That is the escape hatch that keeps the catalog optional — a
 * homebrew class or species never has to open the browser.
 */
export default function ContentRefField({
  name,
  definition = {},
  value,
  entries = {},
  schemaId,
  typeDefinition = {},
  onChange,
  readOnly = false,
  hideLabel = false,
  context,
}: ContentRefFieldProps) {
  const { t } = useTranslation()
  const [browsing, setBrowsing] = useState(false)
  const [editingInline, setEditingInline] = useState(false)
  const [viewing, setViewing] = useState(false)

  // A sheet can turn a text field into a pick (a subclass, say), and the
  // characters saved before that still hold the text. It reads as a custom
  // entry of that name, and becomes one the first time it is edited.
  const ref =
    typeof value === 'string'
      ? value.trim()
        ? ({ _inline: true, name: value } as ContentRefValue)
        : null
      : value && typeof value === 'object'
        ? (value as ContentRefValue)
        : null
  const inline = !!ref?._inline
  const entry = (!inline && ref?._ref ? entries[ref._ref] : null) as
    { name?: string } | null | undefined
  // A reference whose entry is not installed still shows what was chosen: the
  // id is what the player picked, and hiding it would look like data loss.
  const display = inline ? ref!.name || t('characters.customEntry') : entry?.name || ref?._ref || ''
  const missing = !inline && !!ref?._ref && !entry
  // What the detail window shows: the catalog entry, or the values a custom
  // entry was given. A reference to an entry that is not installed has none.
  const detail = (inline ? ref : entry) as Record<string, unknown> | null | undefined
  const openDetail = detail ? () => setViewing(true) : undefined

  // The fields a freeform entry can be given - the content type's own, so a
  // custom class keeps a hit die just as a catalog one does.
  const inlineFields: Record<string, FieldDefinition> = Object.keys(typeDefinition.fields || {})
    .length
    ? typeDefinition.fields!
    : { name: { type: 'text', label: t('characters.name') } }

  const startInline = () => {
    onChange?.({ _inline: true, name: '' }, { entry: null })
    setEditingInline(true)
  }

  const setInline = (key: string, cellValue: unknown) => {
    if (!inline) return
    onChange?.({ ...ref, [key]: cellValue }, { entry: null })
  }

  return (
    <div className="gc-field">
      {hideLabel ? null : <div style={fieldLabel}>{definition.label || name}</div>}

      {/* A read-only custom entry reads like a catalog one: a box that opens
          its detail, not a disabled text input. */}
      {inline && !readOnly ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="text"
              value={ref!.name || ''}
              onChange={(e) => setInline('name', e.target.value)}
              disabled={readOnly}
              placeholder={t('characters.customEntry')}
              aria-label={definition.label || name}
              style={{
                flex: 1,
                minWidth: 0,
                padding: '6px 9px',
                border: '1px solid var(--border-control)',
                borderRadius: 6,
                background: 'var(--bg-deep)',
                color: 'var(--text)',
                fontSize: 13,
                minHeight: 32,
                font: 'inherit',
              }}
            />
            {readOnly ? null : (
              <>
                <button
                  type="button"
                  onClick={() => setEditingInline((open) => !open)}
                  aria-expanded={editingInline}
                  aria-label={t(editingInline ? 'characters.hideEntry' : 'characters.showEntry', {
                    name: ref.name || t('characters.customEntry'),
                  })}
                  title={t(editingInline ? 'characters.hideEntry' : 'characters.showEntry', {
                    name: ref.name || t('characters.customEntry'),
                  })}
                  style={{ ...iconBtn, padding: 3 }}
                >
                  <LuPencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChange?.(null, { entry: null })
                    setEditingInline(false)
                  }}
                  aria-label={t('characters.clearChoice')}
                  title={t('characters.clearChoice')}
                  style={{ ...iconBtn, padding: 3 }}
                >
                  <LuX size={14} />
                </button>
              </>
            )}
          </div>
          {editingInline && !readOnly ? (
            <div style={inlineEditor}>
              {Object.entries(inlineFields)
                .filter(([key]) => key !== 'name')
                .map(([key, fieldDefinition]) => (
                  <div
                    key={key}
                    style={
                      fieldDefinition.type === 'textarea' ? { gridColumn: '1 / -1' } : undefined
                    }
                  >
                    <FieldRenderer
                      name={`${name}.${key}`}
                      definition={fieldDefinition}
                      value={ref![key]}
                      onChange={(v) => setInline(key, v)}
                    />
                  </div>
                ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {/* The box itself opens the picker. A separate search button beside it
                cost ~40px, and in a row of pickers that squeezed each name until it
                wrapped - "Dragonborn" over two lines. It stays on one line now, and
                the full name is in the tooltip if it has to be cut short. */}
            <button
              type="button"
              // Read-only, the box opens the chosen entry's detail instead: the
              // choice is made elsewhere (a level-up), the sheet only shows it.
              onClick={readOnly ? openDetail : () => setBrowsing(true)}
              disabled={readOnly && !openDetail}
              aria-label={
                readOnly
                  ? openDetail
                    ? t('characters.showEntry', { name: display })
                    : display || definition.label || name
                  : t('characters.chooseEntry', { label: definition.label || name })
              }
              title={display || undefined}
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 9px',
                border: '1px solid var(--border)',
                borderRadius: 6,
                background: 'var(--bg-deep)',
                color: display ? 'var(--text)' : 'var(--text-muted)',
                fontSize: 13,
                minHeight: 32,
                textAlign: 'left',
                cursor: readOnly && !openDetail ? 'default' : 'pointer',
                font: 'inherit',
              }}
            >
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {display || '—'}
              </span>
              {missing ? (
                <span style={{ color: 'var(--warning)', fontSize: 11, whiteSpace: 'nowrap' }}>
                  {t('characters.entryMissing')}
                </span>
              ) : null}
              {readOnly ? null : <LuSearch size={13} style={{ flexShrink: 0, opacity: 0.6 }} />}
            </button>

            {readOnly || !openDetail ? null : (
              <button
                type="button"
                onClick={openDetail}
                aria-label={t('characters.showEntry', { name: display })}
                title={t('characters.showEntry', { name: display })}
                style={{ ...iconBtn, padding: 3 }}
              >
                <LuInfo size={14} />
              </button>
            )}
            {readOnly || !definition.allow_freeform ? null : (
              <button
                type="button"
                onClick={startInline}
                aria-label={t('characters.addCustom')}
                title={t('characters.addCustom')}
                style={{ ...iconBtn, padding: 3 }}
              >
                <LuPencil size={14} />
              </button>
            )}

            {readOnly || !ref ? null : (
              <button
                type="button"
                onClick={() => onChange?.(null, { entry: null })}
                aria-label={t('characters.clearChoice')}
                title={t('characters.clearChoice')}
                style={{ ...iconBtn, padding: 3 }}
              >
                <LuX size={14} />
              </button>
            )}
          </div>

          {/* When freeform is on and nothing is chosen yet, also offer an explicit
              "Add custom" control — the pencil icon alone is easy to miss in a
              dense header row of species / class / background. */}
          {readOnly || ref || !definition.allow_freeform ? null : (
            <button
              type="button"
              onClick={startInline}
              style={{ ...ghostBtn, fontSize: 12, padding: '4px 8px', marginTop: 4 }}
            >
              <LuPencil size={13} />
              {t('characters.addCustom')}
            </button>
          )}
        </div>
      )}

      {viewing && detail ? (
        <ContentEntryDialog
          title={display}
          subtitle={typeDefinition.label || definition.label}
          onClose={() => setViewing(false)}
        >
          <ContentEntryDetail entry={{ data: detail }} typeDefinition={typeDefinition} />
        </ContentEntryDialog>
      ) : null}
      {browsing ? (
        <ContentBrowser
          schemaId={schemaId!}
          contentType={definition.content_type!}
          typeDefinition={typeDefinition}
          chosen={ref && !inline ? [ref] : []}
          fixedFilters={catalogFilters(definition, context)}
          entryNote={catalogNote(definition, context)}
          onChoose={(picked, chosenEntry) => {
            setEditingInline(false)
            onChange?.(picked, { entry: chosenEntry })
          }}
          onClose={() => setBrowsing(false)}
        />
      ) : null}
    </div>
  )
}

const inlineEditor: CSSProperties = {
  margin: '6px 0 8px',
  padding: 12,
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg-deep)',
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
  gap: 10,
}
