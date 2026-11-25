import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PromptDialog from './PromptDialog'
import type { SheetPrompt } from './sheetPrompts'

const LEVEL_UP: SheetPrompt = {
  label: 'Level up',
  steps: [
    { key: 'hp', type: 'number', label: 'Hit points', average: 'hit_die / 2 + 1', min: 0 },
    {
      key: 'kind',
      type: 'select',
      label: 'Improvement',
      options: [
        { value: 'asi', label: 'Ability Score Improvement' },
        { value: 'feat', label: 'Feat' },
      ],
    },
    {
      key: 'asi',
      type: 'distribute',
      label: 'Abilities',
      options: [
        { value: 'str', label: 'Strength' },
        { value: 'dex', label: 'Dexterity' },
      ],
      patterns: ['2', '1,1'],
      visible_if: "answer.kind == 'asi'",
    },
    {
      key: 'feat',
      type: 'entry',
      label: 'Feat',
      content_type: 'feat',
      filters: { category: 'G' },
      filter: 'entry.level <= level',
      visible_if: "answer.kind == 'feat'",
    },
  ],
  apply: [{ set: 'level', to: 'level + 1' }],
}

const DOCUMENT = {
  fields: {
    level: { type: 'number' },
    skills: { type: 'multiselect', options: ['Arcana', 'History', 'Insight'] },
  },
}
const SHEET = { level: 4, hit_die: 10 }

const confirm = () => screen.getByRole('button', { name: 'Confirm' })

