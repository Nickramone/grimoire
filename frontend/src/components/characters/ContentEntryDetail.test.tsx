import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ContentEntryDetail from './ContentEntryDetail'

const typeDefinition = {
  fields: {
    name: { type: 'text', label: 'Name' },
    prerequisite: { type: 'text', label: 'Prerequisite' },
    prereq_level: { type: 'number', label: 'Prerequisite Level' },
    ability_options: { type: 'text', label: 'Ability Options', visible_if: 'false' },
  },
}

describe('ContentEntryDetail', () => {
  it('shows a field that has a value', () => {
    render(
      <ContentEntryDetail
        entry={{ data: { name: 'Alert', prerequisite: 'Level 4+' } }}
        typeDefinition={typeDefinition}
      />
    )
    expect(screen.getByText('Prerequisite')).toBeInTheDocument()
  })

  it('leaves out an empty field instead of showing a dash', () => {
    render(
      <ContentEntryDetail
        entry={{ data: { name: 'Alert', prerequisite: 'Level 4+', prereq_level: '' } }}
        typeDefinition={typeDefinition}
      />
    )
    expect(screen.queryByText('Prerequisite Level')).toBeNull()
  })

  it('leaves out a field the schema marks visible_if "false", even with a value', () => {
    render(
      <ContentEntryDetail
        entry={{ data: { name: 'Alert', ability_options: 'Str' } }}
        typeDefinition={typeDefinition}
      />
    )
    expect(screen.queryByText('Ability Options')).toBeNull()
  })
})
