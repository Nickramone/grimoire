import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuCheck, LuChevronLeft, LuChevronRight } from 'react-icons/lu'
import { goldBtn, ghostBtn, scrim, card, helpText } from './characterStyles'
import {
  isAnswered,
  isComplete,
  laterPrompts,
  loadCatalog,
  numberDefault,
  promptContext,
  shownPages,
  stepLabel,
  visibleSteps,
} from './sheetPrompts'
import type { Answers, EntryAnswer, PromptDocument, PromptStep, SheetPrompt } from './sheetPrompts'
import PromptStepControl from './PromptStepControl'
import type { BrowseEntries } from './promptStepShared'

export type { BrowseEntries } from './promptStepShared'

type Values = Record<string, unknown>

export interface PromptDialogProps {
  prompt: SheetPrompt
  document: PromptDocument | null | undefined
  data: Values | null | undefined
  // The sheet as its formulas read it.
  context: Values
  row?: Values | null
  sourceLabel?: string
  browse?: BrowseEntries
  // Confirmed: the answers, the pages skipped and the prompts they keep for later.
  onConfirm?: (answers: Answers, skipped: string[], later: string[]) => void
  onSkip?: () => void
  // Back from the first page: to the prompt confirmed before this one.
  onBack?: () => void
  // Opened again by Back: the answers given and the pages skipped, on its last page.
  resume?: { answers: Answers; skipped: string[] }
}

/**
 * Asks the questions of one of the sheet's `prompts`: the steps showing for
 * the answers given so far, each with its own control - all on one page, or a
 * page at a time when the prompt is `paged`, with Back and Next. Confirming
 * needs every step showing answered but those on the pages skipped; skipping
 * the whole prompt is always allowed, and the sheet keeps it to open later.
 *
 * Like the `choose` dialog it extends, it knows nothing about what it asks:
 * every question, option and limit comes from the sheet's data.
 */
