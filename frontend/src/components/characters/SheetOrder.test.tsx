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

  // jsdom lays nothing out: each block is given a 20px slot, top to bottom.
  const layOut = (container: HTMLElement) => {
    container.querySelectorAll('[data-order-key]').forEach((element, index) => {
      ;(element as HTMLElement).getBoundingClientRect = () =>
        ({ top: index * 20, height: 20, bottom: index * 20 + 20 }) as DOMRect
    })
  }
  const renderOrder = (onChange = vi.fn()) => {
    const result = render(
      <LayoutRenderer
        ast={ast}
        document={DOC}
        data={data}
        computed={{}}
        entries={entries}
        onChange={onChange}
      />
    )
    layOut(result.container)
    return { ...result, onChange }
  }
  const ORDER = [
    'equipment:ref:dagger',
    'equipment:ref:bow',
    'resources:row:Ki',
    'spell',
    'unarmed',
  ]

  it('drags a block below another and stores the order on release', () => {
    const { container, onChange } = renderOrder()
    const handles = screen.getAllByRole('button', { name: 'characters.orderHandle' })
    fireEvent.pointerDown(handles[0], { button: 0, pointerId: 1, clientY: 10 })
    expect(container.querySelector('.gc-order-dragging')).not.toBeNull()
    fireEvent.pointerMove(handles[0], { pointerId: 1, clientY: 55 })
    expect(container.querySelector('.gc-order-drop-before')?.getAttribute('data-order-key')).toBe(
      'spell'
    )
    fireEvent.pointerUp(handles[0], { pointerId: 1, clientY: 55 })
    expect(onChange).toHaveBeenCalledWith(
      'attack_order',
      ['equipment:ref:bow', 'resources:row:Ki', 'equipment:ref:dagger', 'spell', 'unarmed'].join(
        '\n'
      )
    )
    expect(container.querySelector('.gc-order-dragging')).toBeNull()
  })

  it('drops a block last when released below every other', () => {
    const { container, onChange } = renderOrder()
    const handles = screen.getAllByRole('button', { name: 'characters.orderHandle' })
    fireEvent.pointerDown(handles[1], { button: 0, pointerId: 1, clientY: 30 })
    fireEvent.pointerMove(handles[1], { pointerId: 1, clientY: 200 })
    expect(container.querySelector('.gc-order-drop-after')?.getAttribute('data-order-key')).toBe(
      'unarmed'
    )
    fireEvent.pointerUp(handles[1], { pointerId: 1 })
    expect(onChange).toHaveBeenCalledWith(
      'attack_order',
      [ORDER[0], ORDER[2], ORDER[3], ORDER[4], ORDER[1]].join('\n')
    )
  })

  it('stores nothing when a block is dropped where it was, or the drag is cancelled', () => {
    const { container, onChange } = renderOrder()
    const handles = screen.getAllByRole('button', { name: 'characters.orderHandle' })
    fireEvent.pointerDown(handles[2], { button: 0, pointerId: 1, clientY: 50 })
    fireEvent.pointerMove(handles[2], { pointerId: 1, clientY: 52 })
    fireEvent.pointerUp(handles[2], { pointerId: 1 })
    fireEvent.pointerDown(handles[2], { button: 0, pointerId: 2, clientY: 50 })
    fireEvent.pointerMove(handles[2], { pointerId: 2, clientY: 5 })
    fireEvent.pointerCancel(handles[2], { pointerId: 2 })
    expect(container.querySelector('.gc-order-dragging')).toBeNull()
    // A right click starts no drag; moves and releases without one do nothing.
    fireEvent.pointerDown(handles[2], { button: 2, pointerId: 3, clientY: 50 })
    fireEvent.pointerMove(handles[2], { pointerId: 3, clientY: 5 })
    fireEvent.pointerUp(handles[2], { pointerId: 3 })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('moves a block down with the arrow and ignores arrows past either end', () => {
    const { onChange } = renderOrder()
    const handles = screen.getAllByRole('button', { name: 'characters.orderHandle' })
    fireEvent.keyDown(handles[0], { key: 'ArrowUp' })
    fireEvent.keyDown(handles[4], { key: 'ArrowDown' })
    fireEvent.keyDown(handles[0], { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.keyDown(handles[0], { key: 'ArrowDown' })
    expect(onChange).toHaveBeenCalledWith(
      'attack_order',
      [ORDER[1], ORDER[0], ...ORDER.slice(2)].join('\n')
    )
  })

  it('keeps the order but draws no handles when the field is not declared', () => {
    render(
      <LayoutRenderer
        ast={[{ ...ast[0], attrs: { field: 'nowhere' } }]}
        document={DOC}
        data={data}
        computed={{}}
        entries={entries}
        onChange={() => {}}
      />
    )
    expect(screen.queryByRole('button', { name: 'characters.orderHandle' })).not.toBeInTheDocument()
  })

  it('reads a stored order given as a list', () => {
    expect(storedKeys(['b', 'a'])).toEqual(['b', 'a'])
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
