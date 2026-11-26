import { GRANTED_KEY, matchesKey, rowSource } from './onPick'

/**
 * What a prompt wrote under a `record` key, so an action can take it all back
 * at once - a level gained, undone.
 *
 * A prompt with `record` (a formula, worked out when it opens: `level:3`)
 * records under that key, in `_records`, what it and the prompts its `apply`
 * opens add: the entries it picks or grants, the values it adds to a
 * multiselect (only those that were new), and the rows its `unpick` takes
 * out. An action's `revert` step then takes every addition back off - a row
 * that was a pick of its own taking its own grants with it, as removing it by
 * hand does - and brings the rows taken out back.
 *
 * What a pick grants stays recorded under the pick, in `_granted`, as ever: a
 * feat picked at a level is recorded there as the feat, and its skills under
 * the feat's row.
 */

type Values = Record<string, unknown>
type Targets = Record<string, string[]>

/** One key's record: what was added, and the rows taken out. */
export type Recorded = { granted?: Targets; dropped?: Record<string, Values[]> }

export const RECORDS_KEY = '_records'
export const PENDING_PROMPTS_KEY = '_pending_prompts'

// How far taking back follows grants of grants - a background's feat, the
// feat's skills. The sheet's own rules never nest this deep; the bound only
// stops a record that points at itself.
const MAX_DEPTH = 8

interface RecordField {
  type?: string
  on_pick?: unknown
}

interface RecordDocument {
  fields?: Record<string, RecordField | undefined> | null
}

