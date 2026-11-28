import PromptStepCampaign from './PromptStepCampaign'
import PromptStepChoose from './PromptStepChoose'
import PromptStepDistribute from './PromptStepDistribute'
import PromptStepEntry from './PromptStepEntry'
import PromptStepNumber from './PromptStepNumber'
import PromptStepScores from './PromptStepScores'
import PromptStepSelect from './PromptStepSelect'
import type { StepControlProps } from './promptStepShared'

/** The control for one step of a prompt, by its type. */
export default function PromptStepControl(props: StepControlProps) {
  switch (props.step.type) {
    case 'campaign':
      return <PromptStepCampaign {...props} />
    case 'choose':
      return <PromptStepChoose {...props} />
    case 'distribute':
      return <PromptStepDistribute {...props} />
    case 'entry':
    case 'entries':
      return <PromptStepEntry {...props} />
    case 'number':
      return <PromptStepNumber {...props} />
    case 'scores':
      return <PromptStepScores {...props} />
    case 'select':
      return <PromptStepSelect {...props} />
    default:
      return null
  }
}
