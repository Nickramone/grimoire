import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LayoutRenderer from './LayoutRenderer'
import type { LayoutNode } from './LayoutRenderer'
import { movedKeys, orderedItems, storedKeys } from './SheetOrder'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('SheetOrder helpers', () => {
  const items = ['a', 'b', 'c'].map((key) => ({ key, content: key }))

  it('reads the stored order one key per line', () => {
    expect(storedKeys('a\n b \n\nc')).toEqual(['a', 'b', 'c'])
    expect(storedKeys(undefined)).toEqual([])
  })

  it('puts new keys first, then the stored ones in their order', () => {
    expect(orderedItems(items, 'c\na').map((item) => item.key)).toEqual(['b', 'c', 'a'])
    expect(orderedItems(items, '').map((item) => item.key)).toEqual(['a', 'b', 'c'])
    expect(orderedItems(items, 'gone\nb').map((item) => item.key)).toEqual(['a', 'c', 'b'])
  })

  it('moves a key before the target', () => {
    expect(movedKeys(['a', 'b', 'c'], 0, 3)).toEqual(['b', 'c', 'a'])
    expect(movedKeys(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(movedKeys(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'a', 'c'])
  })
})

describe('LayoutRenderer — <g-order>', () => {
  const DOC = {
    fields: {
      attack_order: { type: 'text', label: 'Order' },
      is_caster: { type: 'checkbox', label: 'Caster' },
      equipment: {
        type: 'content_list',
        content_type: 'item',
        per_entry_fields: { equipped: { type: 'checkbox', label: 'Eq.' } },
      },
      resources: {
        type: 'list',
        columns: [{ key: 'resource', type: 'text', label: 'Resource' }],
      },
    },
    computed: {},
  }
  const entries = {
    dagger: { name: 'Dagger' },
    bow: { name: 'Longbow' },
  }
  const data = {
    is_caster: true,
    equipment: [
      { _ref: 'dagger', _per: { equipped: true } },
      { _ref: 'bow', _per: { equipped: true } },
      { _ref: 'dagger', _per: { equipped: false } },
    ],
    resources: [{ resource: 'Ki' }],
  }
  const value = (formula: string): LayoutNode => ({
    tag: 'g-value',
    attrs: { formula },
    children: [],
  })
  const ast: LayoutNode[] = [
    {
      tag: 'g-order',
      attrs: { field: 'attack_order' },
      children: [
        {
          tag: 'g-repeat',
          attrs: { over: 'equipment', where: 'row.equipped' },
          children: [{ tag: 'div', attrs: { class: 'atk' }, children: [value('row.name')] }],
        },
        { tag: 'g-repeat', attrs: { over: 'resources' }, children: [value('row.resource')] },
        { text: '\n  ' },
        {
          tag: 'g-if',
          attrs: { test: 'is_caster' },
          children: [
            { tag: 'g-order-item', attrs: { key: 'spell' }, children: [{ text: 'Spell' }] },
          ],
        },
        { tag: 'g-order-item', attrs: { key: 'unarmed' }, children: [{ text: 'Unarmed' }] },
      ],
    },
  ]
  const keysShown = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('[data-order-key]')).map((element) =>
      element.getAttribute('data-order-key')
    )

  it('draws a block per drawn row and per fixed item, new ones first', () => {
    const { container } = render(
      <LayoutRenderer
        ast={ast}
        document={DOC}
        data={{ ...data, attack_order: 'resources:row:Ki\nspell\nequipment:ref:dagger' }}
        computed={{}}
        entries={entries}
        onChange={() => {}}
      />
    )
    expect(keysShown(container)).toEqual([
      'equipment:ref:bow',
      'unarmed',
      'resources:row:Ki',
      'spell',
      'equipment:ref:dagger',
    ])
    expect(screen.getAllByRole('button', { name: 'characters.orderHandle' })).toHaveLength(5)
  })

  it('keys a second row of the same entry apart', () => {
    const { container } = render(
      <LayoutRenderer
        ast={ast}
        document={DOC}
        data={{
          ...data,
          equipment: data.equipment.map((item) => ({ ...item, _per: { equipped: true } })),
        }}
        computed={{}}
        entries={entries}
        onChange={() => {}}
      />
    )
    expect(keysShown(container).slice(0, 3)).toEqual([
      'equipment:ref:dagger',
      'equipment:ref:bow',
      'equipment:ref:dagger#2',
    ])
  })

  it('stores the new order when a handle moves a block with the arrows', () => {
    const onChange = vi.fn()
    render(
      <LayoutRenderer
        ast={ast}
        document={DOC}
        data={data}
        computed={{}}
        entries={entries}
        onChange={onChange}
      />
    )
    const handles = screen.getAllByRole('button', { name: 'characters.orderHandle' })
    fireEvent.keyDown(handles[1], { key: 'ArrowUp' })
    expect(onChange).toHaveBeenCalledWith(
      'attack_order',
      ['equipment:ref:bow', 'equipment:ref:dagger', 'resources:row:Ki', 'spell', 'unarmed'].join(
        '\n'
      )
    )
  })

  it('draws no handles on a read-only sheet', () => {
    const { container } = render(
      <LayoutRenderer
        ast={ast}
        document={DOC}
        data={data}
        computed={{}}
        entries={entries}
        readOnly
      />
    )
    expect(screen.queryByRole('button', { name: 'characters.orderHandle' })).not.toBeInTheDocument()
    expect(container.textContent).toBe('DaggerLongbowKiSpellUnarmed')
  })

  it('is only its contents outside a g-order', () => {
    render(
      <LayoutRenderer
        ast={[{ tag: 'g-order-item', attrs: { key: 'x' }, children: [{ text: 'Alone' }] }]}
        document={DOC}
        data={data}
        computed={{}}
      />
    )
    expect(screen.getByText('Alone')).toBeInTheDocument()
  })
})
