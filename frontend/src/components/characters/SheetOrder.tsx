import { Fragment, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * The rows of a `<g-order>` in the order the player dragged them into.
 *
 * Each item is a block the layout drew - every line one row of a list made (a
 * weapon with its two-handed and thrown lines), or a fixed `<g-order-item>` -
 * under a stable key. The order is stored as those keys, one per line, in a
 * text field of the character. A key the stored order does not hold is new and
 * goes first, in the layout's own order; a stored key nothing draws any more is
 * dropped on the next move. Dragging the handle (mouse, pen or touch) moves the
 * block; with the handle focused, the up and down arrows move it one place.
 */
export interface OrderItem {
  key: string
  content: ReactNode
}

export interface SheetOrderProps {
  items: OrderItem[]
  stored: unknown
  readOnly?: boolean
  onReorder?: (keys: string[]) => void
}

export function storedKeys(stored: unknown): string[] {
  if (Array.isArray(stored)) return stored.map(String)
  if (typeof stored !== 'string') return []
  return stored
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

// New items first, in the layout's order; then the known ones as stored.
export function orderedItems(items: OrderItem[], stored: unknown): OrderItem[] {
  const position = new Map<string, number>()
  storedKeys(stored).forEach((key, index) => {
    if (!position.has(key)) position.set(key, index)
  })
  const fresh = items.filter((item) => !position.has(item.key))
  const known = items
    .filter((item) => position.has(item.key))
    .sort((a, b) => (position.get(a.key) as number) - (position.get(b.key) as number))
  return [...fresh, ...known]
}

// The keys once the item at `from` is dropped before the item at `target`
// (`target` equal to the length drops it last).
export function movedKeys(keys: string[], from: number, target: number): string[] {
  const next = [...keys]
  const [moved] = next.splice(from, 1)
  next.splice(target > from ? target - 1 : target, 0, moved)
  return next
}

const handleStyle = {
  flex: '0 0 auto',
  cursor: 'grab',
  touchAction: 'none' as const,
  userSelect: 'none' as const,
  color: 'var(--text-muted)',
  padding: '0 2px',
  lineHeight: 1,
  letterSpacing: '-0.2em',
}

export default function SheetOrder({ items, stored, readOnly, onReorder }: SheetOrderProps) {
  const { t } = useTranslation()
  const ordered = orderedItems(items, stored)
  const keys = ordered.map((item) => item.key)
  const elements = useRef<Array<HTMLDivElement | null>>([])
  const [drag, setDrag] = useState<{ from: number; target: number } | null>(null)

  if (readOnly || !onReorder) {
    return (
      <>
        {ordered.map((item) => (
          <Fragment key={item.key}>{item.content}</Fragment>
        ))}
      </>
    )
  }

  // Where a pointer at `y` would drop: before the first item whose middle is
  // below it, or last.
  const targetAt = (y: number) => {
    let target = 0
    elements.current.slice(0, ordered.length).forEach((element) => {
      if (!element) return
      const rect = element.getBoundingClientRect()
      if (y > rect.top + rect.height / 2) target += 1
    })
    return target
  }

  const commit = (from: number, target: number) => {
    if (target === from || target === from + 1) return
    onReorder(movedKeys(keys, from, target))
  }

  const onPointerDown = (index: number) => (event: PointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setDrag({ from: index, target: index })
  }
  const onPointerMove = (event: PointerEvent<HTMLSpanElement>) => {
    if (!drag) return
    const target = targetAt(event.clientY)
    if (target !== drag.target) setDrag({ ...drag, target })
  }
  const onPointerUp = (event: PointerEvent<HTMLSpanElement>) => {
    if (!drag) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    commit(drag.from, drag.target)
    setDrag(null)
  }
  const onKeyDown = (index: number) => (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === 'ArrowUp' && index > 0) {
      event.preventDefault()
      commit(index, index - 1)
    } else if (event.key === 'ArrowDown' && index < ordered.length - 1) {
      event.preventDefault()
      commit(index, index + 2)
    }
  }

  return (
    <>
      {ordered.map((item, index) => {
        const dropBefore =
          drag !== null &&
          drag.target === index &&
          drag.target !== drag.from &&
          drag.target !== drag.from + 1
        const dropAfter =
          drag !== null &&
          index === ordered.length - 1 &&
          drag.target === ordered.length &&
          drag.from !== index
        const classes = ['gc-order-item']
        if (drag?.from === index) classes.push('gc-order-dragging')
        if (dropBefore) classes.push('gc-order-drop-before')
        if (dropAfter) classes.push('gc-order-drop-after')
        return (
          <div
            key={item.key}
            ref={(element) => {
              elements.current[index] = element
            }}
            className={classes.join(' ')}
            data-order-key={item.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              opacity: drag?.from === index ? 0.5 : undefined,
              boxShadow: dropBefore
                ? 'inset 0 2px 0 var(--gold)'
                : dropAfter
                  ? 'inset 0 -2px 0 var(--gold)'
                  : undefined,
            }}
          >
            <span
              className="gc-order-handle"
              role="button"
              tabIndex={0}
              aria-label={t('characters.orderHandle')}
              title={t('characters.orderHandle')}
              style={handleStyle}
              onPointerDown={onPointerDown(index)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => setDrag(null)}
              onKeyDown={onKeyDown(index)}
            >
              ⋮⋮
            </span>
            <div className="gc-order-body" style={{ flex: 1, minWidth: 0 }}>
              {item.content}
            </div>
          </div>
        )
      })}
    </>
  )
}
