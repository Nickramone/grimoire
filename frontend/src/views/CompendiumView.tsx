import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { LuBookOpenText } from 'react-icons/lu'
import { compendium as compendiumApi } from '../api'
import type { Schema } from '../api'
import Spinner from '../components/Spinner'
import SearchInput from '../components/library/SearchInput'
import LoadMoreSentinel from '../components/LoadMoreSentinel'
import type { ContentTypeDefinition } from '../components/characters/ContentEntryDetail'
import { fieldInput, fieldLabel } from '../components/characters/characterStyles'
import EntryCard from '../components/compendium/EntryCard'
import EntryDialog from '../components/compendium/EntryDialog'
import { typeLabel } from '../components/compendium/compendiumEntry'
import type { CatalogEntry, TypeSummary } from '../components/compendium/compendiumEntry'
import usePageTitle from '../hooks/usePageTitle'

type CompendiumSchema = Schema<'CompendiumSchema'>
type Facets = NonNullable<Schema<'CompendiumResponse'>['filters_available']>

const PAGE_SIZE = 60
const FILTER_PREFIX = 'f.'
const SEARCH_DELAY_MS = 250

const chipStyle = (active: boolean): CSSProperties => ({
  padding: '6px 12px',
  borderRadius: 999,
  border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
  background: active ? 'var(--gold-dim, var(--bg-panel))' : 'var(--bg-panel)',
  color: active ? 'var(--gold)' : 'var(--text)',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 13,
  whiteSpace: 'nowrap',
})

/**
 * The compendium: every rules entry the user can read (spells, items, feats,
 * classes...), searchable across categories, like the other library pages.
 *
 * The list state (edition, category, search, facet filters) lives in the URL
 * so a filtered view can be bookmarked; an open entry is its own route,
 * `/compendium/<type>/<id>`, so a link can point straight at it.
 */
