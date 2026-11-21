import type { AssistantRequest } from '../../assistant/AssistantPanel'
import { texts } from '../../lib/texts'
import type { AssessmentDetail } from '../../types'
import type { Criterion, FormState } from './model'

const t = texts.assessment.summary

/** Podsumowanie oceny (pełna wersja w części b etapu 4). */
export function SummaryStep({
  state,
  criteria,
}: {
  detail: AssessmentDetail
  state: FormState
  criteria: Criterion[]
  completing: boolean
  onJustification: (value: string) => void
  onGoTo: (step: string) => void
  onSaveBeforeExport: () => Promise<boolean>
  onPrepareInterview: (request: AssistantRequest) => void
  onComplete: () => Promise<boolean>
}) {
  return (
    <div>
      <h2 tabIndex={-1} data-step-heading className="font-serif text-display font-semibold text-ink focus:outline-none">
        {t.title}
      </h2>
      <ul className="mt-4 space-y-1">
        {criteria.map((c) => (
          <li key={c.competency.competency_id}>
            {c.competency.name}: {state.decisions[c.competency.competency_id]?.selected_level ?? t.table.noDecision}
          </li>
        ))}
      </ul>
    </div>
  )
}
