import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Pips from './Pips'

const boxes = () => screen.getAllByRole('checkbox') as HTMLInputElement[]

describe('Pips', () => {
  it('draws one box per count, the used ones ticked', () => {
    render(<Pips count={4} used={2} label="Slot" />)
    expect(boxes().map((box) => box.checked)).toEqual([true, true, false, false])
    expect(screen.getByLabelText('Slot 3')).toBeInTheDocument()
  })

  it('ticking an empty box ticks everything up to it', async () => {
    const onChange = vi.fn()
    render(<Pips count={4} used={1} label="Slot" onChange={onChange} />)
    await userEvent.click(boxes()[2])
    expect(onChange).toHaveBeenCalledWith(3)
  })

  it('unticking a ticked box clears it and everything after', async () => {
    const onChange = vi.fn()
    render(<Pips count={4} used={3} label="Slot" onChange={onChange} />)
    await userEvent.click(boxes()[1])
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('never ticks more boxes than it draws', () => {
    render(<Pips count={2} used={5} label="Slot" />)
    expect(boxes().map((box) => box.checked)).toEqual([true, true])
  })

  it('draws a dash for a count of nothing', () => {
    render(<Pips count={0} used={0} label="Slot" />)
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('cannot be ticked when disabled', () => {
    render(<Pips count={2} used={0} label="Slot" disabled />)
    expect(boxes().every((box) => box.disabled)).toBe(true)
  })
})
