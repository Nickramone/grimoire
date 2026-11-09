import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import EntryMarkdown from './EntryMarkdown'
import { isAppLink } from './EntryLink'

describe('isAppLink', () => {
  it('accepts app paths only', () => {
    expect(isAppLink('/library/book/b1?page=3')).toBe(true)
    expect(isAppLink('/api/content/assets/x.webp')).toBe(false)
    expect(isAppLink('//evil.example/x')).toBe(false)
    expect(isAppLink('https://example.com')).toBe(false)
    expect(isAppLink(undefined)).toBe(false)
  })
})

describe('EntryMarkdown links', () => {
  it('follows an app link without leaving the app', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/compendium']}>
        <Routes>
          <Route
            path="/compendium"
            element={
              <EntryMarkdown
                label="Description"
                body="*Source: [PHB, p. 109](/library/book/b1?page=108)*"
              />
            }
          />
          <Route path="/library/book/:bookId" element={<p>Reader open</p>} />
        </Routes>
      </MemoryRouter>
    )
    await user.click(screen.getByRole('link', { name: 'PHB, p. 109' }))
    expect(screen.getByText('Reader open')).toBeInTheDocument()
  })

  it('opens other links in a new tab', () => {
    render(<EntryMarkdown label="Description" body="[Site](https://example.com)" />)
    const link = screen.getByRole('link', { name: 'Site' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
  })
})
