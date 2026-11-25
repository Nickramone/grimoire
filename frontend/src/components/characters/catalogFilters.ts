import { evaluate } from './expressions'

const FAILED = Symbol('failed')

/**
 * The browser's fixed filters for a catalog field: its `filter`, and each
 * `filter_from` formula worked out against the character. A formula's result
 * is a value, a list, or text naming several values separated by commas
 * (`concat(ref(klass, 'option_type'), ',', ref(subclass, 'option_type'))`);
 * one that works out to nothing, or fails, leaves its key unfiltered.
 */
export function catalogFilters(
  definition: { filter?: Record<string, unknown>; filter_from?: unknown },
  context?: Record<string, unknown>
): Record<string, unknown> | undefined {
  const fixed = definition.filter
  const from = definition.filter_from
  if (!from || typeof from !== 'object' || Array.isArray(from)) return fixed
  const result: Record<string, unknown> = { ...(fixed || {}) }
  for (const [key, formula] of Object.entries(from as Record<string, unknown>)) {
    const value = evaluate<symbol>(formula, (context || {}) as never, FAILED)
    if (value === FAILED) continue
    const values = (Array.isArray(value) ? value : String(value ?? '').split(','))
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)
    if (values.length) result[key] = [...new Set(values)]
  }
  return Object.keys(result).length ? result : undefined
}
