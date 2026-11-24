import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ContentRefField from './ContentRefField'
import ContentListField from './ContentListField'

const mockBrowse = vi.fn()
vi.mock('../../api', () => ({
  content: { browse: (...args: unknown[]) => mockBrowse(...args) },
}))

const TYPE = {
  label: 'Spell',
  compact_display: '{school} {level}',
  fields: { name: { type: 'text' }, level: { type: 'number' }, school: { type: 'text' } },
}

const ENTRIES = {
  fireball: { name: 'Fireball', level: 3, school: 'evocation' },
  shield: { name: 'Shield', level: 1, school: 'abjuration' },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockBrowse.mockResolvedValue({
    entries: [
      {
        entry_id: 'fireball',
        source: 'srd',
        name: 'Fireball',
        data: ENTRIES.fireball,
        display: 'evocation 3',
      },
    ],
    total: 1,
    page: 1,
    page_size: 50,
    filters_available: {},
  })
})

describe('ContentRefField', () => {
  const renderRef = (props = {}) =>
    render(
      <ContentRefField
        name="signature"
        definition={{ type: 'content_ref', label: 'Signature', content_type: 'spell' }}
        entries={ENTRIES}
        schemaId="demo"
        typeDefinition={TYPE}
        {...props}
      />
    )

  it('shows the resolved entry name, not the raw id', () => {
    renderRef({ value: { _ref: 'fireball', _source: 'srd' } })
    expect(screen.getByText('Fireball')).toBeInTheDocument()
  })

  it('shows a dash when nothing is chosen', () => {
    renderRef({ value: null })
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('still shows the id when the entry is not installed', () => {
    // Hiding it would look like data loss; the id is what the player picked.
    renderRef({ value: { _ref: 'not-installed' } })
    expect(screen.getByText('not-installed')).toBeInTheDocument()
    expect(screen.getByText(/not installed/i)).toBeInTheDocument()
  })

  it('stores a reference when one is picked', async () => {
    const onChange = vi.fn()
    renderRef({ value: null, onChange })
    // The box itself opens the picker now, rather than a button beside it.
    await userEvent.click(screen.getByRole('button', { name: /^Choose / }))
    await userEvent.click(await screen.findByLabelText(/Add to sheet/i))
    expect(onChange).toHaveBeenCalledWith(
      { _ref: 'fireball', _source: 'srd' },
      { entry: expect.objectContaining({ name: 'Fireball' }) }
    )
  })

  it('clears a choice', async () => {
    const onChange = vi.fn()
    renderRef({ value: { _ref: 'fireball' }, onChange })
    await userEvent.click(screen.getByLabelText(/Clear/i))
    // Cleared with an explicit empty entry, so the grants of the previous pick
    // are taken back without a lookup.
    expect(onChange).toHaveBeenCalledWith(null, { entry: null })
  })

  it('offers no controls when read-only', () => {
    renderRef({ value: { _ref: 'fireball' }, readOnly: true })
    expect(screen.queryByLabelText(/Browse catalog/i)).not.toBeInTheDocument()
  })

  it('offers a custom entry when freeform is allowed', async () => {
    const onChange = vi.fn()
    renderRef({
      value: null,
      onChange,
      definition: {
        type: 'content_ref',
        label: 'Class',
        content_type: 'spell',
        allow_freeform: true,
      },
    })
    await userEvent.click(screen.getByText(/Add custom/i))
    expect(onChange).toHaveBeenCalledWith({ _inline: true, name: '' }, { entry: null })
  })

  it('hides the custom button when freeform is not allowed', () => {
    renderRef({ value: null })
    expect(screen.queryByText(/Add custom/i)).not.toBeInTheDocument()
  })

  it('edits a freeform entry name', async () => {
    const onChange = vi.fn()
    renderRef({
      value: { _inline: true, name: 'Homebrew' },
      onChange,
      definition: {
        type: 'content_ref',
        label: 'Species',
        content_type: 'spell',
        allow_freeform: true,
      },
    })
    // The field is controlled and nothing feeds `value` back, so type one key.
    await userEvent.type(screen.getByDisplayValue('Homebrew'), '!')
    expect(onChange).toHaveBeenCalledWith({ _inline: true, name: 'Homebrew!' }, { entry: null })
  })

  it("opens a freeform entry to its content type's fields", async () => {
    const onChange = vi.fn()
    renderRef({
      value: { _inline: true, name: 'Homebrew' },
      onChange,
      definition: {
        type: 'content_ref',
        label: 'Class',
        content_type: 'spell',
        allow_freeform: true,
      },
      typeDefinition: {
        ...TYPE,
        fields: { name: { type: 'text' }, school: { type: 'text', label: 'School' } },
      },
    })
    expect(screen.queryByLabelText('School')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show Homebrew' }))
    await userEvent.type(screen.getByLabelText('School'), 'e')
    expect(onChange).toHaveBeenLastCalledWith(
      { _inline: true, name: 'Homebrew', school: 'e' },
      { entry: null }
    )
    await userEvent.click(screen.getByRole('button', { name: 'Hide Homebrew' }))
    expect(screen.queryByLabelText('School')).not.toBeInTheDocument()
  })

  it('clears a freeform entry', async () => {
    const onChange = vi.fn()
    renderRef({
      value: { _inline: true, name: 'Homebrew' },
      onChange,
      definition: {
        type: 'content_ref',
        label: 'Class',
        content_type: 'spell',
        allow_freeform: true,
      },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onChange).toHaveBeenCalledWith(null, { entry: null })
  })

  it('shows a freeform entry read-only without its controls', () => {
    renderRef({ value: { _inline: true, name: 'Homebrew' }, readOnly: true })
    expect(screen.getByText('Homebrew')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Homebrew')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
  })

  it("opens a read-only pick's detail from the box, in a window", async () => {
    renderRef({ value: { _ref: 'fireball' }, readOnly: true })
    await userEvent.click(screen.getByRole('button', { name: 'Show Fireball' }))
    const dialog = screen.getByRole('dialog', { name: 'Fireball' })
    expect(dialog).toHaveTextContent('evocation')
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it("opens a read-only custom entry's own values", async () => {
    renderRef({ value: { _inline: true, name: 'Homebrew', school: 'chaos' }, readOnly: true })
    await userEvent.click(screen.getByRole('button', { name: 'Show Homebrew' }))
    expect(screen.getByRole('dialog', { name: 'Homebrew' })).toHaveTextContent('chaos')
  })

  it('opens nothing for a read-only pick whose entry is not installed', () => {
    renderRef({ value: { _ref: 'gone' }, readOnly: true })
    expect(screen.getByRole('button', { name: 'gone' })).toBeDisabled()
  })

  it('opens the detail from its own button while the box still picks', async () => {
    renderRef({ value: { _ref: 'fireball' } })
    await userEvent.click(screen.getByRole('button', { name: 'Show Fireball' }))
    expect(screen.getByRole('dialog', { name: 'Fireball' })).toHaveTextContent('evocation')
    expect(mockBrowse).not.toHaveBeenCalled()
  })

  it('reads text saved before the field was a pick as a custom entry', async () => {
    const onChange = vi.fn()
    renderRef({
      value: 'Champion',
      onChange,
      definition: {
        type: 'content_ref',
        label: 'Subclass',
        content_type: 'spell',
        allow_freeform: true,
      },
    })
    await userEvent.type(screen.getByDisplayValue('Champion'), '!')
    expect(onChange).toHaveBeenCalledWith({ _inline: true, name: 'Champion!' }, { entry: null })
  })

  it('treats blank text as nothing chosen', () => {
    renderRef({ value: '  ' })
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

describe('ContentListField', () => {
  const DEFINITION = {
    type: 'content_list',
    label: 'Spells',
    content_type: 'spell',
    allow_freeform: true,
    per_entry_fields: { prepared: { type: 'checkbox', label: 'Prep' } },
  }

  const renderList = (props = {}) =>
    render(
      <ContentListField
        name="spells"
        definition={DEFINITION}
        entries={ENTRIES}
        schemaId="demo"
        typeDefinition={TYPE}
        value={[]}
        {...props}
      />
    )

  it('lists referenced entries by their resolved name', () => {
    renderList({ value: [{ _ref: 'fireball' }, { _ref: 'shield' }] })
    expect(screen.getByText('Fireball')).toBeInTheDocument()
    expect(screen.getByText('Shield')).toBeInTheDocument()
  })

  it('shows the compact summary beneath each row', () => {
    renderList({ value: [{ _ref: 'fireball' }] })
    expect(screen.getByText('evocation 3')).toBeInTheDocument()
  })

  it('renders per-entry fields the character owns', async () => {
    const onChange = vi.fn()
    renderList({ value: [{ _ref: 'fireball' }], onChange })
    await userEvent.click(screen.getByLabelText('Prep'))
    expect(onChange).toHaveBeenCalledWith([{ _ref: 'fireball', _per: { prepared: true } }])
  })

  it("offers a per-entry select only the options its row's filter keeps, and the one held", () => {
    const definition = {
      ...DEFINITION,
      per_entry_fields: {
        choice: {
          type: 'select',
          label: 'Choice',
          width: 170,
          options: ['Arid', 'Polar', 'Owl', 'Panther'],
          options_filter: "contains(row.school, option == 'Owl' ? 'evo' : 'none')",
        },
      },
    }
    renderList({ definition, value: [{ _ref: 'fireball', _per: { choice: 'Polar' } }] })
    const select = screen.getByLabelText('Choice') as HTMLSelectElement
    expect([...select.options].map((option) => option.value)).toEqual(['', 'Polar', 'Owl'])
    expect(select.closest('td')).toHaveStyle({ width: '170px' })
  })

  it('adds a reference from the browser', async () => {
    const onChange = vi.fn()
    renderList({ value: [], onChange })
    await userEvent.click(screen.getByText(/Browse catalog/i))
    await userEvent.click(await screen.findByLabelText(/Add to sheet/i))
    expect(onChange).toHaveBeenCalledWith([{ _ref: 'fireball', _source: 'srd' }], expect.anything())
  })

  it('hands over the picked entry, for on_pick rules', async () => {
    const onChange = vi.fn()
    renderList({ value: [], onChange })
    await userEvent.click(screen.getByText(/Browse catalog/i))
    await userEvent.click(await screen.findByLabelText(/Add to sheet/i))
    const meta = onChange.mock.calls[0][1]
    expect(meta.entry).toMatchObject({ name: expect.any(String) })
  })

  it("starts a new row from each per-entry field's default", async () => {
    const onChange = vi.fn()
    renderList({
      value: [],
      onChange,
      definition: {
        ...DEFINITION,
        per_entry_fields: { qty: { type: 'number', label: 'Qty', default: 1 } },
      },
    })
    await userEvent.click(screen.getByText(/Browse catalog/i))
    await userEvent.click(await screen.findByLabelText(/Add to sheet/i))
    expect(onChange).toHaveBeenCalledWith(
      [{ _ref: 'fireball', _source: 'srd', _per: { qty: 1 } }],
      expect.anything()
    )
  })

  it('does not add the same entry twice', async () => {
    const onChange = vi.fn()
    renderList({ value: [{ _ref: 'fireball' }], onChange })
    await userEvent.click(screen.getByText(/Browse catalog/i))
    await userEvent.click((await screen.findAllByLabelText(/Already on the sheet/i))[0])
    expect(onChange).not.toHaveBeenCalled()
  })

  it('adds a freeform entry when the schema allows it', async () => {
    const onChange = vi.fn()
    renderList({ value: [], onChange })
    await userEvent.click(screen.getByText(/Add custom/i))
    expect(onChange).toHaveBeenCalledWith([{ _inline: true, name: '' }])
  })

  it('hides the custom button when freeform is not allowed', () => {
    renderList({ definition: { ...DEFINITION, allow_freeform: false } })
    expect(screen.queryByText(/Add custom/i)).not.toBeInTheDocument()
  })

  it('edits a freeform entry in place', async () => {
    const onChange = vi.fn()
    renderList({ value: [{ _inline: true, name: 'My' }], onChange })
    // It reads like any other row until opened, then edits in place.
    await userEvent.click(screen.getByRole('button', { name: 'Show My' }))
    await userEvent.type(screen.getByDisplayValue('My'), '!')
    expect(onChange).toHaveBeenCalledWith([{ _inline: true, name: 'My!' }])
  })

  it('removes an entry', async () => {
    const onChange = vi.fn()
    renderList({ value: [{ _ref: 'fireball' }, { _ref: 'shield' }], onChange })
    await userEvent.click(screen.getAllByLabelText(/^Remove$/i)[0])
    expect(onChange).toHaveBeenCalledWith([{ _ref: 'shield' }])
  })

  it('flags a reference whose entry is not installed', () => {
    renderList({ value: [{ _ref: 'gone' }] })
    expect(screen.getByText(/not installed/i)).toBeInTheDocument()
  })

  it('shows an empty state', () => {
    renderList({ value: [] })
    expect(screen.getByText(/Nothing here yet/i)).toBeInTheDocument()
  })
})

describe('ContentListField — a pick inside a row', () => {
  // A generic "+1 Weapon": the base weapon is picked on the row, from the
  // weapons only, and an item whose entry names its base starts with it.
  const MAGIC = {
    type: 'content_list',
    label: 'Magic items',
    content_type: 'spell',
    per_entry_fields: {
      base: {
        type: 'content_ref',
        label: 'Base',
        content_type: 'spell',
        filter: { school: ['evocation', 'abjuration'] },
        default_from: 'row.base_id',
      },
    },
  }

  const renderMagic = (props = {}) =>
    render(
      <ContentListField
        name="magic"
        definition={MAGIC}
        entries={ENTRIES}
        schemaId="demo"
        typeDefinition={TYPE}
        contentTypes={{ spell: TYPE }}
        value={[]}
        {...props}
      />
    )

  it('shows the picked base by its resolved name', () => {
    renderMagic({ value: [{ _ref: 'shield', _per: { base: { _ref: 'fireball' } } }] })
    expect(screen.getByRole('button', { name: /Choose Base/ })).toHaveTextContent('Fireball')
  })

  it('opens the catalog on the fixed filter, and hands the picked entry back', async () => {
    const onChange = vi.fn()
    renderMagic({ value: [{ _ref: 'shield' }], onChange })
    await userEvent.click(screen.getByRole('button', { name: /Choose Base/ }))
    await userEvent.click(await screen.findByLabelText(/Add to sheet/i))
    expect(mockBrowse).toHaveBeenCalledWith(
      'demo',
      'spell',
      expect.objectContaining({ filters: { school: ['evocation', 'abjuration'] } })
    )
    expect(onChange).toHaveBeenCalledWith(
      [{ _ref: 'shield', _per: { base: { _ref: 'fireball', _source: 'srd' } } }],
      { picked: { fireball: expect.objectContaining({ name: 'Fireball' }) } }
    )
  })

  it('starts a new row from default_from, read against the added entry', async () => {
    const onChange = vi.fn()
    mockBrowse.mockResolvedValue({
      entries: [
        {
          entry_id: 'shield',
          source: 'srd',
          name: 'Shield',
          data: { ...ENTRIES.shield, base_id: 'fireball' },
        },
      ],
      total: 1,
      page: 1,
      page_size: 50,
      filters_available: {},
    })
    renderMagic({ value: [], onChange })
    await userEvent.click(screen.getByText(/Browse catalog/i))
    await userEvent.click(await screen.findByLabelText(/Add to sheet/i))
    expect(onChange.mock.calls[0][0]).toEqual([
      { _ref: 'shield', _source: 'srd', _per: { base: { _ref: 'fireball' } } },
    ])
  })

  it('leaves the pick empty when the entry names no base', async () => {
    const onChange = vi.fn()
    renderMagic({ value: [], onChange })
    await userEvent.click(screen.getByText(/Browse catalog/i))
    await userEvent.click(await screen.findByLabelText(/Add to sheet/i))
    expect(onChange.mock.calls[0][0]).toEqual([{ _ref: 'fireball', _source: 'srd' }])
  })
})

describe('ContentListField — rows you can open', () => {
  const FEAT_TYPE = {
    identity_field: 'name',
    compact_display: '{category}',
    fields: {
      name: { type: 'text', label: 'Name' },
      category: { type: 'text', label: 'Category' },
      description: { type: 'textarea', label: 'Description' },
    },
  }
  const ENTRIES = {
    alert: {
      name: 'Alert',
      category: 'Origin',
      description: 'Add your proficiency to initiative.',
    },
  }
  const renderList = (props = {}) =>
    render(
      <ContentListField
        name="feats"
        definition={{ label: 'Feats', content_type: 'feat' }}
        value={[{ _ref: 'alert' }]}
        entries={ENTRIES}
        typeDefinition={FEAT_TYPE}
        onChange={vi.fn()}
        {...props}
      />
    )

  it("opens to show the entry's description", async () => {
    // There was no way to read what a feat did once it was on the sheet.
    renderList()
    expect(screen.queryByText('Add your proficiency to initiative.')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show Alert' }))
    expect(screen.getByText('Add your proficiency to initiative.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Hide Alert' }))
    expect(screen.queryByText('Add your proficiency to initiative.')).not.toBeInTheDocument()
  })

  it('hides its own heading when the layout draws one', () => {
    // "Feats" above "FEATS": the panel's title and the field's label both.
    renderList({ hideLabel: true })
    expect(screen.queryByText('Feats')).not.toBeInTheDocument()
  })

  it('draws a table of the properties it is asked for', () => {
    renderList({
      definition: { label: 'Feats', content_type: 'feat', display_columns: ['category'] },
    })
    expect(screen.getByRole('columnheader', { name: 'Category' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Origin' })).toBeInTheDocument()
  })

  it('shows a dash for a column the entry lacks', () => {
    renderList({
      definition: {
        label: 'Feats',
        content_type: 'feat',
        display_columns: [{ key: 'prerequisite', label: 'Prereq' }],
      },
    })
    expect(screen.getByRole('cell', { name: '—' })).toBeInTheDocument()
  })
})

describe('ContentListField — freeform entries read like catalog ones', () => {
  const TRAIT_TYPE = {
    identity_field: 'name',
    compact_display: '{species}',
    fields: {
      name: { type: 'text', label: 'Name' },
      species: { type: 'text', label: 'Species' },
      description: { type: 'textarea', label: 'Description' },
    },
  }
  const renderTraits = (props = {}) =>
    render(
      <ContentListField
        name="species_traits"
        definition={{ label: 'Species Traits', content_type: 'trait', allow_freeform: true }}
        value={[{ _inline: true, name: 'Darkvision', species: 'Dwarf' }]}
        typeDefinition={TRAIT_TYPE}
        onChange={vi.fn()}
        {...props}
      />
    )

  it('shows its name with its source underneath', () => {
    renderTraits()
    expect(screen.getByText('Darkvision')).toBeInTheDocument()
    expect(screen.getByText('Dwarf')).toBeInTheDocument()
  })

  it("opens to the content type's fields, so it can be given a description", async () => {
    const onChange = vi.fn()
    renderTraits({ onChange })
    await userEvent.click(screen.getByRole('button', { name: 'Show Darkvision' }))
    await userEvent.type(screen.getByLabelText('Description'), 'S')
    expect(onChange).toHaveBeenLastCalledWith([
      { _inline: true, name: 'Darkvision', species: 'Dwarf', description: 'S' },
    ])
  })

  it('opens a new custom entry straight away', async () => {
    const onChange = vi.fn()
    const { rerender } = renderTraits({ value: [], onChange })
    await userEvent.click(screen.getByText('Add custom'))
    expect(onChange).toHaveBeenCalledWith([{ _inline: true, name: '' }])
    rerender(
      <ContentListField
        name="species_traits"
        definition={{ label: 'Species Traits', content_type: 'trait', allow_freeform: true }}
        value={[{ _inline: true, name: '' }]}
        typeDefinition={TRAIT_TYPE}
        onChange={onChange}
      />
    )
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })

  it('is read-only on a read-only sheet', async () => {
    renderTraits({ readOnly: true })
    await userEvent.click(screen.getByRole('button', { name: 'Show Darkvision' }))
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})

describe('ContentListField — conditions on per-entry fields', () => {
  const ITEMS = {
    cloak: { name: 'Cloak', attunement: true },
    rope: { name: 'Rope' },
    ring: { name: 'Ring', attunement: true },
  }
  const DEFINITION = {
    label: 'Magic Items',
    content_type: 'magic_item',
    per_entry_fields: {
      attuned: {
        type: 'checkbox',
        label: 'Attuned',
        visible_if: 'row.attunement',
        disabled_if: "not row.attuned && count_refs(magic_items, 'attuned') >= limit",
      },
    },
  }
  const renderItems = (props = {}) =>
    render(
      <ContentListField
        name="magic_items"
        definition={DEFINITION}
        entries={ITEMS}
        value={[{ _ref: 'cloak' }, { _ref: 'rope' }, { _ref: 'ring' }]}
        onChange={vi.fn()}
        context={{ limit: 3 }}
        {...props}
      />
    )

  it('draws the field only where its visible_if holds for the row', () => {
    renderItems()
    // Cloak and Ring need attunement; Rope does not.
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  })

  it('reads the character through context in disabled_if', () => {
    renderItems({
      value: [{ _ref: 'cloak', _per: { attuned: true } }, { _ref: 'ring' }],
      context: { limit: 1 },
    })
    // The ticked one can still be cleared; the other is past the limit and is
    // shown read-only, as a value rather than a box.
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes).toHaveLength(1)
    expect(boxes[0]).toBeChecked()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('drops the column when the field is hidden on every row', () => {
    const withColumns = { ...DEFINITION, display_columns: ['rarity'] }
    const { rerender } = renderItems({ definition: withColumns, value: [{ _ref: 'rope' }] })
    expect(screen.queryByRole('columnheader', { name: 'Attuned' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('cell')).toHaveLength(3) // name, rarity, remove
    rerender(
      <ContentListField
        name="magic_items"
        definition={withColumns}
        entries={ITEMS}
        value={[{ _ref: 'rope' }, { _ref: 'ring' }]}
        onChange={vi.fn()}
        context={{ limit: 3 }}
      />
    )
    expect(screen.getByRole('columnheader', { name: 'Attuned' })).toBeInTheDocument()
  })

  it('leaves the field editable while under the limit', async () => {
    const onChange = vi.fn()
    renderItems({ value: [{ _ref: 'ring' }], onChange })
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenCalledWith([{ _ref: 'ring', _per: { attuned: true } }])
  })
})