function isObject(value: unknown): value is Values {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** The character's records, as stored. */
export function recordsOf(data: Values | null | undefined): Record<string, Recorded> {
  const records = data?.[RECORDS_KEY]
  return isObject(records) ? (records as Record<string, Recorded>) : {}
}

/**
 * The patch that adds `granted` and `dropped` to the record under `key`,
 * after what it already holds - a prompt the first one opened, recording
 * under the same key. Nothing to record is no patch.
 */
export function withRecord(
  data: Values | null | undefined,
  key: string,
  { granted = {}, dropped = {} }: { granted?: Targets; dropped?: Record<string, Values[]> }
): Values {
  const added = Object.entries(granted).filter(([, values]) => values.length)
  const out = Object.entries(dropped).filter(([, rows]) => rows.length)
  if (!key || (!added.length && !out.length)) return {}
  const records = { ...recordsOf(data) }
  const own: Recorded = { ...(records[key] || {}) }
  if (added.length) {
    const next: Targets = { ...(own.granted || {}) }
    for (const [target, values] of added) next[target] = [...(next[target] || []), ...values]
    own.granted = next
  }
  if (out.length) {
    const next: Record<string, Values[]> = { ...(own.dropped || {}) }
    for (const [target, rows] of out) next[target] = [...(next[target] || []), ...rows]
    own.dropped = next
  }
  records[key] = own
  return { [RECORDS_KEY]: records }
}

/**
 * Taking things back, against the data as each write leaves it: one patch,
 * so a grant taken back by one row is not put back by the next.
 */
class Undo {
  readonly patch: Values = {}
  private readonly fields: Record<string, RecordField | undefined>

  constructor(
    document: RecordDocument | null | undefined,
    private readonly data: Values | null | undefined
  ) {
    this.fields = document?.fields || {}
  }

  read(name: string): unknown {
    return name in this.patch ? this.patch[name] : this.data?.[name]
  }

  private list(name: string): unknown[] {
    const value = this.read(name)
    return Array.isArray(value) ? value : []
  }

  /** Take back what the pick recorded under `source` granted. */
  takeBack(source: string, depth: number): void {
    if (depth > MAX_DEPTH) return
    const all = this.read(GRANTED_KEY)
    if (!isObject(all) || !isObject(all[source])) return
    const recorded = all[source] as Targets
    const rest = { ...all }
    delete rest[source]
    this.patch[GRANTED_KEY] = rest
    for (const [target, keys] of Object.entries(recorded)) {
      this.remove(target, Array.isArray(keys) ? keys.map(String) : [], depth)
    }
  }

  /** Take `keys` out of `target`, a removed pick taking its grants along. */
  remove(target: string, keys: string[], depth: number): void {
    const definition = this.fields[target]
    if (!definition || !keys.length) return
    const picks = Array.isArray(definition.on_pick) && definition.on_pick.length > 0

    if (definition.type === 'content_list') {
      const kept: unknown[] = []
      const removed: unknown[] = []
      for (const item of this.list(target)) {
        ;(keys.some((key) => matchesKey(item, key)) ? removed : kept).push(item)
      }
      if (!removed.length) return
      this.patch[target] = kept
      for (const row of removed) {
        const ref = isObject(row) && !row._inline ? row._ref : undefined
        if (typeof ref !== 'string' || !ref) continue
        this.forgetPrompts(target, ref)
        if (picks) this.takeBack(rowSource(target, ref), depth + 1)
      }
      return
    }

    if (definition.type === 'content_ref') {
      const value = this.read(target)
      if (!keys.some((key) => matchesKey(value, key))) return
      this.patch[target] = null
      this.forgetPrompts(target)
      if (picks) this.takeBack(target, depth + 1)
      return
    }

    const values = this.list(target)
    const gone = new Set(keys)
    const kept = values.filter((value) => !gone.has(String(value)))
    if (kept.length !== values.length) this.patch[target] = kept
  }

  /** Put back rows taken out, after any the list holds again. */
  restore(target: string, rows: Values[]): void {
    if (this.fields[target]?.type !== 'content_list') return
    const list = [...this.list(target)]
    const before = list.length
    for (const row of rows) {
      if (!isObject(row)) continue
      const key = row._inline ? String(row.name ?? '') : String(row._ref ?? '')
      if (!key || list.some((item) => matchesKey(item, key))) continue
      list.push(row)
    }
    if (list.length !== before) this.patch[target] = list
  }

  /** The last row of a list, taken off: a content_list row's grants with it. */
  pop(target: string): void {
    const definition = this.fields[target]
    if (definition?.type !== 'list' && definition?.type !== 'content_list') return
    const rows = this.list(target)
    if (!rows.length) return
    const last = rows[rows.length - 1]
    this.patch[target] = rows.slice(0, -1)
    if (definition.type !== 'content_list' || !isObject(last) || last._inline) return
    const ref = last._ref
    if (typeof ref !== 'string' || !ref) return
    this.forgetPrompts(target, ref)
    if (Array.isArray(definition.on_pick) && definition.on_pick.length) {
      this.takeBack(rowSource(target, ref), 1)
    }
  }

  /** The prompts a pick opened and the player put off go with the pick. */
  private forgetPrompts(source: string, ref?: string): void {
    const list = this.read(PENDING_PROMPTS_KEY)
    if (!Array.isArray(list)) return
    const kept = list.filter(
      (item) => !isObject(item) || item.source !== source || (ref !== undefined && item.ref !== ref)
    )
    if (kept.length !== list.length) this.patch[PENDING_PROMPTS_KEY] = kept
  }
}

/**
 * The patch a `revert` makes: everything recorded under `key` taken back
 * off, the rows it took out put back, and the record forgotten. A key with
 * no record - a level gained before the sheet recorded levels - is no patch.
 */
export function planRevert(
  document: RecordDocument | null | undefined,
  data: Values | null | undefined,
  key: string
): Values {
  if (!key) return {}
  // The choices that level put off go with it: there is nothing left to choose.
  const waiting = data?.[PENDING_PROMPTS_KEY]
  const pending: Values = {}
  if (Array.isArray(waiting)) {
    const kept = waiting.filter((item) => !isObject(item) || item.record !== key)
    if (kept.length !== waiting.length) pending[PENDING_PROMPTS_KEY] = kept
  }
  const records = recordsOf(data)
  if (!Object.prototype.hasOwnProperty.call(records, key)) return pending
  const own = records[key]
  const undo = new Undo(document, data)
  Object.assign(undo.patch, pending)
  const rest = { ...records }
  delete rest[key]
  undo.patch[RECORDS_KEY] = rest
  if (isObject(own)) {
    for (const [target, keys] of Object.entries(isObject(own.granted) ? own.granted : {})) {
      undo.remove(target, Array.isArray(keys) ? keys.map(String) : [], 0)
    }
    for (const [target, rows] of Object.entries(isObject(own.dropped) ? own.dropped : {})) {
      if (Array.isArray(rows)) undo.restore(target, rows as Values[])
    }
  }
  return undo.patch
}

/** The patch a `pop` makes: the list's last row taken off. */
export function planPop(
  document: RecordDocument | null | undefined,
  data: Values | null | undefined,
  field: string
): Values {
  const undo = new Undo(document, data)
  undo.pop(field)
  return undo.patch
}
