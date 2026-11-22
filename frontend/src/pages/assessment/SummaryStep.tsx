import { useEffect, useId, useRef, useState } from 'react'
import { CircleAlert, LoaderCircle, MessagesSquare, PencilLine, RotateCcw } from 'lucide-react'
import type { AssistantRequest } from '../../assistant/AssistantPanel'
import { Button } from '../../components/ui'
import { Dialog } from '../../components/Dialog'
import { calculateScore, evaluateAssessment, evaluateFirstAssessment } from '../../lib/api'
import { formatDate } from '../../lib/format'
import { texts } from '../../lib/texts'
import type { AssessmentDetail, AssessmentEvaluation, FirstAssessmentFields, Level } from '../../types'
import { answersFor, criterionStep, FIRST_DATA_STEP, isBlocked, toFirstScaleHint, type AnyFormState, type Criterion } from './model'
import { DecisionsTable, EvaluationResultView, PdfButton, type DecisionRow } from './SummaryParts'

const t = texts.assessment.summary
const tf = texts.firstAssessment

type EvalState =
  | { kind: 'incomplete' }
  | { kind: 'loading'; previous: AssessmentEvaluation | null }
  | { kind: 'ready'; evaluation: AssessmentEvaluation }
  | { kind: 'error' }

/** Podsumowanie: decyzje, wynik z backendu, uzasadnienie, rozmowa, PDF i zakończenie oceny. */
export function SummaryStep({
  detail,
  state,
  criteria,
  completing,
  onJustification,
  onGoTo,
  onSaveBeforeExport,
  onPrepareInterview,
  onComplete,
}: {
  detail: AssessmentDetail
  state: AnyFormState
  criteria: Criterion[]
  completing: boolean
  onJustification: (value: string) => void
  onGoTo: (step: string) => void
  onSaveBeforeExport: () => Promise<boolean>
  onPrepareInterview: (request: AssistantRequest) => void
  onComplete: () => Promise<boolean>
}) {
  const uid = useId()
  const first = state.form === 'first'
  const firstData = state.first
  const firstDataMissing = first && (firstData?.exam_status == null || firstData?.report_on_time == null)
  const [suggestions, setSuggestions] = useState<Record<string, Level | null>>({})
  const [evalState, setEvalState] = useState<EvalState>({ kind: 'incomplete' })
  const [attempted, setAttempted] = useState(false)
  const [attemptId, setAttemptId] = useState(0)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [completeError, setCompleteError] = useState(false)
  const [evalAttempt, setEvalAttempt] = useState(0)
  const issuesRef = useRef<HTMLDivElement>(null)
  const justificationRef = useRef<HTMLTextAreaElement>(null)

  /* Wskazówki dla tabeli: ta sama funkcja backendu co w krokach kryteriów. */
  useEffect(() => {
    let active = true
    for (const c of criteria) {
      const answers = answersFor(state, c.competency)
      const id = c.competency.competency_id
      if (answers.length === 0) {
        setSuggestions((s) => ({ ...s, [id]: null }))
        continue
      }
      calculateScore(answers)
        // Pierwsza ocena: wskazówka przeliczona na skalę 3/5/7 (tylko podpowiedź).
        .then((r) => active && setSuggestions((s) => ({ ...s, [id]: first ? toFirstScaleHint(r.suggested_level) : r.suggested_level })))
        .catch(() => active && setSuggestions((s) => ({ ...s, [id]: null })))
    }
    return () => {
      active = false
    }
    // Liczymy raz po wejściu w podsumowanie; odpowiedzi zmieniają się tylko w krokach kryteriów.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows: DecisionRow[] = criteria.map((c) => {
    const id = c.competency.competency_id
    return {
      competency_id: id,
      name: c.competency.name,
      mandatory: c.mandatory,
      suggested: id in suggestions ? suggestions[id] : undefined,
      decision: state.decisions[id]?.selected_level ?? null,
      note: state.decisions[id]?.decision_note ?? '',
      noEvidence:
        !!state.decisions[id]?.selected_level &&
        !c.competency.indicators.some((i) => state.answers[i.indicator_id]?.selected_level != null),
      step: criterionStep(id),
    }
  })

  const missing = criteria.filter((c) => !state.decisions[c.competency.competency_id]?.selected_level)
  const blocked = criteria.filter((c) => isBlocked(state, c.competency))
  // Decyzja bez ocenionego wskaźnika: walidacja formularza, ta sama zasada co blokada „brak podstaw".
  const noEvidence = criteria.filter(
    (c) =>
      state.decisions[c.competency.competency_id]?.selected_level &&
      !isBlocked(state, c.competency) &&
      !c.competency.indicators.some((i) => state.answers[i.indicator_id]?.selected_level != null),
  )
  const decisionKey = rows.map((r) => `${r.competency_id}:${r.decision}`).join('|')

  /* Wynik oceny z backendu, gdy wszystkie kryteria mają decyzję. */
  useEffect(() => {
    if (missing.length > 0 || criteria.length === 0 || firstDataMissing) {
      setEvalState({ kind: 'incomplete' })
      return
    }
    let active = true
    setEvalState((s) => ({ kind: 'loading', previous: s.kind === 'ready' ? s.evaluation : s.kind === 'loading' ? s.previous : null }))
    const decisions = criteria.map((c) => ({
      competency_id: c.competency.competency_id,
      is_mandatory: c.mandatory,
      selected_level: state.decisions[c.competency.competency_id]!.selected_level!,
    }))
    const request =
      state.form === 'first'
        ? evaluateFirstAssessment({
            exam_status: firstData?.exam_status ?? null,
            report_on_time: firstData?.report_on_time ?? null,
            justification_draft: state.justification,
            decisions,
          })
        : evaluateAssessment({ form: state.form, justification_draft: state.justification, decisions })
    request
      .then((evaluation) => active && setEvalState({ kind: 'ready', evaluation }))
      .catch(() => active && setEvalState({ kind: 'error' }))
    return () => {
      active = false
    }
    // Uzasadnienie nie zmienia wyniku; przeliczamy tylko po zmianie decyzji lub arkusza.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionKey, state.form, evalAttempt, firstData?.exam_status, firstData?.report_on_time])

  const evaluation = evalState.kind === 'ready' ? evalState.evaluation : evalState.kind === 'loading' ? evalState.previous : null
  const justificationRequired = evaluation?.justification_required ?? false
  const justificationMissing = justificationRequired && !state.justification.trim()

  const issues: Array<{ text: string; step?: string; focus?: 'justification' }> = [
    ...(first && firstData?.exam_status == null ? [{ text: tf.summary.issues.exam, step: FIRST_DATA_STEP }] : []),
    ...(first && firstData?.report_on_time == null ? [{ text: tf.summary.issues.report, step: FIRST_DATA_STEP }] : []),
    ...missing.map((c) => ({ text: t.issues.missingDecision(c.competency.name), step: criterionStep(c.competency.competency_id) })),
    ...blocked.map((c) => ({ text: t.issues.blocked(c.competency.name), step: criterionStep(c.competency.competency_id) })),
    ...noEvidence.map((c) => ({ text: t.issues.noEvidence(c.competency.name), step: criterionStep(c.competency.competency_id) })),
    ...(justificationMissing ? [{ text: t.issues.justification, focus: 'justification' as const }] : []),
    ...(missing.length === 0 && !firstDataMissing && evalState.kind !== 'ready' ? [{ text: t.issues.resultPending }] : []),
  ]

  // Po nieudanej próbie zakończenia fokus przechodzi na listę braków (po jej wyrenderowaniu).
  useEffect(() => {
    if (attemptId > 0) issuesRef.current?.focus()
  }, [attemptId])

  function handleComplete() {
    setAttempted(true)
    setCompleteError(false)
    if (issues.length > 0) {
      setAttemptId((n) => n + 1)
      return
    }
    setConfirmOpen(true)
  }

  async function confirmComplete() {
    const ok = await onComplete()
    if (!ok) {
      setConfirmOpen(false)
      setCompleteError(true)
    }
  }

  function prepareInterview() {
    const a = texts.assessment.assistant
    const lines = [
      state.form === 'first' ? tf.assistant.context : a.context.form(state.form),
      ...rows.map((r) => a.context.row(r.name, r.decision, r.suggested ?? null)),
      ...(evaluation ? [a.context.result(texts.employee.result[evaluation.result], evaluation.overall_level)] : []),
      a.context.question(a.prepareQuestion),
    ]
    onPrepareInterview({ id: crypto.randomUUID(), mode: 'interview', label: a.prepareLabel, question: lines.join('\n') })
  }

  const resultLabel = evaluation ? texts.employee.result[evaluation.result] : ''

  return (
    <div>
      <h2 tabIndex={-1} data-step-heading className="font-serif text-display font-semibold text-ink focus:outline-none">
        {t.title}
      </h2>
      <p className="mt-2 max-w-prose text-ink-muted">{first ? tf.summary.lead : t.lead}</p>

      {first && (
        <section aria-labelledby="dane-pierwszej-oceny" className="mt-6 rounded-md border border-line bg-surface px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <h3 id="dane-pierwszej-oceny" className="font-semibold text-ink">
              {tf.summary.conditions}
            </h3>
            <button
              type="button"
              onClick={() => onGoTo(FIRST_DATA_STEP)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-accent transition-colors duration-150 hover:bg-accent-soft"
            >
              <PencilLine aria-hidden className="size-3.5" />
              {tf.summary.edit}
            </button>
          </div>
          <FirstDataList data={firstData} />
        </section>
      )}

      <div className="mt-6">
        <DecisionsTable
          rows={rows}
          onEdit={onGoTo}
          caption={first ? tf.summary.caption : undefined}
          criterionLabel={first ? tf.summary.element : undefined}
        />
      </div>

      <section aria-labelledby="wynik-oceny" className="mt-10">
        <h3 id="wynik-oceny" className="mb-3 text-title font-semibold text-ink">
          {t.result.title}
        </h3>
        <div aria-live="polite" aria-busy={evalState.kind === 'loading'}>
          {evalState.kind === 'incomplete' && (
            <p className="rounded-md border border-dashed border-line-strong px-5 py-4 text-ink-muted">
              {first ? tf.summary.missingResult : t.result.missing(missing.length)}
            </p>
          )}
          {evalState.kind === 'loading' && !evalState.previous && (
            <p className="flex items-center gap-2 text-ink-muted">
              <LoaderCircle aria-hidden className="size-4 animate-spin" />
              {t.result.loading}
            </p>
          )}
          {evalState.kind === 'error' && (
            <div role="alert" className="flex items-center gap-3 rounded-md bg-danger-soft px-4 py-3 text-danger">
              <CircleAlert aria-hidden className="size-4 shrink-0" />
              <span className="flex-1">{t.result.error}</span>
              <Button variant="secondary" onClick={() => setEvalAttempt((n) => n + 1)} className="py-1.5 text-sm">
                <RotateCcw aria-hidden className="size-3.5" />
                {texts.common.retry}
              </Button>
            </div>
          )}
          {evaluation && (
            <div className={`transition-opacity duration-150 ${evalState.kind === 'loading' ? 'opacity-60' : ''}`}>
              <EvaluationResultView evaluation={evaluation} />
            </div>
          )}
        </div>
      </section>

      <section className="mt-10">
        <label htmlFor={`${uid}-uzasadnienie`} className="block text-title font-semibold text-ink">
          {t.justification.label}{' '}
          <span className={`text-base font-normal ${justificationRequired ? 'text-danger' : 'text-ink-muted'}`}>
            ({justificationRequired ? t.justification.required : t.justification.optional})
          </span>
        </label>
        <p id={`${uid}-uzasadnienie-opis`} className="mt-1 text-sm text-ink-muted">
          {t.justification.hint}
        </p>
        <textarea
          ref={justificationRef}
          id={`${uid}-uzasadnienie`}
          rows={6}
          value={state.justification}
          onChange={(e) => onJustification(e.target.value)}
          required={justificationRequired}
          aria-invalid={attempted && justificationMissing}
          aria-describedby={`${uid}-uzasadnienie-opis${attempted && justificationMissing ? ` ${uid}-uzasadnienie-blad` : ''}`}
          className={`mt-2 block w-full resize-y rounded-md border bg-surface px-3 py-2.5 text-ink focus-visible:outline-2 focus-visible:outline-offset-0 ${
            attempted && justificationMissing ? 'border-danger' : 'border-line-strong'
          }`}
        />
        {attempted && justificationMissing && (
          <p id={`${uid}-uzasadnienie-blad`} className="mt-1.5 flex items-center gap-1.5 text-sm text-danger">
            <CircleAlert aria-hidden className="size-4" />
            {t.justification.error}
          </p>
        )}
      </section>

      <section className="mt-10 flex items-start gap-6 rounded-md bg-sunken px-5 py-4">
        <div className="flex-1">
          <Button variant="secondary" onClick={prepareInterview} className="whitespace-nowrap">
            <MessagesSquare aria-hidden className="size-4" />
            {t.prepareInterview}
          </Button>
          <p className="mt-1.5 text-xs text-ink-muted">{t.prepareInterviewHint}</p>
        </div>
        <PdfButton
          assessmentId={detail.id}
          employeeName={detail.employee_name}
          label={t.pdfDraft}
          beforeExport={onSaveBeforeExport}
        />
      </section>

      {attempted && issues.length > 0 && (
        <div
          ref={issuesRef}
          tabIndex={-1}
          role="alert"
          className="mt-8 rounded-md border border-danger/40 bg-danger-soft px-5 py-4 focus:outline-2 focus:outline-offset-2 focus:outline-danger"
        >
          <p className="flex items-center gap-2 font-semibold text-danger">
            <CircleAlert aria-hidden className="size-4" />
            {t.issues.title}
          </p>
          <ul className="mt-2 space-y-1 pl-6">
            {issues.map((issue) => (
              <li key={issue.text} className="flex items-center gap-3 text-ink">
                <span>{issue.text}</span>
                {(issue.step || issue.focus) && (
                  <button
                    type="button"
                    onClick={() => (issue.step ? onGoTo(issue.step) : justificationRef.current?.focus())}
                    className="rounded-md px-1.5 py-0.5 text-sm font-medium text-accent underline underline-offset-2 hover:bg-surface"
                  >
                    {t.issues.goTo}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {completeError && (
        <p role="alert" className="mt-6 flex items-start gap-2 rounded-md bg-danger-soft px-4 py-3 text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t.completeError}
        </p>
      )}

      <div className="mt-10 flex items-center justify-between gap-3 border-t border-line pt-6">
        <Button variant="secondary" onClick={() => onGoTo(criterionStep(criteria[criteria.length - 1]?.competency.competency_id ?? ''))}>
          {texts.assessment.nav.back}
        </Button>
        <Button onClick={handleComplete} disabled={completing}>
          {completing && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
          {completing ? t.completing : t.complete}
        </Button>
      </div>

      <Dialog
        open={confirmOpen}
        title={t.confirm.title}
        onCancel={() => !completing && setConfirmOpen(false)}
        actions={
          <>
            <Button onClick={() => void confirmComplete()} disabled={completing}>
              {completing && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
              {completing ? t.completing : t.confirm.confirm}
            </Button>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={completing}>
              {t.confirm.cancel}
            </Button>
          </>
        }
      >
        <p>{first ? tf.summary.confirmBody(resultLabel) : t.confirm.body(resultLabel)}</p>
      </Dialog>
    </div>
  )
}

/** Dane pierwszej oceny (rozmowy, sprawozdanie, egzamin): podsumowanie i widok tylko do odczytu. */
export function FirstDataList({ data }: { data: Partial<FirstAssessmentFields> | undefined }) {
  const d = tf.data
  const missing = (
    <span className="inline-flex items-center gap-1 text-danger">
      <CircleAlert aria-hidden className="size-3.5" />
      {d.notSet}
    </span>
  )
  const report = data?.report_on_time == null ? missing : data.report_on_time ? d.reportOptions.yes : d.reportOptions.no
  const exam = data?.exam_status ? d.examOptions[data.exam_status].label : missing
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
      <div>
        <dt className="text-ink-muted">{d.initialInterview}</dt>
        <dd className="mt-0.5 text-ink tabular-nums">{data?.initial_interview_date ? formatDate(data.initial_interview_date) : '—'}</dd>
      </div>
      <div>
        <dt className="text-ink-muted">{d.evaluationInterview}</dt>
        <dd className="mt-0.5 text-ink tabular-nums">
          {data?.evaluation_interview_date ? formatDate(data.evaluation_interview_date) : '—'}
        </dd>
      </div>
      <div>
        <dt className="text-ink-muted">{d.report}</dt>
        <dd className="mt-0.5 text-ink">{report}</dd>
      </div>
      <div>
        <dt className="text-ink-muted">{d.exam}</dt>
        <dd className="mt-0.5 text-ink">{exam}</dd>
      </div>
    </dl>
  )
}
