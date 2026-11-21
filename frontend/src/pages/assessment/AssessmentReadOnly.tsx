import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { AppLayout } from '../../layout/AppLayout'
import { ResultBadge } from '../../components/StatusBadge'
import { formatDate } from '../../lib/format'
import { texts } from '../../lib/texts'
import type { AssessmentDetail, CompetencyModel } from '../../types'
import { BackLink } from './BackLink'
import { DecisionsTable, EvaluationResultView, PdfButton, type DecisionRow } from './SummaryParts'

const t = texts.assessment.readOnly

/** Zakończona ocena: wyniki, decyzje i uzasadnienie tylko do odczytu, z pobraniem arkusza PDF. */
export function AssessmentReadOnly({ detail, model }: { detail: AssessmentDetail; model: CompetencyModel }) {
  const names = new Map(model.competencies.map((c) => [c.competency_id, c.name]))
  const rows: DecisionRow[] = detail.decisions.map((d) => ({
    competency_id: d.competency_id,
    name: names.get(d.competency_id) ?? d.competency_id,
    mandatory: d.is_mandatory,
    suggested: null,
    decision: d.selected_level,
    note: d.decision_note,
  }))
  const completed = detail.completed_at ? formatDate(detail.completed_at) : '—'

  return (
    <AppLayout
      withAssistant
      assistantContext={{
        subject: texts.assessment.assistant.subject(detail.employee_name, t.completedOn(completed)),
        note: texts.assessment.assistant.note,
        suggestions: texts.assessment.assistant.suggestions.summary,
      }}
    >
      <BackLink to={`/przelozony/pracownicy/${detail.employee_id}`} />
      <header className="flex items-start justify-between gap-6">
        <div>
          <h1 className="font-serif text-display font-semibold text-ink">
            {texts.assessment.title(detail.kind)}: {detail.employee_name}
          </h1>
          <p className="mt-1 flex items-center gap-2 text-ink-muted">
            <Lock aria-hidden className="size-4" />
            {t.readOnlyNote}
          </p>
        </div>
        {detail.kind === 'periodic' && (
          <PdfButton assessmentId={detail.id} employeeName={detail.employee_name} label={texts.assessment.summary.pdf} />
        )}
      </header>

      <dl className="mt-8 grid grid-cols-4 gap-x-8 gap-y-4 border-y border-line py-5">
        <Detail label={t.form}>{texts.forms[detail.form]}</Detail>
        <Detail label={t.completed}>{completed}</Detail>
        <Detail label={t.supervisor}>{detail.supervisor_name}</Detail>
        <Detail label={t.result}>{detail.result ? <ResultBadge result={detail.result} /> : '—'}</Detail>
      </dl>

      {detail.decisions.length === 0 ? (
        <p className="mt-8 rounded-md border border-dashed border-line-strong px-5 py-4 text-ink-muted">{t.noDetails}</p>
      ) : (
        <div className="mt-10 space-y-10">
          {detail.evaluation && (
            <section aria-labelledby="wynik">
              <h2 id="wynik" className="mb-3 text-title font-semibold text-ink">
                {texts.assessment.summary.result.title}
              </h2>
              <EvaluationResultView evaluation={detail.evaluation} />
            </section>
          )}
          <section aria-labelledby="decyzje">
            <h2 id="decyzje" className="mb-3 text-title font-semibold text-ink">
              {t.decisions}
            </h2>
            <DecisionsTable rows={rows} showSuggestion={false} decisionLabel={t.level} />
          </section>
          <section aria-labelledby="uzasadnienie">
            <h2 id="uzasadnienie" className="mb-3 text-title font-semibold text-ink">
              {t.justification}
            </h2>
            {detail.justification_draft.trim() ? (
              <p className="max-w-prose whitespace-pre-line text-ink">{detail.justification_draft}</p>
            ) : (
              <p className="text-ink-muted">{t.noJustification}</p>
            )}
          </section>
        </div>
      )}
    </AppLayout>
  )
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  )
}
