import { useState, Fragment } from 'react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { LuSearch, LuTrash2, LuPencil } from 'react-icons/lu'
import ContentBrowser from './ContentBrowser'
import type { ContentRefValue } from './ContentBrowser'
import FieldRenderer from './FieldRenderer'
import type { FieldDefinition } from './FieldRenderer'
import ContentEntryDetail from './ContentEntryDetail'
import type { ContentFieldDefinition, ContentTypeDefinition } from './ContentEntryDetail'
import { ghostBtn, iconBtn, fieldLabel } from './characterStyles'
import { evaluate } from './expressions'

type EntryValues = Record<string, unknown>

export interface ContentListFieldProps {
  name: string
  definition?: ContentFieldDefinition
  value?: unknown
  // Resolved catalog entries, keyed by id.
  entries?: Record<string, unknown>
  schemaId?: string
  typeDefinition?: ContentTypeDefinition
  // The sheet's content types, for a per-entry field that is itself a pick.
  contentTypes?: Record<string, unknown>
  // `meta.entry` is a newly picked entry's own properties, for `on_pick`;
  // `meta.picked` holds entries just picked in a per-entry field, by id, so the
  // sheet can read them before the next save resolves them.
  onChange?: (value: ContentRefValue[], meta?: ContentListChangeMeta) => void
  readOnly?: boolean
  hideLabel?: boolean
  // The character as formulas read it, for a per-entry field's `visible_if`
  // and `disabled_if`. Without it those see only the list and the row.
  context?: Record<string, unknown>
}

export interface ContentListChangeMeta {
  entry?: EntryValues | null
  picked?: Record<string, EntryValues>
}

/**
 * Many picks from the catalog — spells known, feats, cyberware.
 *
 * Each row stores `{_ref, _source}` plus the character's own `_per` notes
 * (prepared, equipped, uses remaining), which are ordinary fields the schema
 * declares as `per_entry_fields` and which render through `FieldRenderer` like
 * anything else.
 *
 * `allow_freeform` adds an `_inline` row: something the player types rather
 * than picks. That is the escape hatch that keeps the catalog optional — a
 * player who wants to write their own list never has to open the browser.
 */
