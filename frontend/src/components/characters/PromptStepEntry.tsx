import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuChevronDown, LuChevronUp } from 'react-icons/lu'
import Spinner from '../Spinner'
import ContentEntryDetail from './ContentEntryDetail'
import type { ContentTypeDefinition } from './ContentEntryDetail'
import { fieldInput, helpText, iconBtn } from './characterStyles'
import { entryFilter, entryNote, loadCatalog, stepCount } from './sheetPrompts'
import type { EntryAnswer } from './sheetPrompts'
import { optionLabel, optionList } from './promptStepShared'
import type { StepControlProps } from './promptStepShared'

// One catalog entry (`entry`) or `count` of them (`entries`): those the
// step's `filters` and `filter` let through, searched by name. Each opens
// below its name to show what it is, as in the catalog browser - a subclass
// or a spell is chosen by what it does, not by its name.
export default function EntryStep({
  step,
  value,
  context,
  document,
  browse,
  loadEntries,
  onAnswer,
  onAvailable,
}: StepControlProps) {
  const { t } = useTranslation()
  const [catalog, setCatalog] = useState<EntryAnswer[] | null>(null)
  const [failed, setFailed] = useState('')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState('')
  const contentTypes = (document?.content_types || {}) as Record<string, unknown>
  const typeDefinition = (contentTypes[step.content_type || ''] || {}) as ContentTypeDefinition
  const describable = Object.keys(typeDefinition.fields || {}).length > 0
  const multiple = step.type === 'entries'
  const picked: EntryAnswer[] = multiple
    ? Array.isArray(value)
      ? (value as EntryAnswer[])
      : []
    : value && typeof value === 'object'
      ? [value as EntryAnswer]
      : []
  const chosen = new Set(picked.map((entry) => String(entry._ref ?? '')))

  // The catalog is read once per opening; the `filter` is worked out again at
  // each answer - the steps before, and this step's own, so an option whose
  // prerequisite is ticked here shows at once.
  useEffect(() => {
    let cancelled = false
    const contentType = step.content_type
    const loading = loadEntries
      ? loadEntries(step)
      : browse && contentType
        ? loadCatalog((page, size) => browse(contentType, step.filters || {}, page, size))
        : Promise.resolve([])
    loading
      .then((found) => {
        if (!cancelled) setCatalog(found)
      })
      .catch((e: Error) => {
        if (cancelled) return
        setFailed(e.message)
        setCatalog([])
      })
    return () => {
      cancelled = true
    }
  }, [browse, loadEntries, step])

  const passes = useMemo(() => entryFilter(step), [step])
  const entries = useMemo(() => {
    if (catalog === null) return null
    const answers = (context.answer || {}) as Record<string, unknown>
    const own = { ...context, answer: { ...answers, [step.key]: value } }
    return catalog.filter((entry) => passes(entry, own))
  }, [catalog, passes, context, step.key, value])

  useEffect(() => {
    if (entries !== null) onAvailable?.(entries.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries?.length])

  // A choice the filter no longer lets through - its prerequisite unticked, an
  // earlier answer changed - is let go without a word.
  useEffect(() => {
    if (entries === null || !picked.length) return
    const offered = new Set(entries.map((entry) => String(entry._ref ?? '')))
    const kept = picked.filter((entry) => offered.has(String(entry._ref ?? '')))
    if (kept.length === picked.length) return
    onAnswer(multiple ? kept : undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries])

  const wanted = multiple ? Math.min(stepCount(step, context), entries?.length ?? Infinity) : 1
  const remaining = Math.max(0, wanted - picked.length)

  const shown = useMemo(() => {
    const terms = search.trim().toLowerCase()
    const list = entries || []
    return terms
      ? list.filter((entry) =>
          String(entry.name || '')
            .toLowerCase()
            .includes(terms)
        )
      : list
  }, [entries, search])

  const toggle = (entry: EntryAnswer) => {
    if (!multiple) {
      onAnswer(entry)
      return
    }
    if (chosen.has(entry._ref)) onAnswer(picked.filter((item) => item._ref !== entry._ref))
    else if (remaining > 0) onAnswer([...picked, entry])
  }

  if (entries === null) return <Spinner />
  if (failed) return <p style={{ ...helpText, color: 'var(--danger, #c33)' }}>{failed}</p>
  if (!entries.length) return <p style={helpText}>{t('characters.promptNoEntries')}</p>
  return (
    <>
      {multiple ? (
        <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--text-dim)' }}>
          {t('characters.chooseRemaining', { count: remaining })}
        </p>
      ) : null}
      {entries.length > 8 ? (
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('characters.promptSearch')}
          aria-label={t('characters.promptSearch')}
          style={fieldInput}
        />
      ) : null}
      <ul style={{ ...optionList, maxHeight: 360, overflowY: 'auto' }}>
        {shown.map((entry) => {
          const key = `${entry._source || ''}:${entry._ref}`
          const name = entry.name || entry._ref
          const note = entryNote(step, entry, context)
          const expanded = open === key
          const selected = chosen.has(entry._ref)
          const full = multiple && !selected && remaining === 0
          return (
            <li key={key}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <label style={{ ...optionLabel(full), flex: 1, minWidth: 0 }}>
                  <input
                    type={multiple ? 'checkbox' : 'radio'}
                    name={`prompt-${step.key}`}
                    checked={selected}
                    disabled={full}
                    onChange={() => toggle(entry)}
                  />
                  {name}
                  {note ? (
                    <span
                      style={{
                        color: 'var(--text-muted)',
                        fontSize: 12,
                        marginLeft: 6,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {note}
                    </span>
                  ) : null}
                </label>
                {describable ? (
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? '' : key)}
                    aria-expanded={expanded}
                    aria-label={t(
                      expanded ? 'characters.promptHideDetails' : 'characters.promptShowDetails',
                      { name }
                    )}
                    title={t(
                      expanded ? 'characters.promptHideDetails' : 'characters.promptShowDetails',
                      { name }
                    )}
                    style={iconBtn}
                  >
                    {expanded ? <LuChevronUp size={14} /> : <LuChevronDown size={14} />}
                  </button>
                ) : null}
              </div>
              {expanded ? (
                <ContentEntryDetail entry={{ data: entry }} typeDefinition={typeDefinition} />
              ) : null}
            </li>
          )
        })}
      </ul>
    </>
  )
}
