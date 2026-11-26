import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CampaignHouseRules from './CampaignHouseRules'

const mockGet = vi.fn()
const mockSet = vi.fn()

vi.mock('../../api', () => ({
  campaigns: {
    houseRules: (...args: unknown[]) => mockGet(...args),
    setHouseRules: (...args: unknown[]) => mockSet(...args),
  },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key.split('.').pop() }),
}))

beforeEach(() => {
  mockGet.mockReset()
  mockSet.mockReset()
})

describe('CampaignHouseRules', () => {
  it('shows a player whether the table plays them', async () => {
    mockGet.mockResolvedValue({ on: true, editable: false })
    render(<CampaignHouseRules campaignId="c1" />)
    expect(await screen.findByText('houseRulesOn')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('lets the GM switch them', async () => {
    mockGet.mockResolvedValue({ on: false, editable: true })
    mockSet.mockResolvedValue({ on: true, editable: true })
    render(<CampaignHouseRules campaignId="c1" />)
    await userEvent.click(await screen.findByRole('checkbox'))
    expect(mockSet).toHaveBeenCalledWith('c1', true)
    expect(await screen.findByText('houseRulesOn')).toBeInTheDocument()
  })

  it('draws nothing when the switch cannot be read', async () => {
    mockGet.mockRejectedValue(new Error('no'))
    const { container } = render(<CampaignHouseRules campaignId="c1" />)
    await Promise.resolve()
    expect(container).toBeEmptyDOMElement()
  })
})
