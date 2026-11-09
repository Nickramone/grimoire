import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import CompendiumView from './CompendiumView'

const mockBrowse = vi.fn()
const mockEntry = vi.fn()

vi.mock('../api', () => ({
  compendium: {
    browse: (...a: unknown[]) => mockBrowse(...a),
    entry: (...a: unknown[]) => mockEntry(...a),
  },
}))

const SPELL_TYPE = {
  name: 'spell',
  label: 'Spell',
  label_plural: 'Spells',
  entry_count: 2,
  filter_fields: ['level'],
  fields: {
    name: { type: 'text', label: 'Name' },
    level: { type: 'number', label: 'Level' },
    description: { type: 'textarea', label: 'Description' },
  },
}
const ITEM_TYPE = {
  name: 'magic_item',
  label: 'Magic Item',
  label_plural: 'Magic Items',
  entry_count: 1,
  fields: { name: { type: 'text', label: 'Name' } },
}
const FIREBALL = {
  entry_id: 'fireball-xphb',
  source: 'ruleset',
  name: 'Fireball',
  content_type: 'spell',
  data: { level: 3, description: 'A bright streak.' },
  display: 'Level 3 Evocation',
  ruleset_name: '5etools 2024',
}
const FLAME_TONGUE = {
  entry_id: 'flame-tongue-xdmg',
  source: 'ruleset',
  name: 'Flame Tongue',
  content_type: 'magic_item',
  data: { description: '![Flame Tongue](/api/content/assets/items/flame.webp)\n\nFire.' },
  display: '',
}

function response(overrides: Record<string, unknown> = {}) {
  return {
    schemas: [{ schema_id: 'dnd-5e-2024', name: 'D&D 5e (2024)', entry_count: 3 }],
    schema_id: 'dnd-5e-2024',
    content_types: [ITEM_TYPE, SPELL_TYPE],
    entries: [FIREBALL, FLAME_TONGUE],
    total: 2,
    page: 1,
    page_size: 60,
    filters_available: {},
    ...overrides,
  }
}

function Location() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

const renderAt = (path = '/compendium') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/compendium" element={<CompendiumView />} />
        <Route path="/compendium/:contentType/:entryId" element={<CompendiumView />} />
      </Routes>
      <Location />
    </MemoryRouter>
  )

beforeEach(() => {
  vi.clearAllMocks()
  mockBrowse.mockResolvedValue(response())
})

describe('CompendiumView', () => {
  it('lists entries across categories with a chip per category', async () => {
    renderAt()
    expect(await screen.findByText('Fireball')).toBeInTheDocument()
    expect(screen.getByText('Flame Tongue')).toBeInTheDocument()
    const chips = within(screen.getByRole('group', { name: 'Categories' }))
    expect(chips.getByRole('button', { name: 'All (3)' })).toHaveAttribute('aria-pressed', 'true')
    expect(chips.getByRole('button', { name: 'Spells (2)' })).toBeInTheDocument()
    // Across categories, each card says which category it is.
    expect(screen.getByText('Spell · Level 3 Evocation')).toBeInTheDocument()
  })

  it('uses the first image of a description as the thumbnail', async () => {
    const { container } = renderAt()
    await screen.findByText('Flame Tongue')
    const images = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'))
    expect(images).toEqual(['/api/content/assets/items/flame.webp'])
  })

  it('narrows to a category and shows its filters', async () => {
    const user = userEvent.setup()
    renderAt()
    await screen.findByText('Fireball')
    mockBrowse.mockResolvedValue(
      response({
        entries: [FIREBALL],
        total: 1,
        filters_available: { level: [{ value: '3', count: 1 }] },
      })
    )
    await user.click(screen.getByRole('button', { name: 'Spells (2)' }))
    await waitFor(() =>
      expect(mockBrowse).toHaveBeenLastCalledWith(
        expect.objectContaining({ content_type: 'spell', page: 1 })
      )
    )
    expect(screen.getByTestId('location')).toHaveTextContent('/compendium?type=spell')
    const level = await screen.findByLabelText('Level')
    await user.selectOptions(level, '3')
    await waitFor(() =>
      expect(mockBrowse).toHaveBeenLastCalledWith(
        expect.objectContaining({ content_type: 'spell', filters: { level: '3' } })
      )
    )
  })

  it('searches after a pause', async () => {
    const user = userEvent.setup()
    renderAt()
    await screen.findByText('Fireball')
    await user.type(screen.getByLabelText('Search spells, items, feats…'), 'fire')
    await waitFor(() =>
      expect(mockBrowse).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'fire' }))
    )
    expect(screen.getByTestId('location')).toHaveTextContent('/compendium?q=fire')
  })

  it('opens an entry on its own URL and closes back to the list', async () => {
    const user = userEvent.setup()
    mockEntry.mockResolvedValue({ entry: FIREBALL, content_type: SPELL_TYPE })
    renderAt('/compendium?type=spell')
    await user.click(await screen.findByText('Fireball'))
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/compendium/spell/fireball-xphb?type=spell'
    )
    const dialog = await screen.findByRole('dialog', { name: 'Fireball' })
    expect(mockEntry).toHaveBeenCalledWith('dnd-5e-2024', 'spell', 'fireball-xphb')
    expect(await within(dialog).findByText('A bright streak.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/compendium?type=spell')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('offers an edition picker only when there is more than one', async () => {
    renderAt()
    await screen.findByText('Fireball')
    expect(screen.queryByLabelText('Edition')).not.toBeInTheDocument()
  })

  it('says when the compendium is empty', async () => {
    mockBrowse.mockResolvedValue(
      response({ schemas: [], schema_id: null, content_types: [], entries: [], total: 0 })
    )
    renderAt()
    expect(
      await screen.findByText('The compendium is empty: import a ruleset to fill it.')
    ).toBeInTheDocument()
  })
})
