import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PromptDialog from './PromptDialog'
import type { SheetPrompt } from './sheetPrompts'

vi.mock('./useCharacterCampaigns', () => ({
  default: () => [
    { id: 'rime', name: 'Rime of the Frostmaiden' },
    { id: 'oneshot', name: 'One-shot' },
  ],
}))

const PROMPT: SheetPrompt = {
  label: 'Level up',
  steps: [{ key: 'campaign', type: 'campaign', label: 'Campaign' }],
  apply: [],
}

describe('campaign step', () => {
  it('starts on the character campaign and offers none or another', async () => {
    const onConfirm = vi.fn()
    render(
      <PromptDialog
        prompt={PROMPT}
        document={{ fields: {} }}
        data={{}}
        context={{}}
        campaignId="rime"
        onConfirm={onConfirm}
      />
    )
    expect(screen.getByLabelText('Rime of the Frostmaiden')).toBeChecked()
    await userEvent.click(screen.getByLabelText('One-shot'))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onConfirm.mock.calls.at(-1)?.[0]).toEqual({ campaign: 'oneshot' })
  })

  it('takes no campaign as an answer', async () => {
    const onConfirm = vi.fn()
    render(
      <PromptDialog
        prompt={PROMPT}
        document={{ fields: {} }}
        data={{}}
        context={{}}
        onConfirm={onConfirm}
      />
    )
    const none = screen.getAllByRole('radio')[0]
    expect(none).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onConfirm.mock.calls.at(-1)?.[0]).toEqual({ campaign: '' })
  })
})
