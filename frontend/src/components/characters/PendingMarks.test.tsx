import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ContentListField from './ContentListField'
import ContentRefField from './ContentRefField'
import { PendingChoices } from './sheetPrompts'
import type { PendingChoicesValue, PromptRequest } from './sheetPrompts'

vi.mock('../../api', () => ({ content: { browse: vi.fn() } }))

const FEATS = [{ _ref: 'alert' }, { _ref: 'crafter' }]
const ENTRIES = { alert: { name: 'Alert' }, crafter: { name: 'Crafter' } }

function choices(pending: PromptRequest[]): PendingChoicesValue {
  return {
    pending,
    label: (request) => (request.prompt === 'feat_tools' ? 'Feat choices' : request.prompt),
    reopen: vi.fn(),
  }
}

describe('PendingMarks', () => {
  it('marks the row whose pick put a choice off, and opens it from there', async () => {
    const value = choices([
      { prompt: 'feat_tools', source: 'feats', ref: 'crafter' },
      { prompt: 'background_abilities', source: 'background', ref: 'sage' },
    ])
    render(
      <PendingChoices.Provider value={value}>
        <ContentListField
          name="feats"
          definition={{ type: 'content_list', content_type: 'feat' }}
          value={FEATS}
          entries={ENTRIES}
        />
      </PendingChoices.Provider>
    )
    const marks = screen.getAllByRole('button', { name: /now$/ })
    expect(marks).toHaveLength(1)
    expect(marks[0].closest('tr')?.textContent).toContain('Crafter')
    await userEvent.click(marks[0])
    expect(value.reopen).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'feat_tools', ref: 'crafter' })
    )
  })

  it('marks a pick beside its field even when the field is read-only', () => {
    render(
      <PendingChoices.Provider
        value={choices([{ prompt: 'background_abilities', source: 'background', ref: 'sage' }])}
      >
        <ContentRefField
          name="background"
          definition={{ type: 'content_ref', content_type: 'background' }}
          value={{ _ref: 'sage' }}
          entries={{ sage: { name: 'Sage' } }}
          readOnly
        />
      </PendingChoices.Provider>
    )
    expect(screen.getByRole('button', { name: /background_abilities/ })).toBeInTheDocument()
  })

  it('shows nothing where the sheet cannot be edited', () => {
    render(
      <ContentListField
        name="feats"
        definition={{ type: 'content_list', content_type: 'feat' }}
        value={FEATS}
        entries={ENTRIES}
      />
    )
    expect(screen.queryByRole('button', { name: /now$/ })).not.toBeInTheDocument()
  })
})