describe('PromptDialog', () => {
  it('shows the steps for the answers so far, and confirms once all are answered', async () => {
    const onConfirm = vi.fn()
    render(
      <PromptDialog
        prompt={LEVEL_UP}
        document={DOCUMENT}
        data={{}}
        context={SHEET}
        onConfirm={onConfirm}
      />
    )
    expect(screen.getByRole('dialog', { name: 'Level up' })).toBeInTheDocument()
    expect(screen.queryByText('Abilities')).not.toBeInTheDocument()
    expect(confirm()).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Use average (6)' }))
    await userEvent.click(screen.getByLabelText('Ability Score Improvement'))
    expect(screen.getByText('Abilities')).toBeInTheDocument()
    expect(confirm()).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'One more for Strength' }))
    expect(confirm()).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'One more for Dexterity' }))
    // +1/+1 spends every point: no third.
    expect(screen.getByRole('button', { name: 'One more for Strength' })).toBeDisabled()
    await userEvent.click(confirm())
    expect(onConfirm.mock.calls.at(-1)?.[0]).toEqual({
      hp: 6,
      kind: 'asi',
      asi: { str: 1, dex: 1 },
    })
  })

  it('takes a number typed by hand, within its bounds', async () => {
    const onConfirm = vi.fn()
    const prompt: SheetPrompt = { ...LEVEL_UP, steps: [LEVEL_UP.steps[0]] }
    render(
      <PromptDialog
        prompt={prompt}
        document={DOCUMENT}
        data={{}}
        context={SHEET}
        onConfirm={onConfirm}
      />
    )
    await userEvent.type(screen.getByLabelText('Hit points'), '8')
    await userEvent.click(confirm())
    expect(onConfirm.mock.calls.at(-1)?.[0]).toEqual({ hp: 8 })
  })

  it('lets a number below its min be typed on the way to one above it', async () => {
    const onConfirm = vi.fn()
    const prompt: SheetPrompt = {
      ...LEVEL_UP,
      steps: [{ key: 'hp', type: 'number', label: 'Hit points', min: 10, max: 20 }],
    }
    render(
      <PromptDialog
        prompt={prompt}
        document={DOCUMENT}
        data={{}}
        context={SHEET}
        onConfirm={onConfirm}
      />
    )
    const input = screen.getByLabelText('Hit points')
    await userEvent.type(input, '12')
    expect(input).toHaveValue(12)
    await userEvent.click(confirm())
    expect(onConfirm.mock.calls.at(-1)?.[0]).toEqual({ hp: 12 })
  })

  it('brings a number out of bounds back within them when the input loses focus', async () => {
    const onConfirm = vi.fn()
    const prompt: SheetPrompt = {
      ...LEVEL_UP,
      steps: [{ key: 'hp', type: 'number', label: 'Hit points', min: 10, max: 20 }],
    }
    render(
      <PromptDialog
        prompt={prompt}
        document={DOCUMENT}
        data={{}}
        context={SHEET}
        onConfirm={onConfirm}
      />
    )
    const input = screen.getByLabelText('Hit points')
    await userEvent.type(input, '35')
    await userEvent.tab()
    expect(input).toHaveValue(20)
    await userEvent.click(confirm())
    expect(onConfirm.mock.calls.at(-1)?.[0]).toEqual({ hp: 20 })
  })

  it('offers the catalog entries the filters let through', async () => {
    const browse = vi.fn(async () => ({
      entries: [
        { entry_id: 'alert', name: 'Alert', source: 'xphb', data: { level: 1 } },
        { entry_id: 'boon', name: 'Boon of Speed', source: 'xphb', data: { level: 19 } },
      ],
      total: 2,
    }))
    const onConfirm = vi.fn()
    render(
      <PromptDialog
        prompt={LEVEL_UP}
        document={DOCUMENT}
        data={{}}
        context={SHEET}
        browse={browse}
        onConfirm={onConfirm}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Use average (6)' }))
    await userEvent.click(screen.getByLabelText('Feat'))
    await userEvent.click(await screen.findByLabelText('Alert'))
    expect(screen.queryByLabelText('Boon of Speed')).not.toBeInTheDocument()
    expect(browse).toHaveBeenCalledWith('feat', { category: 'G' }, 1, 200)
    await userEvent.click(confirm())
    expect(onConfirm.mock.calls.at(-1)?.[0]).toEqual({
      hp: 6,
      kind: 'feat',
      feat: { level: 1, name: 'Alert', _ref: 'alert', _source: 'xphb' },
    })
  })

  it('chooses several entries, as many as count asks for', async () => {
    const prompt: SheetPrompt = {
      ...LEVEL_UP,
      steps: [{ key: 'spells', type: 'entries', label: 'Spells', content_type: 'spell', count: 2 }],
    }
    const browse = async () => ({
      entries: ['Bless', 'Guidance', 'Light'].map((name) => ({
        entry_id: name.toLowerCase(),
        name,
        data: {},
      })),
      total: 3,
    })
    const onConfirm = vi.fn()
    render(
      <PromptDialog
        prompt={prompt}
        document={DOCUMENT}
        data={{}}
        context={SHEET}
        browse={browse}
        onConfirm={onConfirm}
      />
    )
    await userEvent.click(await screen.findByLabelText('Bless'))
    expect(screen.getByRole('status')).toHaveTextContent('1 left to choose')
    expect(confirm()).toBeDisabled()
    await userEvent.click(screen.getByLabelText('Light'))
    expect(screen.getByLabelText('Guidance')).toBeDisabled()
    // Unticking one frees a place again.
    await userEvent.click(screen.getByLabelText('Bless'))
    expect(screen.getByLabelText('Guidance')).toBeEnabled()
    await userEvent.click(screen.getByLabelText('Guidance'))
    await userEvent.click(confirm())
    expect(onConfirm.mock.calls.at(-1)?.[0]).toEqual({
      spells: [
        { name: 'Light', _ref: 'light', _source: undefined },
        { name: 'Guidance', _ref: 'guidance', _source: undefined },
      ],
    })
  })

  it('offers at once an option whose prerequisite is ticked in the same step', async () => {
    const prompt: SheetPrompt = {
      ...LEVEL_UP,
      steps: [
        {
          key: 'opts',
          type: 'entries',
          content_type: 'option',
          count: 2,
          filter: "entry.requires == '' or has_ref(answer.opts, entry.requires)",
        },
      ],
    }
    const browse = async () => ({
      entries: [
        { entry_id: 'blade', name: 'Pact of the Blade', data: { requires: '' } },
        { entry_id: 'sight', name: 'Devil Sight', data: { requires: '' } },
        { entry_id: 'thirst', name: 'Thirsting Blade', data: { requires: 'blade' } },
      ],
      total: 3,
    })
    const onConfirm = vi.fn()
    render(
      <PromptDialog
        prompt={prompt}
        document={DOCUMENT}
        data={{}}
        context={SHEET}
        browse={browse}
        onConfirm={onConfirm}
      />
    )
    await userEvent.click(await screen.findByLabelText('Pact of the Blade'))
    await userEvent.click(await screen.findByLabelText('Thirsting Blade'))
    expect(confirm()).toBeEnabled()
    // Its prerequisite unticked, it goes too, without a word.
    await userEvent.click(screen.getByLabelText('Pact of the Blade'))
    await waitFor(() => expect(screen.queryByLabelText('Thirsting Blade')).not.toBeInTheDocument())
    expect(screen.getByRole('status')).toHaveTextContent('2 left to choose')
    expect(confirm()).toBeDisabled()
    await userEvent.click(screen.getByLabelText('Pact of the Blade'))
    await userEvent.click(await screen.findByLabelText('Devil Sight'))
    await userEvent.click(confirm())
    expect(onConfirm.mock.calls.at(-1)?.[0]).toEqual({
      opts: [
        { requires: '', name: 'Pact of the Blade', _ref: 'blade', _source: undefined },
        { requires: '', name: 'Devil Sight', _ref: 'sight', _source: undefined },
      ],
    })
  })

  it('filters a step again when an earlier answer changes, reading the catalog once', async () => {
    const prompt: SheetPrompt = {
      ...LEVEL_UP,
      steps: [
        { key: 'species', type: 'entry', content_type: 'lineage', filter: "entry.species == ''" },
        {
          key: 'lineage',
          type: 'entry',
          content_type: 'lineage',
          visible_if: 'answer.species',
          filter: 'entry.species == answer.species.name',
        },
      ],
    }
    const browse = vi.fn(async () => ({
      entries: [
        { entry_id: 'elf', name: 'Elf', data: { species: '' } },
        { entry_id: 'gnome', name: 'Gnome', data: { species: '' } },
        { entry_id: 'high', name: 'High Elf', data: { species: 'Elf' } },
        { entry_id: 'forest', name: 'Forest Gnome', data: { species: 'Gnome' } },
      ],
      total: 4,
    }))
    render(
      <PromptDialog prompt={prompt} document={DOCUMENT} data={{}} context={SHEET} browse={browse} />
    )
    await userEvent.click(await screen.findByLabelText('Elf'))
    await userEvent.click(await screen.findByLabelText('High Elf'))
    expect(confirm()).toBeEnabled()
    await userEvent.click(screen.getByLabelText('Gnome'))
    expect(await screen.findByLabelText('Forest Gnome')).not.toBeChecked()
    expect(screen.queryByLabelText('High Elf')).not.toBeInTheDocument()
    expect(confirm()).toBeDisabled()
    expect(browse).toHaveBeenCalledTimes(1)
  })

  describe('a page at a time', () => {
    const PAGED: SheetPrompt = {
      label: 'Level up',
      paged: true,
      steps: [
        { key: 'kind', type: 'select', label: 'Kind', options: ['ASI', 'Feat'], page: 'growth' },
        {
          key: 'what',
          type: 'select',
          label: 'Which feat',
          options: ['Alert', 'Tough'],
          page: 'growth',
          visible_if: "answer.kind == 'Feat'",
        },
        { key: 'origin', type: 'select', label: 'Origin', options: ['Acolyte', 'Sage'] },
        {
          key: 'tool',
          type: 'select',
          label: 'Tool',
          options: ['Lute'],
          visible_if: "answer.kind == 'ASI'",
        },
      ],
      pages: { growth: { label: 'Growth' }, 'step:origin': { later: 'origin_later' } },
      apply: [],
    }
    const next = () => screen.getByRole('button', { name: 'Next' })
    const back = () => screen.getByRole('button', { name: 'Back' })

    it('goes page by page, Next once the page is answered, Back keeping the answers', async () => {
      const onConfirm = vi.fn()
      render(
        <PromptDialog
          prompt={PAGED}
          document={DOCUMENT}
          data={{}}
          context={SHEET}
          onConfirm={onConfirm}
        />
      )
      expect(screen.getByText('Growth · 1 of 2')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument()
      expect(next()).toBeDisabled()
      await userEvent.click(screen.getByLabelText('Feat'))
      // A step the page's answers call for shows on the same page.
      expect(next()).toBeDisabled()
      await userEvent.click(screen.getByLabelText('Tough'))
      await userEvent.click(next())
      // The Tool step is hidden: its page is passed over.
      expect(screen.getByText('2 of 2')).toBeInTheDocument()
      expect(screen.queryByLabelText('Tough')).not.toBeInTheDocument()
      await userEvent.click(back())
      expect(screen.getByLabelText('Tough')).toBeChecked()
      await userEvent.click(next())
      await userEvent.click(screen.getByLabelText('Sage'))
      await userEvent.click(confirm())
      expect(onConfirm).toHaveBeenCalledWith(
        { kind: 'Feat', what: 'Tough', origin: 'Sage' },
        [],
        []
      )
    })

    it('skips a page naming a prompt for later, and asks it again when come back to', async () => {
      const onConfirm = vi.fn()
      render(
        <PromptDialog
          prompt={PAGED}
          document={DOCUMENT}
          data={{}}
          context={SHEET}
          onConfirm={onConfirm}
        />
      )
      // The first page names no prompt for later: it cannot be skipped.
      expect(screen.queryByRole('button', { name: 'Skip, choose later' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Choose later' })).toBeInTheDocument()
      await userEvent.click(screen.getByLabelText('Feat'))
      await userEvent.click(screen.getByLabelText('Alert'))
      await userEvent.click(next())
      await userEvent.click(screen.getByLabelText('Acolyte'))
      // A page that can be skipped offers that one way to choose later.
      expect(screen.queryByRole('button', { name: 'Choose later' })).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Skip, choose later' }))
      expect(screen.getByText('Skipped: it waits among the choices to make.')).toBeInTheDocument()
      expect(confirm()).toBeEnabled()
      await userEvent.click(back())
      await userEvent.click(next())
      // Come back to, the page is asked again, its answer let go.
      expect(screen.getByLabelText('Acolyte')).not.toBeChecked()
      expect(confirm()).toBeDisabled()
      await userEvent.click(screen.getByRole('button', { name: 'Skip, choose later' }))
      await userEvent.click(confirm())
      expect(onConfirm).toHaveBeenCalledWith(
        { kind: 'Feat', what: 'Alert' },
        ['step:origin'],
        ['origin_later']
      )
    })

    it('opens again on its last page with its answers, Back from the first page going further', async () => {
      const onBack = vi.fn()
      render(
        <PromptDialog
          prompt={PAGED}
          document={DOCUMENT}
          data={{}}
          context={SHEET}
          onBack={onBack}
          resume={{ answers: { kind: 'Feat', what: 'Alert' }, skipped: ['step:origin'] }}
        />
      )
      expect(screen.getByText('2 of 2')).toBeInTheDocument()
      expect(confirm()).toBeEnabled()
      await userEvent.click(back())
      expect(screen.getByLabelText('Alert')).toBeChecked()
      await userEvent.click(back())
      expect(onBack).toHaveBeenCalledTimes(1)
    })
  })

  it('asks an entries step for no more than the catalog offers', async () => {
    const prompt: SheetPrompt = {
      ...LEVEL_UP,
      steps: [{ key: 'spells', type: 'entries', content_type: 'spell', count: 3 }],
    }
    const browse = async () => ({
      entries: [{ entry_id: 'bless', name: 'Bless', data: {} }],
      total: 1,
    })
    render(
      <PromptDialog prompt={prompt} document={DOCUMENT} data={{}} context={SHEET} browse={browse} />
    )
    await userEvent.click(await screen.findByLabelText('Bless'))
    expect(screen.getByRole('status')).toHaveTextContent('0 left to choose')
    expect(confirm()).toBeEnabled()
  })

  it('notes each entry beside its name, as its entry_note works out', async () => {
    const browse = vi.fn(async () => ({
      entries: [
        { entry_id: 'light', name: 'Light', source: 'xphb', data: { level: 0 } },
        { entry_id: 'bless', name: 'Bless', source: 'xphb', data: { level: 1 } },
      ],
      total: 2,
    }))
    const prompt: SheetPrompt = {
      label: 'Spells',
      steps: [
        {
          key: 'spells',
          type: 'entries',
          label: 'Spells',
          content_type: 'spell',
          count: 1,
          entry_note: "entry.level == 0 ? 'Cantrip' : concat('Lv. ', entry.level)",
        },
      ],
      apply: [],
    }
    render(
      <PromptDialog
        prompt={prompt}
        document={DOCUMENT}
        data={{}}
        context={SHEET}
        browse={browse}
        onConfirm={vi.fn()}
      />
    )
    expect(await screen.findByText('Cantrip')).toBeInTheDocument()
    expect(screen.getByText('Lv. 1')).toBeInTheDocument()
  })

  it('searches a long list by name', async () => {
    const prompt: SheetPrompt = {
      ...LEVEL_UP,
      steps: [{ key: 'feat', type: 'entry', content_type: 'feat' }],
    }
    const names = [
      'Alert',
      'Archery',
      'Athlete',
      'Brawler',
      'Crafter',
      'Defense',
      'Healer',
      'Lucky',
      'Musician',
    ]
    const browse = async () => ({
      entries: names.map((name) => ({ entry_id: name.toLowerCase(), name, data: {} })),
      total: names.length,
    })
    render(
      <PromptDialog prompt={prompt} document={DOCUMENT} data={{}} context={SHEET} browse={browse} />
    )
    await userEvent.type(await screen.findByLabelText('Search'), 'ar')
    expect(screen.getByLabelText('Archery')).toBeInTheDocument()
    expect(screen.queryByLabelText('Alert')).not.toBeInTheDocument()
  })

  it('opens each entry below its name to show what it is, without choosing it', async () => {
    const prompt: SheetPrompt = {
      ...LEVEL_UP,
      steps: [{ key: 'sub', type: 'entry', content_type: 'subclass' }],
    }
    const document = {
      ...DOCUMENT,
      content_types: {
        subclass: {
          fields: {
            name: { type: 'text', label: 'Name' },
            description: { type: 'textarea', label: 'Description' },
          },
        },
      },
    }
    const browse = async () => ({
      entries: [
        { entry_id: 'champion', name: 'Champion', data: { description: 'Crits on **19**.' } },
        { entry_id: 'battle-master', name: 'Battle Master', data: { description: 'Maneuvers.' } },
      ],
      total: 2,
    })
    render(
      <PromptDialog prompt={prompt} document={document} data={{}} context={SHEET} browse={browse} />
    )
    const show = await screen.findByRole('button', { name: 'Show details of Champion' })
    expect(show).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Maneuvers.')).not.toBeInTheDocument()
    await userEvent.click(show)
    expect(screen.getByText('19')).toBeInTheDocument()
    expect(screen.getByLabelText('Champion')).not.toBeChecked()
    // One open at a time, as in the catalog browser.
    await userEvent.click(screen.getByRole('button', { name: 'Show details of Battle Master' }))
    expect(screen.getByText('Maneuvers.')).toBeInTheDocument()
    expect(screen.queryByText('19')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Hide details of Battle Master' }))
    expect(screen.queryByText('Maneuvers.')).not.toBeInTheDocument()
  })

  it('has nothing to open when the content type declares no fields', async () => {
    const prompt: SheetPrompt = {
      ...LEVEL_UP,
      steps: [{ key: 'feat', type: 'entry', content_type: 'feat' }],
    }
    const browse = async () => ({
      entries: [{ entry_id: 'alert', name: 'Alert', data: {} }],
      total: 1,
    })
    render(
      <PromptDialog prompt={prompt} document={DOCUMENT} data={{}} context={SHEET} browse={browse} />
    )
    expect(await screen.findByLabelText('Alert')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show details of Alert' })).not.toBeInTheDocument()
  })

  it('shows why the catalog could not be read', async () => {
    const prompt: SheetPrompt = {
      ...LEVEL_UP,
      steps: [{ key: 'feat', type: 'entry', content_type: 'feat' }],
    }
    render(
      <PromptDialog
        prompt={prompt}
        document={DOCUMENT}
        data={{}}
        context={SHEET}
        browse={async () => {
          throw new Error('Catalog offline')
        }}
      />
    )
    expect(await screen.findByText('Catalog offline')).toBeInTheDocument()
  })

  it('offers nothing without a catalog to read', async () => {
    const prompt: SheetPrompt = {
      ...LEVEL_UP,
      steps: [{ key: 'feat', type: 'entry', content_type: 'feat' }],
    }
    render(<PromptDialog prompt={prompt} document={DOCUMENT} data={{}} context={SHEET} />)
    expect(await screen.findByText('Nothing to choose from')).toBeInTheDocument()
  })

  it('says so when nothing passes', async () => {
    const prompt: SheetPrompt = {
      ...LEVEL_UP,
      steps: [{ ...LEVEL_UP.steps[3], visible_if: undefined }],
    }
    render(
      <PromptDialog
        prompt={prompt}
        document={DOCUMENT}
        data={{}}
        context={SHEET}
        browse={async () => ({ entries: [], total: 0 })}
      />
    )
    expect(await screen.findByText('Nothing to choose from')).toBeInTheDocument()
  })

  it('chooses as many as asked, leaving out what the character has', async () => {
    const onConfirm = vi.fn()
    const prompt: SheetPrompt = {
      label: 'Skills',
      steps: [{ key: 'skills', type: 'choose', target: 'skills', count: 1 }],
      apply: [{ add: 'skills', values: 'answer.skills' }],
    }
    render(
      <PromptDialog
        prompt={prompt}
        document={DOCUMENT}
        data={{ skills: ['Arcana'] }}
        context={{}}
        onConfirm={onConfirm}
      />
    )
    expect(screen.getByLabelText(/Arcana/)).toBeDisabled()
    await userEvent.click(screen.getByLabelText('History'))
    expect(screen.getByLabelText('Insight')).toBeDisabled()
    await userEvent.click(confirm())
    expect(onConfirm.mock.calls.at(-1)?.[0]).toEqual({ skills: ['History'] })
  })

  it('can always be put off, by button or Escape', async () => {
    const onSkip = vi.fn()
    render(
      <PromptDialog
        prompt={LEVEL_UP}
        document={DOCUMENT}
        data={{}}
        context={SHEET}
        onSkip={onSkip}
      />
    )
    await userEvent.click(screen.getByText('Choose later'))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(onSkip).toHaveBeenCalledTimes(2))
  })
})
