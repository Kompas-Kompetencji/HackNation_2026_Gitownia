import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { AppLayout } from '../../layout/AppLayout'
import { ResultBadge } from '../../components/StatusBadge'
import { formatDate } from '../../lib/format'
import { texts } from '../../lib/texts'
import type { AssessmentDetail, CompetencyModel } from '../../types'
import { BackLink } from './BackLink'
import { DecisionsTable, EvaluationResultView, EzdButton, PdfButton, type DecisionRow } from './SummaryParts'
import { FirstDataList } from './SummaryStep'

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
  const first = detail.kind === 'first' || detail.form === 'first'
  const tf = texts.firstAssessment

  return (
    <AppLayout
      withAssistant
      assistantContext={{
        subject: (first ? tf.assistant.subject : texts.assessment.assistant.subject)(detail.employee_name, t.completedOn(completed)),
        note: texts.assessment.assistant.note,
        suggestions: first ? tf.assistant.suggestions.summary : texts.assessment.assistant.suggestions.summary,
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
        {(detail.kind === 'periodic' || first) && (
          <div className="flex items-start gap-3">
            <PdfButton assessmentId={detail.id} employeeName={detail.employee_name} label={texts.assessment.summary.pdf} />
            <EzdButton assessmentId={detail.id} />
          </div>
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
              <EvaluationResultView evaluation={detail.evaluation} meanLabel={first ? tf.summary.mean : undefined} />
              {first && (
                <p className="mt-3 max-w-prose text-sm text-ink-muted">
                  {detail.evaluation.result === 'negative' ? tf.readOnly.afterNegative : tf.readOnly.afterPositive}
                </p>
              )}
            </section>
          )}
          {first && (
            <section aria-labelledby="dane-pierwszej">
              <h2 id="dane-pierwszej" className="mb-1 text-title font-semibold text-ink">
                {tf.readOnly.data}
              </h2>
              <FirstDataList data={detail} />
            </section>
          )}
          <section aria-labelledby="decyzje">
            <h2 id="decyzje" className="mb-3 text-title font-semibold text-ink">
              {first ? tf.readOnly.decisions : t.decisions}
            </h2>
            <DecisionsTable
              rows={rows}
              showSuggestion={false}
              decisionLabel={t.level}
              caption={first ? tf.summary.caption : undefined}
              criterionLabel={first ? tf.summary.element : undefined}
              showKind={!first}
            />
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
          <section aria-labelledby="wnioski">
            <h2 id="wnioski" className="mb-3 text-title font-semibold text-ink">
              {detail.form === 'first' ? t.conclusionsFirst : t.conclusions}
            </h2>
            {detail.development_conclusions?.trim() ? (
              <p className="max-w-prose whitespace-pre-line text-ink">{detail.development_conclusions}</p>
            ) : (
              <p className="text-ink-muted">{t.noConclusions}</p>
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
