import { AppLayout } from '../../layout/AppLayout'
import { texts } from '../../lib/texts'
import type { AssessmentDetail, CompetencyModel } from '../../types'
import { BackLink } from './BackLink'

/** Widok zakończonej oceny tylko do odczytu (pełna wersja w części c etapu 4). */
export function AssessmentReadOnly({ detail }: { detail: AssessmentDetail; model: CompetencyModel }) {
  return (
    <AppLayout withAssistant>
      <BackLink to={`/przelozony/pracownicy/${detail.employee_id}`} />
      <h1 className="font-serif text-display font-semibold text-ink">
        {texts.assessment.title(detail.kind)}: {detail.employee_name}
      </h1>
      <p className="mt-2 text-ink-muted">{texts.assessment.readOnly.readOnlyNote}</p>
    </AppLayout>
  )
}
