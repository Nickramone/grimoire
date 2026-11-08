import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import EntryMarkdown from './EntryMarkdown'

describe('EntryMarkdown', () => {
  it('renders the label and the body as Markdown', () => {
    render(<EntryMarkdown label="Description" body={'A **heavy** bag.\n\n> Cursed.'} />)
    expect(screen.getByText('Description')).toBeInTheDocument()
    expect(screen.getByText('heavy').tagName).toBe('STRONG')
    expect(screen.getByText('Cursed.').closest('blockquote')).not.toBeNull()
  })

  it('renders a GFM table with header and body cells', () => {
    render(<EntryMarkdown label="Table" body={'| d6 | Effect |\n|---|---|\n| 1 | Fire |'} />)
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Effect' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Fire' })).toBeInTheDocument()
  })

  it('keeps a die roll or a range on one line, and lets prose wrap', () => {
    render(
      <EntryMarkdown
        label="Table"
        body={'| 1d100 | Effect |\n|---|---|\n| 02-10 | A geyser erupts and spouts water. |'}
      />
    )
    expect(screen.getByRole('columnheader', { name: '1d100' })).toHaveStyle({
      whiteSpace: 'nowrap',
    })
    expect(screen.getByRole('cell', { name: '02-10' })).toHaveStyle({ whiteSpace: 'nowrap' })
    expect(screen.getByRole('cell', { name: /geyser/ })).toHaveStyle({ whiteSpace: 'normal' })
  })

  it('shows a linked image with its alt text', () => {
    render(
      <EntryMarkdown
        label="Image"
        body="![Bag of Holding](/api/content/assets/items/XDMG/Bag%20of%20Holding.webp)"
      />
    )
    const img = screen.getByAltText('Bag of Holding')
    expect(img).toHaveAttribute('src', '/api/content/assets/items/XDMG/Bag%20of%20Holding.webp')
  })

  it('does not render raw HTML', () => {
    const { container } = render(
      <EntryMarkdown label="Raw" body={'<script>alert(1)</script><b>bold</b>'} />
    )
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
  })
})
