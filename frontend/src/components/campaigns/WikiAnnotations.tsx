import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import {
  LuEye,
  LuEyeOff,
  LuLock,
  LuMessageSquare,
  LuPencil,
  LuShield,
  LuTrash2,
  LuUsers,
} from 'react-icons/lu'
import { campaigns, type ApiError, type Schema } from '../../api'
import { ghostBtn } from './wikiShared'
import WikiAnnotationForm, { type Visibility } from './WikiAnnotationForm'

export type WikiAnnotation = Schema<'WikiAnnotationOut'>

interface WikiAnnotationsProps {
  campaignId: string
  pageId: string
  /** A personal campaign has nobody to share with, so no visibility choice. */
  shared: boolean
}

const heading: CSSProperties = {
  fontSize: 12,
  fontFamily: 'inherit',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
  fontWeight: 600,
  margin: '0 0 8px',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

const card: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '10px 14px',
}

const smallBtn: CSSProperties = { ...ghostBtn, padding: '4px 8px', fontSize: 12 }

function visibilityIcon(v: string) {
  if (v === 'self') return <LuLock size={12} aria-hidden="true" />
  if (v === 'gm') return <LuShield size={12} aria-hidden="true" />
  return <LuUsers size={12} aria-hidden="true" />
}

/**
 * Notes on a wiki page, below its text. Anyone who can read the page may write
 * one, so a player can mark up a page they cannot edit; the page itself is never
 * changed. Each note says who else reads it: the party (the default), the GM, or
 * nobody. The GM may hide a party note from the rest of the party.
 */
export default function WikiAnnotations({ campaignId, pageId, shared }: WikiAnnotationsProps) {
  const { t } = useTranslation()
  const [notes, setNotes] = useState<WikiAnnotation[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [onlyMine, setOnlyMine] = useState(false)

  const load = useCallback(() => {
    setFailed(false)
    campaigns
      .listWikiAnnotations(campaignId, pageId)
      .then(setNotes)
      .catch(() => setFailed(true))
  }, [campaignId, pageId])

  useEffect(() => {
    setNotes(null)
    setEditingId(null)
    load()
  }, [load])

  const replace = (n: WikiAnnotation) =>
    setNotes((prev) => (prev ? prev.map((x) => (x.id === n.id ? n : x)) : prev))

  const create = async (body: string, visibility: Visibility) => {
    try {
      const n = await campaigns.createWikiAnnotation(campaignId, pageId, { body, visibility })
      setNotes((prev) => [...(prev || []), n])
      return true
    } catch (e) {
      alert((e as ApiError).message)
      return false
    }
  }

  const save = async (id: string, body: string, visibility: Visibility) => {
    try {
      replace(await campaigns.updateWikiAnnotation(campaignId, pageId, id, { body, visibility }))
      setEditingId(null)
      return true
    } catch (e) {
      alert((e as ApiError).message)
      return false
    }
  }

  const toggleHidden = async (n: WikiAnnotation) => {
    try {
      replace(
        await campaigns.updateWikiAnnotation(campaignId, pageId, n.id, {
          hidden_by_gm: !n.hidden_by_gm,
        })
      )
    } catch (e) {
      alert((e as ApiError).message)
    }
  }

  const remove = async (n: WikiAnnotation) => {
    if (!confirm(t('wikiNotes.deleteConfirm'))) return
    try {
      await campaigns.deleteWikiAnnotation(campaignId, pageId, n.id)
      setNotes((prev) => (prev ? prev.filter((x) => x.id !== n.id) : prev))
    } catch (e) {
      alert((e as ApiError).message)
    }
  }

  const all = notes || []
  const hasOthers = all.some((n) => !n.is_mine)
  const shown = onlyMine ? all.filter((n) => n.is_mine) : all

  return (
    <section aria-labelledby="wiki-notes-heading" style={{ marginTop: 16 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
      >
        <h3 id="wiki-notes-heading" style={heading}>
          <LuMessageSquare size={13} aria-hidden="true" />{' '}
          {notes ? t('wikiNotes.titleCount', { count: all.length }) : t('wikiNotes.title')}
        </h3>
        {shared && hasOthers && (
          <button
            onClick={() => setOnlyMine((v) => !v)}
            aria-pressed={onlyMine}
            style={{ ...smallBtn, marginBottom: 8 }}
          >
            {onlyMine ? t('wikiNotes.showAll') : t('wikiNotes.showMine')}
          </button>
        )}
      </div>

      {failed && (
        <p role="alert" style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 8px' }}>
          {t('wikiNotes.loadFailed')}{' '}
          <button onClick={load} style={smallBtn}>
            {t('wikiNotes.retry')}
          </button>
        </p>
      )}

      {shown.length > 0 && (
        <ul
          role="list"
          style={{ listStyle: 'none', margin: '0 0 12px', padding: 0, display: 'grid', gap: 8 }}
        >
          {shown.map((n) => (
            <li key={n.id} style={{ ...card, opacity: n.hidden_by_gm ? 0.7 : 1 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  marginBottom: 6,
                }}
              >
                <strong style={{ color: 'var(--text-dim)' }}>
                  {n.is_mine ? t('wikiNotes.you') : n.author_name || t('wikiNotes.unknownAuthor')}
                </strong>
                {n.created_at && <span>{new Date(n.created_at).toLocaleDateString()}</span>}
                {shared && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {visibilityIcon(n.visibility)} {t(`wikiNotes.vis.${n.visibility}`)}
                  </span>
                )}
                {n.hidden_by_gm && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <LuEyeOff size={12} aria-hidden="true" /> {t('wikiNotes.hiddenByGm')}
                  </span>
                )}
                <span style={{ flex: 1 }} />
                {n.can_hide && (
                  <button onClick={() => toggleHidden(n)} style={smallBtn}>
                    {n.hidden_by_gm ? (
                      <>
                        <LuEye size={12} aria-hidden="true" /> {t('wikiNotes.unhide')}
                      </>
                    ) : (
                      <>
                        <LuEyeOff size={12} aria-hidden="true" /> {t('wikiNotes.hide')}
                      </>
                    )}
                  </button>
                )}
                {n.can_edit && editingId !== n.id && (
                  <>
                    <button
                      onClick={() => setEditingId(n.id)}
                      style={smallBtn}
                      aria-label={t('wikiNotes.edit')}
                    >
                      <LuPencil size={12} aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => remove(n)}
                      style={smallBtn}
                      aria-label={t('wikiNotes.delete')}
                    >
                      <LuTrash2 size={12} aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
              {editingId === n.id ? (
                <WikiAnnotationForm
                  initialBody={n.body}
                  initialVisibility={n.visibility}
                  shared={shared}
                  submitLabel={t('common.save')}
                  onSubmit={(body, visibility) => save(n.id, body, visibility)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <p
                  style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                    fontSize: 14,
                  }}
                >
                  {n.body}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {notes && (
        <WikiAnnotationForm shared={shared} submitLabel={t('wikiNotes.add')} onSubmit={create} />
      )}
    </section>
  )
}
