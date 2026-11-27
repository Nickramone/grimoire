import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { ghostBtn, helpText } from './characterStyles'
import { evaluate, toNumber } from './expressions'
import { clampNumber, scoreCost, scoresLeft } from './sheetPrompts'
import type { StepControlProps } from './promptStepShared'

type Values = Record<string, unknown>

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto auto auto',
  alignItems: 'center',
  columnGap: 12,
  rowGap: 6,
  fontSize: 13,
}
const head: CSSProperties = { fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }
const stepper: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6 }
const pip: CSSProperties = { ...ghostBtn, padding: '2px 9px', minWidth: 28 }
const num: CSSProperties = { minWidth: 24, textAlign: 'center', fontWeight: 700 }

const signed = (value: number) => (value >= 0 ? `+${value}` : String(value))

// The scores side by side, each moved up or down by one: with a budget the
// points left show above, and a score that would spend past them stays put.
export default function ScoresStep({ step, value, context, onAnswer }: StepControlProps) {
  const { t } = useTranslation()
  const values: Values = value && typeof value === 'object' ? (value as Values) : {}
  const left = scoresLeft(step, values)
  const set = (key: string, next: number) => onAnswer({ ...values, [key]: next })
  return (
    <div>
      {left !== undefined ? (
        <p style={{ ...helpText, fontWeight: 700 }}>
          {t('characters.promptPointsLeft', { left, budget: step.budget })}
        </p>
      ) : null}
      <div style={grid}>
        <span />
        <span style={head}>{t('characters.promptScore')}</span>
        <span style={head}>{t('characters.promptBonus')}</span>
        <span style={head}>{t('characters.promptTotal')}</span>
        {(step.abilities || []).flatMap((ability) => {
          const score = Number(values[ability.key]) || 0
          const bonus = ability.bonus
            ? Math.round(Number(toNumber(evaluate(ability.bonus, context))) || 0)
            : 0
          const up = clampNumber(step, score + 1)
          const down = clampNumber(step, score - 1)
          const raise =
            up !== score &&
            (left === undefined || scoreCost(step, up) - scoreCost(step, score) <= left)
          const name = ability.label || ability.key
          return [
            <span key={`${ability.key}-name`}>{name}</span>,
            <span key={`${ability.key}-score`} style={stepper}>
              <button
                type="button"
                style={pip}
                disabled={down === score}
                aria-label={t('characters.promptScoreDown', { name })}
                onClick={() => set(ability.key, down)}
              >
                −
              </button>
              <span style={num} data-testid={`score-${ability.key}`}>
                {score}
              </span>
              <button
                type="button"
                style={pip}
                disabled={!raise}
                aria-label={t('characters.promptScoreUp', { name })}
                onClick={() => set(ability.key, up)}
              >
                +
              </button>
            </span>,
            <span key={`${ability.key}-bonus`} style={{ textAlign: 'center' }}>
              {signed(bonus)}
            </span>,
            <span key={`${ability.key}-total`} style={{ ...num }}>
              {score + bonus}
            </span>,
          ]
        })}
      </div>
    </div>
  )
}
