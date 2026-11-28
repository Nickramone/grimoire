import { describe, it, expect } from 'vitest'
import { planPop, planRevert, recordsOf, withRecord } from './sheetRecords'
import { planAction } from './sheetActions'

const DOCUMENT = {
  fields: {
    skills: { type: 'multiselect', options: ['Arcana', 'History', 'Insight'] },
    tools: { type: 'multiselect', options: ['Lute', 'Flute'] },
    features: { type: 'content_list', content_type: 'feature' },
    spells: { type: 'content_list', content_type: 'spell' },
    feats: {
      type: 'content_list',
      content_type: 'feat',
      on_pick: [{ grant: 'skills', from: 'skill_proficiencies' }, { prompt: 'feat_tools' }],
    },
    background: {
      type: 'content_ref',
      content_type: 'background',
      on_pick: [{ grant: 'feats', ref: 'feat_id' }],
    },
    klass: {
      type: 'content_ref',
      content_type: 'class',
      on_pick: [{ grant: 'features', from: 'feature_ids' }],
    },
    advancements: { type: 'list', columns: [{ key: 'class', type: 'text' }] },
  },
}

// A Wizard at level 2: level 1 took the class and the Sage background, whose
// Magic Initiate brought Arcana; level 2 took Alert (with History) and
// swapped Light for Fire Bolt.
const DATA = {
  klass: { _ref: 'wizard' },
  background: { _ref: 'sage' },
  skills: ['Arcana', 'History', 'Insight'],
  tools: ['Lute'],
  features: [
    { _ref: 'spellcasting' },
    { _ref: 'scholar' },
    { _inline: true, name: 'Ritual Adept' },
  ],
  feats: [{ _ref: 'magic-initiate' }, { _ref: 'alert' }],
  spells: [{ _ref: 'fire-bolt', _per: { origin: 'class' } }],
  advancements: [{ class: 'Wizard' }, { class: 'Wizard' }],
  _granted: {
    klass: { features: ['spellcasting'] },
    background: { feats: ['magic-initiate'] },
    'feats:magic-initiate': { skills: ['Arcana'] },
    'feats:alert': { skills: ['History'], tools: ['Lute'] },
  },
  _records: {
    'level:1': { granted: { klass: ['wizard'], background: ['sage'] } },
    'level:2': {
      granted: {
        feats: ['alert'],
        features: ['scholar', 'Ritual Adept'],
        skills: ['Insight'],
        spells: ['fire-bolt'],
      },
      dropped: { spells: [{ _ref: 'light', _per: { origin: 'class' } }] },
    },
  },
  _pending_prompts: [
    { prompt: 'feat_tools', source: 'feats', ref: 'alert' },
    { prompt: 'feat_tools', source: 'feats', ref: 'magic-initiate' },
    { prompt: 'background_feat', source: 'background' },
  ],
}

