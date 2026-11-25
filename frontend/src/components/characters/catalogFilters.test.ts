import { describe, expect, it } from 'vitest'
import { catalogFilters } from './catalogFilters'

describe('catalogFilters', () => {
  it('keeps the fixed filter when there is no filter_from', () => {
    expect(catalogFilters({ filter: { category: 'Origin' } }, {})).toEqual({ category: 'Origin' })
    expect(catalogFilters({}, {})).toBeUndefined()
  })

  it('splits a text result on commas, dropping blanks and repeats', () => {
    const filters = catalogFilters(
      { filter_from: { option_type: "concat(a, ',', b, ',', '', ',', a)" } },
      { a: 'Maneuver', b: 'Metamagic' }
    )
    expect(filters).toEqual({ option_type: ['Maneuver', 'Metamagic'] })
  })

  it('adds to the fixed filter', () => {
    expect(
      catalogFilters({ filter: { level: 1 }, filter_from: { school: 's' } }, { s: 'Evocation' })
    ).toEqual({ level: 1, school: ['Evocation'] })
  })

  it('leaves a key unfiltered when its formula works out to nothing or fails', () => {
    expect(catalogFilters({ filter_from: { option_type: 'a' } }, { a: '' })).toBeUndefined()
    expect(catalogFilters({ filter_from: { option_type: 'a.(' } }, {})).toBeUndefined()
  })
})