export default function PromptDialog({
  prompt,
  document,
  data,
  context,
  row,
  sourceLabel,
  browse,
  onConfirm,
  onSkip,
  onBack,
  resume,
}: PromptDialogProps) {
  const { t } = useTranslation()
  // Numbers start from their worked-out default, which counts as an answer.
  const [answers, setAnswers] = useState<Answers>(() => {
    if (resume) return { ...resume.answers }
    const start: Answers = {}
    for (const step of prompt.steps || []) {
      if (step?.type !== 'number') continue
      const value = numberDefault(step, promptContext(context, start, row))
      if (value !== undefined) start[step.key] = value
    }
    return start
  })

  // The catalog each `entry` step chooses from, read once when the dialog
  // opens - every step's, shown yet or not - and filtered again at each answer.
  const catalogs = useRef(new Map<string, Promise<EntryAnswer[]>>())
  const loadEntries = useCallback(
    (step: PromptStep): Promise<EntryAnswer[]> => {
      const contentType = step.content_type || ''
      if (!browse || !contentType) return Promise.resolve([])
      const filters = step.filters || {}
      const key = `${contentType} ${JSON.stringify(filters)}`
      let loading = catalogs.current.get(key)
      if (!loading) {
        loading = loadCatalog((page, size) => browse(contentType, filters, page, size))
        // A failed read is tried again by the next step asking for it.
        loading.catch(() => catalogs.current.delete(key))
        catalogs.current.set(key, loading)
      }
      return loading
    },
    [browse]
  )
  useEffect(() => {
    for (const step of prompt.steps || []) {
      if (step?.type === 'entry' || step?.type === 'entries') loadEntries(step).catch(() => {})
    }
  }, [prompt, loadEntries])

  // How many entries each `entries` step found: it asks for no more.
  const [available, setAvailable] = useState<Record<string, number>>({})
  // The page showing - the last, when Back opens the prompt again - and the
  // pages skipped to choose later.
  const [pageIndex, setPageIndex] = useState(resume ? Number.MAX_SAFE_INTEGER : 0)
  const [skipped, setSkipped] = useState<string[]>(resume?.skipped || [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onSkip?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSkip])

  const steps = visibleSteps(prompt, context, answers, row)
  const pages = shownPages(prompt, steps)
  const current = Math.max(0, Math.min(pageIndex, pages.length - 1))
  const page = pages[current]
  const last = current >= pages.length - 1
  const complete = isComplete(prompt, context, answers, document, data, row, available, skipped)
  const answer = (key: string, value: unknown) =>
    setAnswers((prev) => {
      const next = { ...prev }
      if (value === undefined) delete next[key]
      else next[key] = value
      return next
    })

  // Each step reads the answers of the steps showing before it, on any page.
  const contexts: Record<string, ReturnType<typeof promptContext>> = {}
  const before: Answers = {}
  for (const step of steps) {
    contexts[step.key] = promptContext(context, { ...before }, row)
    before[step.key] = answers[step.key]
  }
  const skippedHere = !!page && skipped.includes(page.id)
  const pageDone =
    !!page &&
    (skippedHere ||
      page.steps.every((step) =>
        isAnswered(step, answers[step.key], contexts[step.key], document, data, available[step.key])
      ))
  const pageInfo = page ? prompt.pages?.[page.id] : undefined
  const canSkipPage = !!pageInfo?.later && !skippedHere
  const paging = !!prompt.paged && pages.length > 1

  const goTo = (index: number) => {
    // A skipped page come back to is asked again.
    const target = pages[index]
    if (target) setSkipped((prev) => prev.filter((id) => id !== target.id))
    setPageIndex(index)
  }
  const skipPage = () => {
    if (!page) return
    for (const step of page.steps) answer(step.key, undefined)
    setSkipped((prev) => (prev.includes(page.id) ? prev : [...prev, page.id]))
    if (!last) setPageIndex(current + 1)
  }
  const confirmAll = () => {
    // Only the pages still showing count as skipped.
    const shown = skipped.filter((id) => pages.some((item) => item.id === id))
    onConfirm?.(answers, shown, laterPrompts(prompt, shown))
  }

  const rendered = (page?.steps || []).map((step) => {
    const stepContext = contexts[step.key]
    const heading = stepLabel(step, stepContext)
    return (
      <section key={step.key} style={{ display: 'grid', gap: 6 }}>
        {heading ? <h3 style={{ margin: 0, fontSize: 14 }}>{heading}</h3> : null}
        <PromptStepControl
          step={step}
          value={answers[step.key]}
          context={stepContext}
          document={document}
          data={data}
          browse={browse}
          loadEntries={loadEntries}
          onAnswer={(value) => answer(step.key, value)}
          onAvailable={(count) =>
            setAvailable((prev) =>
              prev[step.key] === count ? prev : { ...prev, [step.key]: count }
            )
          }
        />
      </section>
    )
  })

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={prompt.label}
      style={{ ...scrim, zIndex: 1200 }}
    >
      <div
        style={{
          ...card,
          background: 'var(--bg-panel)',
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>{prompt.label}</h2>
          {paging ? (
            <p style={helpText}>
              {[
                pageInfo?.label,
                t('characters.promptPageOf', { current: current + 1, total: pages.length }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : null}
          {sourceLabel ? (
            <p style={helpText}>{t('characters.chooseFrom', { source: sourceLabel })}</p>
          ) : null}
        </div>

        <div style={{ display: 'grid', gap: 16, overflowY: 'auto', paddingRight: 2 }}>
          {skippedHere ? <p style={helpText}>{t('characters.promptPageSkipped')}</p> : rendered}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {current > 0 || onBack ? (
            <button
              type="button"
              onClick={() => (current > 0 ? goTo(current - 1) : onBack?.())}
              style={ghostBtn}
            >
              <LuChevronLeft size={14} />
              {t('characters.promptBack')}
            </button>
          ) : null}
          {/* One way to leave a choice for later, beside Back: the page's own
              when it can be skipped, else the whole prompt's. */}
          {canSkipPage ? (
            <button type="button" onClick={skipPage} style={{ ...ghostBtn, marginRight: 'auto' }}>
              {t('characters.promptSkipPage')}
            </button>
          ) : (
            <button type="button" onClick={onSkip} style={{ ...ghostBtn, marginRight: 'auto' }}>
              {t('characters.chooseLater')}
            </button>
          )}
          {last ? (
            <button
              type="button"
              onClick={confirmAll}
              disabled={!complete}
              style={complete ? goldBtn : { ...goldBtn, opacity: 0.55, cursor: 'default' }}
            >
              <LuCheck size={14} />
              {t('characters.promptConfirm')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => goTo(current + 1)}
              disabled={!pageDone}
              style={pageDone ? goldBtn : { ...goldBtn, opacity: 0.55, cursor: 'default' }}
            >
              {t('characters.promptNext')}
              <LuChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
