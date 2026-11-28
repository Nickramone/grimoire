import type { Schema } from '../../api'

export type CatalogEntry = Schema<'CatalogEntry'>
export type TypeSummary = Schema<'ContentTypeSummary'>

/** The first image in an entry's description, used as the card's thumbnail. */
export function entryImage(entry: CatalogEntry): string | null {
  const description = entry.data?.description
  if (typeof description !== 'string') return null
  const match = /!\[[^\]]*\]\(([^)\s]+)/.exec(description)
  return match ? match[1] : null
}

export function typeLabel(type: TypeSummary | undefined, plural = false): string {
  if (!type) return ''
  return (plural && type.label_plural) || type.label || type.name
}