export default function ContentListField({
  name,
  definition = {},
  value,
  entries = {},
  schemaId,
  typeDefinition = {},
  contentTypes = {},
  onChange,
  readOnly = false,
  hideLabel = false,
  context,
}: ContentListFieldProps) {
  const { t } = useTranslation()
  const [browsing, setBrowsing] = useState(false)
  // Which rows are open to show the whole entry, by position.
  const [open, setOpen] = useState(() => new Set<number>())

  const rows: ContentRefValue[] = Array.isArray(value) ? value : []
  const perFields = definition.per_entry_fields || {}
  // `display_columns` draws the list as a table of the entries' own properties
  // - a spell's level, casting time and range - the way a printed sheet lists
  // them. Without it, each row is a name and a one-line summary.
  const columns = (definition.display_columns || []).map((column) =>
    typeof column === 'string'
      ? { key: column, label: typeDefinition.fields?.[column]?.label || column }
      : column
  )

  const add = (picked: ContentRefValue, entry?: EntryValues) => {
    // Picking something already on the sheet is a no-op rather than a duplicate
    // row: two copies of the same spell is never what was meant.
    if (rows.some((row) => row?._ref === picked._ref)) return
    // A new row starts from each per-entry field's declared `default` - an
    // inventory item is added as one, not as an empty quantity - and from its
    // `default_from`, worked out once, now, with the entry being added as
    // `row`: a "+1 Longsword" starts with its base picked.
    const starting = {
      ...Object.fromEntries(
        Object.entries(perFields)
          .filter(([, field]) => field.default !== undefined)
          .map(([key, field]) => [key, field.default])
      ),
      ...perEntryDefaults(perFields, entry),
    }
    const row = Object.keys(starting).length
      ? { ...picked, _per: { ...starting, ...(picked._per || {}) } }
      : picked
    onChange?.([...rows, row], { entry: entry ?? null })
  }

  // A new custom entry opens straight away, ready to be named.
  const addInline = () => {
    onChange?.([...rows, { _inline: true, name: '' }])
    setOpen((prev) => new Set(prev).add(rows.length))
  }

  const remove = (index: number) => {
    onChange?.(rows.filter((_, i) => i !== index))
    setOpen(new Set())
  }

  const toggle = (index: number) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })

  const setPer = (index: number, key: string, cellValue: unknown, cellMeta?: unknown) => {
    // A per-entry pick hands back the entry it picked; the sheet holds on to it
    // so formulas reading the pick work before the next save resolves it.
    const pickedEntry =
      cellMeta && typeof cellMeta === 'object' && 'entry' in cellMeta
        ? (cellMeta as { entry: EntryValues | null }).entry
        : null
    const pickedId = (cellValue as ContentRefValue | null)?._ref
    const next = rows.map((row, i) =>
      i === index ? { ...row, _per: { ...(row._per || {}), [key]: cellValue } } : row
    )
    if (pickedEntry && pickedId) onChange?.(next, { picked: { [pickedId]: pickedEntry } })
    else onChange?.(next)
  }

  const setInline = (index: number, key: string, cellValue: unknown) =>
    onChange?.(rows.map((row, i) => (i === index ? { ...row, [key]: cellValue } : row)))

  // The fields a freeform entry can be given - the content type's own, so a
  // custom trait has a description just as a catalog one does.
  const inlineFields: Record<string, FieldDefinition> = Object.keys(typeDefinition.fields || {})
    .length
    ? typeDefinition.fields!
    : { name: { type: 'text', label: t('characters.name') } }

  // A per-entry field's `visible_if` and `disabled_if` read the entry as `row`
  // - the catalog entry with the character's per-entry values on top, or a
  // freeform entry as written - beside the character's own names: an
  // "attuned" box only on items that need attunement, and none ticked past the
  // limit. A broken `visible_if` shows the field and a broken `disabled_if`
  // leaves it editable, as a field's own condition does.
  const conditionContext = (row: ContentRefValue) => {
    const per = (row?._per || {}) as EntryValues
    const entry = (row as EntryValues)?._inline ? row : entries[String(row?._ref)]
    const resolved = {
      ...(entry && typeof entry === 'object' ? (entry as EntryValues) : {}),
      ...per,
    }
    return { [name]: rows, _entries: entries, ...(context || {}), row: resolved }
  }

  const isShown = (row: ContentRefValue, perDefinition: FieldDefinition) => {
    const { visible_if: visibleIf } = perDefinition as EntryValues
    return !visibleIf || Boolean(evaluate(visibleIf, conditionContext(row), true))
  }

  // A per-entry field hidden on every row takes no column at all: a value the
  // sheet ticks elsewhere (a feature's uses, in a tracker of their own) leaves
  // no empty column behind in the list.
  const perEntries = Object.entries(perFields).filter(([, perDefinition]) =>
    rows.some((row) => isShown(row, perDefinition))
  )

  // A per-entry field with `in_title` adds its value to the row's name - the
  // style a "Fighting Style" feature was given, "Fighting Style: Defense" - and
  // one with `detail_entry` (a content type) holds the id of an entry whose
  // whole text opens beneath the row's own: the feat that style is. Either is
  // usually hidden as a column with `visible_if: "false"`.
  const titleOf = (row: ContentRefValue, base: string): string => {
    const extra = Object.entries(perFields)
      .filter(([, perDefinition]) => (perDefinition as EntryValues).in_title)
      .map(([key]) => row?._per?.[key])
      .filter((value) => value !== undefined && value !== null && value !== '' && value !== false)
      .map(String)
    return extra.length ? `${base}: ${extra.join(', ')}` : base
  }
  const detailEntries = (row: ContentRefValue) =>
    Object.entries(perFields).flatMap(([key, perDefinition]) => {
      const type = (perDefinition as EntryValues).detail_entry
      const id = row?._per?.[key]
      if (typeof type !== 'string' || !type || id === undefined || id === null || id === '') {
        return []
      }
      const found = entries[String(id)]
      if (!found || typeof found !== 'object') return []
      return [
        {
          key,
          entry: found as EntryValues,
          typeDefinition: (contentTypes[type] || {}) as ContentTypeDefinition,
        },
      ]
    })

  // A per-entry select's `options_filter` keeps the options this row offers,
  // read with the entry as `row` and the option's value as `option`: one
  // "choice" field whose options differ from feature to feature. The value
  // held stays listed, so a choice the row no longer offers still shows. A
  // filter that does not parse keeps every option.
  const rowOptions = (
    perDefinition: FieldDefinition,
    row: ContentRefValue,
    key: string
  ): FieldDefinition => {
    const filter = (perDefinition as EntryValues).options_filter
    if (perDefinition.type !== 'select' || typeof filter !== 'string' || !filter.trim()) {
      return perDefinition
    }
    const held = row?._per?.[key]
    const base = conditionContext(row)
    const options = (perDefinition.options || []).filter((option) => {
      const value = typeof option === 'object' ? option.value : option
      if (held !== undefined && held !== '' && String(value) === String(held)) return true
      return Boolean(evaluate(filter, { ...base, option: value }, true))
    })
    return { ...perDefinition, options }
  }

  const cell: CSSProperties = { padding: '6px 6px', fontSize: 12, verticalAlign: 'middle' }
  const perCells = (row: ContentRefValue, index: number) =>
    perEntries.map(([key, perDefinition]) => {
      const { disabled_if: disabledIf } = perDefinition as EntryValues
      const shown = isShown(row, perDefinition)
      const disabled =
        Boolean(disabledIf) && Boolean(evaluate(disabledIf, conditionContext(row), false))
      return (
        <td key={key} style={{ ...cell, width: perCellWidth(perDefinition) }}>
          {shown ? (
            <FieldRenderer
              name={`${name}.${index}.${key}`}
              definition={rowOptions(perDefinition, row, key)}
              value={row?._per?.[key]}
              onChange={readOnly || disabled ? undefined : (v, meta) => setPer(index, key, v, meta)}
              readOnly={readOnly || disabled}
              hideLabel={columns.length > 0}
              // A per-entry pick - a magic weapon's base - opens the catalog like
              // any other pick, and names what it picked from the same entries.
              entries={entries}
              schemaId={schemaId}
              contentTypes={contentTypes}
            />
          ) : null}
        </td>
      )
    })

  return (
    <div className="gc-content-list">
      {definition.label && !hideLabel ? <div style={fieldLabel}>{definition.label}</div> : null}

      {rows.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '4px 0 8px' }}>
          {t('characters.listEmpty')}
        </p>
      ) : (
        // A table either way: rows separated by rules rather than each drawn as
        // a card, which inside a sheet's own panels became cards within cards.
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          {columns.length ? (
            <thead>
              <tr>
                <th style={{ ...cell, ...headCell }}>
                  {typeDefinition.fields?.name?.label || t('characters.name')}
                </th>
                {columns.map((column) => (
                  <th key={column.key} style={{ ...cell, ...headCell }}>
                    {column.label}
                  </th>
                ))}
                {perEntries.map(([key, perDefinition]) => (
                  <th key={key} style={{ ...cell, ...headCell }}>
                    {perDefinition.label || key}
                  </th>
                ))}
                {readOnly ? null : <th style={{ ...cell, ...headCell, width: 1 }} />}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {rows.map((row, index) => {
              const entry = (row?._ref ? entries[row._ref] : null) as EntryValues | null | undefined
              const missing = !!row?._ref && !entry
              const expanded = open.has(index)
              const detail = entry || (row?._inline ? row : null)
              return (
                <Fragment key={row?._ref || `inline-${index}`}>
                  <tr style={{ borderBottom: expanded ? 'none' : '1px solid var(--border)' }}>
                    <td style={cell}>
                      {row?._inline ? (
                        <button
                          type="button"
                          onClick={() => toggle(index)}
                          aria-expanded={expanded}
                          aria-label={t(
                            expanded ? 'characters.hideEntry' : 'characters.showEntry',
                            {
                              name: row.name || t('characters.customEntry'),
                            }
                          )}
                          style={nameButton}
                        >
                          <span style={{ display: 'block', fontWeight: 600, fontSize: 13 }}>
                            <span
                              aria-hidden="true"
                              style={{ marginRight: 4, color: 'var(--text-muted)' }}
                            >
                              {expanded ? '▾' : '▸'}
                            </span>
                            <span>
                              {titleOf(row, String(row.name || t('characters.customEntry')))}
                            </span>
                          </span>
                          {!columns.length && summaryOf(row, typeDefinition) ? (
                            <span
                              style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}
                            >
                              {summaryOf(row, typeDefinition)}
                            </span>
                          ) : null}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggle(index)}
                          aria-expanded={expanded}
                          aria-label={t(
                            expanded ? 'characters.hideEntry' : 'characters.showEntry',
                            {
                              name: (entry?.name as string | undefined) || row?._ref,
                            }
                          )}
                          style={nameButton}
                        >
                          <span style={{ display: 'block', fontWeight: 600, fontSize: 13 }}>
                            {/* Its own element, so the name stays a clean text on its
                                own - for a screen reader, and for finding it. */}
                            <span
                              aria-hidden="true"
                              style={{ marginRight: 4, color: 'var(--text-muted)' }}
                            >
                              {expanded ? '▾' : '▸'}
                            </span>
                            <span>
                              {titleOf(
                                row,
                                String((entry?.name as string | undefined) || row?._ref)
                              )}
                            </span>
                            {missing ? (
                              <span
                                style={{ color: 'var(--warning)', fontSize: 11, marginLeft: 6 }}
                              >
                                {t('characters.entryMissing')}
                              </span>
                            ) : null}
                          </span>
                          {entry && !columns.length ? (
                            <span
                              style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}
                            >
                              {summaryOf(entry, typeDefinition)}
                            </span>
                          ) : null}
                        </button>
                      )}
                    </td>
                    {columns.map((column) => (
                      <td key={column.key} style={{ ...cell, color: 'var(--text-dim)' }}>
                        {formatCell(detail?.[column.key])}
                      </td>
                    ))}
                    {perCells(row, index)}
                    {readOnly ? null : (
                      <td style={{ ...cell, width: 1 }}>
                        <button
                          type="button"
                          onClick={() => remove(index)}
                          aria-label={t('characters.removeEntry')}
                          title={t('characters.removeEntry')}
                          style={iconBtn}
                        >
                          <LuTrash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                  {expanded && (entry || row?._inline) ? (
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <td colSpan={1 + columns.length + perEntries.length + (readOnly ? 0 : 1)}>
                        {entry ? (
                          // The whole entry - a feat's description, a spell's
                          // text - drawn by the component the browser uses.
                          <>
                            <ContentEntryDetail
                              entry={{ data: entry }}
                              typeDefinition={typeDefinition}
                            />
                            {detailEntries(row).map((chosen) => (
                              <div key={chosen.key} style={{ marginTop: 8 }}>
                                <div style={{ fontWeight: 600, fontSize: 13, padding: '0 8px' }}>
                                  {String(chosen.entry.name ?? '')}
                                </div>
                                <ContentEntryDetail
                                  entry={{ data: chosen.entry }}
                                  typeDefinition={chosen.typeDefinition}
                                />
                              </div>
                            ))}
                          </>
                        ) : (
                          // A freeform entry is the player's to fill in.
                          <div style={inlineEditor}>
                            {Object.entries(inlineFields).map(([key, fieldDefinition]) => (
                              <div
                                key={key}
                                style={
                                  fieldDefinition.type === 'textarea'
                                    ? { gridColumn: '1 / -1' }
                                    : undefined
                                }
                              >
                                <FieldRenderer
                                  name={`${name}.${index}.${key}`}
                                  definition={fieldDefinition}
                                  value={row[key]}
                                  onChange={readOnly ? undefined : (v) => setInline(index, key, v)}
                                  readOnly={readOnly}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )}

      {readOnly ? null : (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            onClick={() => setBrowsing(true)}
            style={{ ...ghostBtn, fontSize: 12, padding: '6px 12px' }}
          >
            <LuSearch size={13} />
            {t('characters.browseCatalog')}
          </button>
          {definition.allow_freeform ? (
            <button
              type="button"
              onClick={addInline}
              style={{ ...ghostBtn, fontSize: 12, padding: '6px 12px' }}
            >
              <LuPencil size={13} />
              {t('characters.addCustom')}
            </button>
          ) : null}
        </div>
      )}

      {browsing ? (
        <ContentBrowser
          schemaId={schemaId!}
          contentType={definition.content_type!}
          typeDefinition={typeDefinition}
          multiple
          chosen={rows}
          fixedFilters={definition.filter}
          onChoose={add}
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
  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
  gap: 10,
}

const headCell: CSSProperties = {
  // A column heading stays on one line - "Prep" wrapped to "PR / EP" in a
  // column sized to its checkbox.
  whiteSpace: 'nowrap',
  textAlign: 'left',
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--text-muted)',
  borderBottom: '1px solid var(--border)',
}

const nameButton: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: 'var(--text)',
  textAlign: 'left',
  cursor: 'pointer',
  font: 'inherit',
  width: '100%',
}

// A field's own `width` in pixels - a select whose options are long names -
// or else: a checkbox takes only its own width; a pick needs room for a name.
function perCellWidth(definition: FieldDefinition): number {
  const width = Number(definition.width)
  if (Number.isFinite(width) && width > 0) return width
  if (definition.type === 'checkbox') return 1
  if (definition.type === 'content_ref') return 160
  return 70
}

/**
 * The starting `_per` values of an entry being added: each per-entry field's
 * `default_from`, worked out with the entry as `row`. A text result names an
 * entry for a per-entry pick, which stores it as a reference; an empty result
 * leaves the field unset.
 */
export function perEntryDefaults(
  perFields: Record<string, FieldDefinition>,
  entry: EntryValues | null | undefined
): EntryValues {
  const starting: EntryValues = {}
  for (const [key, field] of Object.entries(perFields)) {
    const formula = field.default_from
    if (typeof formula !== 'string' || !formula.trim()) continue
    const value = evaluate(formula, { row: entry || {} }, null)
    if (value === null || value === undefined || value === '') continue
    if (field.type === 'content_ref') {
      if (typeof value === 'string' && value.trim()) starting[key] = { _ref: value.trim() }
      continue
    }
    starting[key] = value
  }
  return starting
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (value === true) return '✓'
  if (value === false) return '—'
  return Array.isArray(value) ? value.join(', ') : String(value)
}

// The one-line summary a row shows beneath its name, from the content type's
// own `compact_display` template.
function summaryOf(entry: EntryValues, typeDefinition: ContentTypeDefinition): string {
  const template = typeDefinition.compact_display
  if (!template) return ''
  return template
    .replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, key: string) => {
      const value = entry[key]
      if (value === null || value === undefined || value === false) return ''
      if (value === true) return 'yes'
      return Array.isArray(value) ? value.join(', ') : String(value)
    })
    .trim()
}
