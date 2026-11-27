import { useTranslation } from 'react-i18next'
import useCharacterCampaigns from './useCharacterCampaigns'
import { optionLabel, optionList } from './promptStepShared'
import type { StepControlProps } from './promptStepShared'

// The campaign the character is played in: the player's own campaigns and the
// ones they have joined, or none. The character moves there when the prompt is
// confirmed, so the prompts after it read that campaign's house rules.
export default function CampaignStep({ step, value, onAnswer }: StepControlProps) {
  const { t } = useTranslation()
  const campaigns = useCharacterCampaigns()
  const options: { id: string; name: string }[] = [...campaigns]
  // The character's own campaign stays offered when the list leaves it out.
  if (typeof value === 'string' && value && !options.some((campaign) => campaign.id === value)) {
    options.push({ id: value, name: '…' })
  }
  return (
    <ul style={optionList}>
      {[{ id: '', name: t('characters.noCampaign') }, ...options].map((campaign) => (
        <li key={campaign.id || '-'}>
          <label style={optionLabel(false)}>
            <input
              type="radio"
              name={`prompt-${step.key}`}
              checked={(value ?? '') === campaign.id}
              onChange={() => onAnswer(campaign.id)}
            />
            {campaign.name}
          </label>
        </li>
      ))}
    </ul>
  )
}
