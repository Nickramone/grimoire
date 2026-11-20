import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import WikiAnnotations, { type WikiAnnotation } from './WikiAnnotations'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: { count?: number }) => (o?.count !== undefined ? `${k}:${o.count}` : k),
  }),
}))

const api = vi.hoisted(() => ({
  listWikiAnnotations: vi.fn(),
  createWikiAnnotation: vi.fn(),
  updateWikiAnnotation: vi.fn(),
  deleteWikiAnnotation: vi.fn(),
}))
vi.mock('../../api', () => ({ campaigns: api }))

const note = (over: Partial<WikiAnnotation> = {}): WikiAnnotation => ({
  id: 'n1',
  page_id: 'p1',
  body: 'Duvessa seems nervous.',
  visibility: 'party',
  hidden_by_gm: false,
  author_id: 'u1',
  author_name: 'Elza',
  is_mine: false,
  can_edit: false,
  can_hide: false,
  created_at: '2026-11-20T10:00:00',
  updated_at: '2026-11-20T10:00:00',
  ...over,
})

const renderNotes = (shared = true) =>
  render(<WikiAnnotations campaignId="c1" pageId="p1" shared={shared} />)

describe('WikiAnnotations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'alert').mockImplementation(() => {})
  })

  it('lists the notes of the page with their author and visibility', async () => {
    api.listWikiAnnotations.mockResolvedValue([note()])
    renderNotes()
    expect(await screen.findByText('Duvessa seems nervous.')).toBeInTheDocument()
    expect(api.listWikiAnnotations).toHaveBeenCalledWith('c1', 'p1')
    expect(screen.getByText('Elza')).toBeInTheDocument()
    expect(
      within(screen.getByRole('listitem')).getByText('wikiNotes.vis.party')
    ).toBeInTheDocument()
    expect(screen.getByText('wikiNotes.titleCount:1')).toBeInTheDocument()
    // Someone else's note: no edit or delete.
    expect(screen.queryByLabelText('wikiNotes.edit')).not.toBeInTheDocument()
  })

  it('adds a note with the party as the default audience', async () => {
    api.listWikiAnnotations.mockResolvedValue([])
    api.createWikiAnnotation.mockResolvedValue(
      note({ id: 'n2', body: 'Ask about Sephek', is_mine: true })
    )
    renderNotes()
    const box = await screen.findByLabelText('wikiNotes.text')
    fireEvent.change(box, { target: { value: '  Ask about Sephek ' } })
    fireEvent.click(screen.getByText('wikiNotes.add'))
    await waitFor(() =>
      expect(api.createWikiAnnotation).toHaveBeenCalledWith('c1', 'p1', {
        body: 'Ask about Sephek',
        visibility: 'party',
      })
    )
    expect(await screen.findByText('Ask about Sephek')).toBeInTheDocument()
    expect(screen.getByText('wikiNotes.you')).toBeInTheDocument()
    expect((box as HTMLTextAreaElement).value).toBe('')
  })

  it('sends the chosen audience', async () => {
    api.listWikiAnnotations.mockResolvedValue([])
    api.createWikiAnnotation.mockResolvedValue(note({ visibility: 'self', is_mine: true }))
    renderNotes()
    fireEvent.change(await screen.findByLabelText('wikiNotes.text'), { target: { value: 'x' } })
    fireEvent.change(screen.getByLabelText('wikiNotes.visibility'), { target: { value: 'self' } })
    fireEvent.click(screen.getByText('wikiNotes.add'))
    await waitFor(() =>
      expect(api.createWikiAnnotation).toHaveBeenCalledWith('c1', 'p1', {
        body: 'x',
        visibility: 'self',
      })
    )
  })

  it('keeps the text when saving fails', async () => {
    api.listWikiAnnotations.mockResolvedValue([])
    api.createWikiAnnotation.mockRejectedValue({ message: 'nope' })
    renderNotes()
    const box = await screen.findByLabelText('wikiNotes.text')
    fireEvent.change(box, { target: { value: 'keep me' } })
    fireEvent.click(screen.getByText('wikiNotes.add'))
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('nope'))
    expect((box as HTMLTextAreaElement).value).toBe('keep me')
  })

  it('has no audience picker in a personal campaign', async () => {
    api.listWikiAnnotations.mockResolvedValue([note({ is_mine: true })])
    renderNotes(false)
    await screen.findByText('Duvessa seems nervous.')
    expect(screen.queryByLabelText('wikiNotes.visibility')).not.toBeInTheDocument()
    expect(screen.queryByText('wikiNotes.vis.party')).not.toBeInTheDocument()
  })

  it('lets the author edit a note', async () => {
    api.listWikiAnnotations.mockResolvedValue([note({ is_mine: true, can_edit: true })])
    api.updateWikiAnnotation.mockResolvedValue(
      note({ is_mine: true, can_edit: true, body: 'Edited', visibility: 'gm' })
    )
    renderNotes()
    fireEvent.click(await screen.findByLabelText('wikiNotes.edit'))
    const boxes = screen.getAllByLabelText('wikiNotes.text')
    fireEvent.change(boxes[0], { target: { value: 'Edited' } })
    fireEvent.change(screen.getAllByLabelText('wikiNotes.visibility')[0], {
      target: { value: 'gm' },
    })
    fireEvent.click(screen.getByText('common.save'))
    await waitFor(() =>
      expect(api.updateWikiAnnotation).toHaveBeenCalledWith('c1', 'p1', 'n1', {
        body: 'Edited',
        visibility: 'gm',
      })
    )
    expect(await screen.findByText('Edited')).toBeInTheDocument()
    expect(within(screen.getByRole('listitem')).getByText('wikiNotes.vis.gm')).toBeInTheDocument()
  })

  it('cancels an edit', async () => {
    api.listWikiAnnotations.mockResolvedValue([note({ is_mine: true, can_edit: true })])
    renderNotes()
    fireEvent.click(await screen.findByLabelText('wikiNotes.edit'))
    fireEvent.click(screen.getByText('common.cancel'))
    expect(screen.getByText('Duvessa seems nervous.')).toBeInTheDocument()
    expect(screen.getAllByLabelText('wikiNotes.text')).toHaveLength(1)
  })

  it('deletes a note after confirming', async () => {
    api.listWikiAnnotations.mockResolvedValue([note({ is_mine: true, can_edit: true })])
    api.deleteWikiAnnotation.mockResolvedValue(undefined)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    renderNotes()
    fireEvent.click(await screen.findByLabelText('wikiNotes.delete'))
    expect(api.deleteWikiAnnotation).not.toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('wikiNotes.delete'))
    await waitFor(() => expect(api.deleteWikiAnnotation).toHaveBeenCalledWith('c1', 'p1', 'n1'))
    await waitFor(() =>
      expect(screen.queryByText('Duvessa seems nervous.')).not.toBeInTheDocument()
    )
    confirm.mockRestore()
  })

  it('lets the GM hide and show a party note', async () => {
    api.listWikiAnnotations.mockResolvedValue([note({ can_hide: true })])
    api.updateWikiAnnotation
      .mockResolvedValueOnce(note({ can_hide: true, hidden_by_gm: true }))
      .mockResolvedValueOnce(note({ can_hide: true, hidden_by_gm: false }))
    renderNotes()
    fireEvent.click(await screen.findByText('wikiNotes.hide'))
    await waitFor(() =>
      expect(api.updateWikiAnnotation).toHaveBeenCalledWith('c1', 'p1', 'n1', {
        hidden_by_gm: true,
      })
    )
    expect(await screen.findByText('wikiNotes.hiddenByGm')).toBeInTheDocument()
    fireEvent.click(screen.getByText('wikiNotes.unhide'))
    await waitFor(() =>
      expect(api.updateWikiAnnotation).toHaveBeenLastCalledWith('c1', 'p1', 'n1', {
        hidden_by_gm: false,
      })
    )
    await waitFor(() => expect(screen.queryByText('wikiNotes.hiddenByGm')).not.toBeInTheDocument())
  })

  it('filters to my own notes', async () => {
    api.listWikiAnnotations.mockResolvedValue([
      note(),
      note({ id: 'n2', body: 'Mine', is_mine: true, visibility: 'self' }),
    ])
    renderNotes()
    await screen.findByText('Mine')
    fireEvent.click(screen.getByText('wikiNotes.showMine'))
    expect(screen.queryByText('Duvessa seems nervous.')).not.toBeInTheDocument()
    expect(screen.getByText('Mine')).toBeInTheDocument()
    fireEvent.click(screen.getByText('wikiNotes.showAll'))
    expect(screen.getByText('Duvessa seems nervous.')).toBeInTheDocument()
  })

  it('reports a failed load and retries', async () => {
    api.listWikiAnnotations.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce([note()])
    renderNotes()
    fireEvent.click(await screen.findByText('wikiNotes.retry'))
    expect(await screen.findByText('Duvessa seems nervous.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('reports failures to edit, hide and delete', async () => {
    api.listWikiAnnotations.mockResolvedValue([
      note({ is_mine: true, can_edit: true, can_hide: true }),
    ])
    api.updateWikiAnnotation.mockRejectedValue({ message: 'refused' })
    api.deleteWikiAnnotation.mockRejectedValue({ message: 'gone' })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderNotes()
    fireEvent.click(await screen.findByText('wikiNotes.hide'))
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('refused'))
    fireEvent.click(screen.getByLabelText('wikiNotes.delete'))
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('gone'))
    fireEvent.click(screen.getByLabelText('wikiNotes.edit'))
    fireEvent.click(screen.getByText('common.save'))
    await waitFor(() => expect(window.alert).toHaveBeenCalledTimes(3))
    // Still editing: a failed save does not close the form.
    expect(screen.getByText('common.cancel')).toBeInTheDocument()
  })
})