export default function CompendiumView() {
  const { t } = useTranslation()
  usePageTitle(t('compendium.title'))
  const navigate = useNavigate()
  const location = useLocation()
  const { contentType: openType, entryId: openId } = useParams()
  const [params, setParams] = useSearchParams()

  const schemaParam = params.get('schema') || ''
  const typeParam = params.get('type') || ''
  const searchParam = params.get('q') || ''
  const filters = useMemo(() => {
    const out: Record<string, string> = {}
    params.forEach((value, key) => {
      if (key.startsWith(FILTER_PREFIX) && value) out[key.slice(FILTER_PREFIX.length)] = value
    })
    return out
  }, [params])
  const filtersKey = JSON.stringify(filters)

  const [searchText, setSearchText] = useState(searchParam)
  const [schemas, setSchemas] = useState<CompendiumSchema[]>([])
  const [schemaId, setSchemaId] = useState<string | null>(null)
  const [types, setTypes] = useState<TypeSummary[]>([])
  const [facets, setFacets] = useState<Facets>({})
  const [entries, setEntries] = useState<CatalogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestId = useRef(0)

  const update = useCallback(
    (changes: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value)
            else next.delete(key)
          }
          return next
        },
        { replace: true }
      )
    },
    [setParams]
  )

  // The search box updates the URL after a pause, not on every keystroke.
  useEffect(() => {
    if (searchText === searchParam) return
    const timer = setTimeout(() => update({ q: searchText.trim() || null }), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [searchText, searchParam, update])

  const load = useCallback(
    async (pageToLoad: number) => {
      const id = ++requestId.current
      setLoading(true)
      try {
        const result = await compendiumApi.browse({
          schema_id: schemaParam || undefined,
          content_type: typeParam || undefined,
          search: searchParam || undefined,
          page: pageToLoad,
          page_size: PAGE_SIZE,
          filters: JSON.parse(filtersKey) as Record<string, string>,
        })
        if (id !== requestId.current) return
        setSchemas(result.schemas || [])
        setSchemaId(result.schema_id ?? null)
        setTypes(result.content_types || [])
        // Facets describe the whole category; keep them while filters narrow it.
        if (pageToLoad === 1 && filtersKey === '{}') setFacets(result.filters_available || {})
        setEntries((prev) =>
          pageToLoad === 1 ? result.entries || [] : [...prev, ...(result.entries || [])]
        )
        setTotal(result.total || 0)
        setPage(pageToLoad)
        setError('')
      } catch (e) {
        if (id === requestId.current) setError((e as Error).message || t('compendium.loadFailed'))
      } finally {
        if (id === requestId.current) setLoading(false)
      }
    },
    [schemaParam, typeParam, searchParam, filtersKey, t]
  )

  useEffect(() => {
    void load(1)
  }, [load])

  const typeByName = useMemo(() => new Map(types.map((type) => [type.name, type])), [types])
  const activeType = typeParam ? typeByName.get(typeParam) : undefined
  const grandTotal = types.reduce((sum, type) => sum + (type.entry_count || 0), 0)
  const hasMore = entries.length < total

  const chooseType = (name: string | null) => {
    const changes: Record<string, string | null> = { type: name }
    // Facets belong to one category; switching category drops them.
    Object.keys(filters).forEach((field) => (changes[FILTER_PREFIX + field] = null))
    setFacets({})
    update(changes)
  }

  const open = (entry: CatalogEntry) =>
    navigate(
      `/compendium/${encodeURIComponent(entry.content_type)}/${encodeURIComponent(entry.entry_id)}${location.search}`
    )
  const close = () => navigate(`/compendium${location.search}`)

  const subtitle =
    searchParam || typeParam || Object.keys(filters).length
      ? t('compendium.subtitleFiltered', { count: total, total: grandTotal })
      : t('compendium.subtitle', { count: grandTotal })

  return (
    <div
      className="fade-in"
      style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}
    >
      <div
        style={{
          padding: 'clamp(20px, 4vw, 32px) clamp(16px, 4vw, 40px)',
          maxWidth: 1400,
          width: '100%',
          margin: '0 auto',
          boxSizing: 'border-box',
          flex: 1,
        }}
      >
        <div
          style={{
            marginBottom: 24,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div>
            <h1 style={{ fontSize: 28, marginTop: 0, marginBottom: 8 }}>{t('compendium.title')}</h1>
            <p
              aria-live="polite"
              aria-atomic="true"
              style={{
                color: 'var(--text-dim)',
                fontSize: 17,
                fontFamily: 'Alegreya, serif',
                fontStyle: 'italic',
                margin: 0,
              }}
            >
              {subtitle}
            </p>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              minWidth: 0,
              flex: '1 1 280px',
              maxWidth: 420,
            }}
          >
            <SearchInput
              value={searchText}
              onChange={setSearchText}
              placeholder={t('compendium.searchPlaceholder')}
              ariaLabel={t('compendium.searchPlaceholder')}
            />
            {schemas.length > 1 && (
              <select
                aria-label={t('compendium.edition')}
                value={schemaId || ''}
                onChange={(event) => {
                  setFacets({})
                  const changes: Record<string, string | null> = {
                    schema: event.target.value,
                    type: null,
                  }
                  Object.keys(filters).forEach((field) => (changes[FILTER_PREFIX + field] = null))
                  update(changes)
                }}
                style={fieldInput}
              >
                {schemas.map((schema) => (
                  <option key={schema.schema_id} value={schema.schema_id}>
                    {schema.name || schema.schema_id}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {types.length > 0 && (
          <div
            role="group"
            aria-label={t('compendium.categories')}
            style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}
          >
            <button
              type="button"
              aria-pressed={!typeParam}
              onClick={() => chooseType(null)}
              style={chipStyle(!typeParam)}
            >
              {t('compendium.all')} ({grandTotal})
            </button>
            {types.map((type) => (
              <button
                key={type.name}
                type="button"
                aria-pressed={typeParam === type.name}
                onClick={() => chooseType(type.name)}
                style={chipStyle(typeParam === type.name)}
              >
                {typeLabel(type, true)} ({type.entry_count})
              </button>
            ))}
          </div>
        )}

        {activeType && Object.keys(facets).length > 0 && (
          <div
            role="group"
            aria-label={t('compendium.filters')}
            style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}
          >
            {Object.entries(facets).map(([field, options]) => {
              const definition = (activeType.fields as ContentTypeDefinition['fields'])?.[field]
              return (
                <div key={field} style={{ minWidth: 150 }}>
                  <label htmlFor={`compendium-facet-${field}`} style={fieldLabel}>
                    {definition?.label || field}
                  </label>
                  <select
                    id={`compendium-facet-${field}`}
                    value={filters[field] || ''}
                    onChange={(event) =>
                      update({ [FILTER_PREFIX + field]: event.target.value || null })
                    }
                    style={fieldInput}
                  >
                    <option value="">{t('compendium.any')}</option>
                    {options.map((option) => {
                      const value = String(option.value)
                      return (
                        <option key={value} value={value}>
                          {value} ({option.count})
                        </option>
                      )
                    })}
                  </select>
                </div>
              )
            })}
          </div>
        )}

        {error ? (
          <p role="alert" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        ) : entries.length > 0 ? (
          <>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: 12,
              }}
            >
              {entries.map((entry) => (
                <li key={`${entry.content_type}:${entry.source}:${entry.entry_id}`}>
                  <EntryCard
                    entry={entry}
                    type={typeByName.get(entry.content_type)}
                    showType={!typeParam}
                    onOpen={() => open(entry)}
                  />
                </li>
              ))}
            </ul>
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
                <Spinner size={20} />
              </div>
            )}
            <LoadMoreSentinel
              active={hasMore && !loading}
              count={entries.length}
              onVisible={() => void load(page + 1)}
            />
          </>
        ) : loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Spinner size={32} />
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
            <LuBookOpenText size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
            <p>
              {grandTotal === 0 && !searchParam ? t('compendium.empty') : t('compendium.noMatches')}
            </p>
          </div>
        )}
      </div>

      {openType && openId && schemaId && (
        <EntryDialog schemaId={schemaId} contentType={openType} entryId={openId} onClose={close} />
      )}
    </div>
  )
}