describe('planRevert', () => {
  it("takes back a level's additions, a picked row's grants with it, and puts back what it took out", () => {
    expect(planRevert(DOCUMENT, DATA, 'level:2')).toEqual({
      _records: { 'level:1': DATA._records['level:1'] },
      feats: [{ _ref: 'magic-initiate' }],
      _granted: {
        klass: { features: ['spellcasting'] },
        background: { feats: ['magic-initiate'] },
        'feats:magic-initiate': { skills: ['Arcana'] },
      },
      skills: ['Arcana'],
      tools: [],
      _pending_prompts: [
        { prompt: 'feat_tools', source: 'feats', ref: 'magic-initiate' },
        { prompt: 'background_feat', source: 'background' },
      ],
      features: [{ _ref: 'spellcasting' }],
      spells: [{ _ref: 'light', _per: { origin: 'class' } }],
    })
  })

  it('clears a single pick and follows its grants down: the background, its feat, the skill', () => {
    const patch = planRevert(DOCUMENT, DATA, 'level:1')
    expect(patch).toMatchObject({
      klass: null,
      background: null,
      features: [{ _ref: 'scholar' }, { _inline: true, name: 'Ritual Adept' }],
      feats: [{ _ref: 'alert' }],
      skills: ['History', 'Insight'],
      _pending_prompts: [{ prompt: 'feat_tools', source: 'feats', ref: 'alert' }],
    })
    expect(Object.keys(patch._granted as object)).toEqual(['feats:alert'])
    expect(recordsOf(patch)).toEqual({ 'level:2': DATA._records['level:2'] })
  })

  it('leaves a single pick that is no longer the one recorded', () => {
    const patch = planRevert(DOCUMENT, { ...DATA, klass: { _ref: 'cleric' } }, 'level:1')
    expect(patch).not.toHaveProperty('klass')
    expect(patch.background).toBeNull()
  })

  it('changes nothing for a key with no record - a level gained before records', () => {
    expect(planRevert(DOCUMENT, DATA, 'level:7')).toEqual({})
    expect(planRevert(DOCUMENT, {}, 'level:1')).toEqual({})
    expect(planRevert(DOCUMENT, DATA, '')).toEqual({})
  })

  it('drops the choices the level put off, with or without a record', () => {
    const waiting = [
      { prompt: 'asi_later', record: 'level:2' },
      { prompt: 'background_later', record: 'level:1' },
      { prompt: 'feat_tools', source: 'feats', ref: 'alert' },
    ]
    expect(planRevert(DOCUMENT, { ...DATA, _pending_prompts: waiting }, 'level:2')).toMatchObject({
      // Alert itself is taken back with level 2, and its choice with it.
      _pending_prompts: [waiting[1]],
    })
    expect(planRevert(DOCUMENT, { _pending_prompts: waiting }, 'level:1')).toEqual({
      _pending_prompts: [waiting[0], waiting[2]],
    })
    expect(planRevert(DOCUMENT, { _pending_prompts: waiting }, 'level:5')).toEqual({})
  })

  it('does not put back a row the list holds again', () => {
    const data = { ...DATA, spells: [{ _ref: 'light' }, { _ref: 'fire-bolt' }] }
    expect(planRevert(DOCUMENT, data, 'level:2').spells).toEqual([{ _ref: 'light' }])
  })

  it('stops at a record that leads back to itself', () => {
    const data = {
      feats: [{ _ref: 'a' }],
      _granted: { 'feats:a': { feats: ['a'] } },
      _records: { x: { granted: { feats: ['a'] } } },
    }
    expect(planRevert(DOCUMENT, data, 'x')).toMatchObject({ feats: [], _granted: {} })
  })
})

describe('planPop', () => {
  it("takes a list's last row off", () => {
    expect(planPop(DOCUMENT, DATA, 'advancements')).toEqual({ advancements: [{ class: 'Wizard' }] })
    expect(planPop(DOCUMENT, { advancements: [] }, 'advancements')).toEqual({})
    expect(planPop(DOCUMENT, DATA, 'skills')).toEqual({})
  })

  it("takes a content_list row's grants and put-off prompts with it", () => {
    expect(planPop(DOCUMENT, DATA, 'feats')).toMatchObject({
      feats: [{ _ref: 'magic-initiate' }],
      skills: ['Arcana', 'Insight'],
      tools: [],
      _pending_prompts: [
        { prompt: 'feat_tools', source: 'feats', ref: 'magic-initiate' },
        { prompt: 'background_feat', source: 'background' },
      ],
    })
  })
})

describe('withRecord', () => {
  it('adds after what the record holds, and writes nothing when there is nothing', () => {
    expect(withRecord(DATA, 'level:1', { granted: { skills: ['Insight'], tools: [] } })).toEqual({
      _records: {
        ...DATA._records,
        'level:1': { granted: { klass: ['wizard'], background: ['sage'], skills: ['Insight'] } },
      },
    })
    expect(withRecord({}, 'level:3', { dropped: { spells: [{ _ref: 'light' }] } })).toEqual({
      _records: { 'level:3': { dropped: { spells: [{ _ref: 'light' }] } } },
    })
    expect(withRecord(DATA, 'level:3', { granted: { skills: [] } })).toEqual({})
    expect(withRecord(DATA, '', { granted: { skills: ['Arcana'] } })).toEqual({})
  })
})

describe('planAction revert and pop', () => {
  it('reverts the record a formula names, then pops the row, each on what the last left', () => {
    const patch = planAction(
      {
        name: 'undo',
        label: 'Undo',
        steps: [
          { revert: "concat('level:', len(advancements))" },
          { pop: 'advancements' },
          { pop: 'feats' },
        ],
      },
      { document: DOCUMENT, data: DATA, context: { advancements: DATA.advancements } }
    )
    expect(patch.advancements).toEqual([{ class: 'Wizard' }])
    // Alert went with the revert; the pop takes the row left last.
    expect(patch.feats).toEqual([])
    expect(patch.skills).toEqual([])
    expect(recordsOf(patch)).toEqual({ 'level:1': DATA._records['level:1'] })
  })

  it('skips a revert whose formula cannot be worked out', () => {
    expect(
      planAction(
        { name: 'undo', label: 'Undo', steps: [{ revert: 'missing(' }] },
        { document: DOCUMENT, data: DATA, context: {} }
      )
    ).toEqual({})
  })
})
