import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PromptDialog from './PromptDialog'
import type { SheetPrompt } from './sheetPrompts'

const COSTS = { '8': 0, '9': 1, '10': 2, '11': 3, '12': 4, '13': 5, '14': 7, '15': 9 }

const pointBuy = (budget: number): SheetPrompt => ({
  label: 'Ability scores',
  steps: [
    {
      key: 'scores',
      type: 'scores',
      label: 'Point Cost',
      min: 8,
      max: 15,
      costs: COSTS,
      budget,
      abilities: [
        { key: 'str', label: 'Strength', start: '8', bonus: 'bg_str' },
        { key: 'dex', label: 'Dexterity', start: '8' },
      ],
    },
  ],
  apply: [],
})

describe('scores step', () => {
  it('spends points within the budget, showing the bonus and the total', async () => {
    const onConfirm = vi.fn()
    render(
      <PromptDialog
        prompt={pointBuy(9)}
        document={{ fields: {} }}
        data={{}}
        context={{ bg_str: 2 }}
        onConfirm={onConfirm}
      />
    )
    expect(screen.getByText('Points left: 9 of 9')).toBeInTheDocument()
    const up = screen.getByRole('button', { name: 'Raise Strength' })
    for (let i = 0; i < 6; i += 1) await userEvent.click(up)
    // 14 costs 7: two points left, and 15 would cost two more - just enough.
    expect(screen.getByTestId('score-str')).toHaveTextContent('14')
    expect(screen.getByText('Points left: 2 of 9')).toBeInTheDocument()
    expect(screen.getByText('16')).toBeInTheDocument()
    await userEvent.click(up)
    expect(screen.getByText('Points left: 0 of 9')).toBeInTheDocument()
    expect(up).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Raise Dexterity' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onConfirm.mock.calls.at(-1)?.[0]).toEqual({ scores: { str: 15, dex: 8 } })
  })

  it('moves freely within its bounds without a budget, from each start', async () => {
    const prompt: SheetPrompt = {
      label: 'Ability scores',
      steps: [
        {
          key: 'scores',
          type: 'scores',
          min: 1,
          max: 30,
          abilities: [{ key: 'str', label: 'Strength', start: 'strength' }],
        },
      ],
      apply: [],
    }
    render(
      <PromptDialog
        prompt={prompt}
        document={{ fields: {} }}
        data={{}}
        context={{ strength: 17 }}
      />
    )
    expect(screen.queryByText(/Points left/)).not.toBeInTheDocument()
    expect(screen.getByTestId('score-str')).toHaveTextContent('17')
    await userEvent.click(screen.getByRole('button', { name: 'Lower Strength' }))
    expect(screen.getByTestId('score-str')).toHaveTextContent('16')
  })
})
