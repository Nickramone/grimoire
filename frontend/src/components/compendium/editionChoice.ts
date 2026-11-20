/**
 * The edition last chosen in the compendium or in the global search's system
 * filter, kept in this browser so both pages open on it.
 *
 * A library system names its compendium schema (`compendium_schema_id`), so one
 * choice can be read either way: the search filters by `systemId`, the
 * compendium opens `schemaId`. Storage can be missing or blocked (private
 * window), in which case nothing is remembered and both pages start unfiltered.
 */

const KEY = 'grimoire.compendium.edition'

export interface EditionChoice {
  /** The library system chosen in the search filter; "" for all systems. */
  systemId?: string
  /** The compendium schema last opened. */
  schemaId?: string
}

export function readEdition(): EditionChoice {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) || '{}')
    if (!parsed || typeof parsed !== 'object') return {}
    const { systemId, schemaId } = parsed as Record<string, unknown>
    return {
      ...(typeof systemId === 'string' ? { systemId } : {}),
      ...(typeof schemaId === 'string' ? { schemaId } : {}),
    }
  } catch {
    return {}
  }
}

export function saveEdition(changes: EditionChoice): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readEdition(), ...changes }))
  } catch {
    // Storage blocked: the choice simply is not remembered.
  }
}
