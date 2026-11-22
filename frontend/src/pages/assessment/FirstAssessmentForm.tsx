import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBlocker, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CircleAlert, LoaderCircle } from 'lucide-react'
import { AppLayout } from '../../layout/AppLayout'
import { Button } from '../../components/ui'
import { Dialog } from '../../components/Dialog'
import type { AssistantContext, AssistantRequest, AssistantSuggestion } from '../../assistant/AssistantPanel'
import {
  completeAssessment,
  getAssessmentTemplate,
  getEmployee,
  getFirstAssessmentSchedule,
  saveAssessmentDraft,
} from '../../lib/api'
import { formatDate } from '../../lib/format'
import { texts } from '../../lib/texts'
import type {
  AssessmentDetail,
  AssessmentTemplate,
  BehavioralIndicator,
  CompetencyModel,
  FirstAssessmentFields,
  JobDescriptionDocument,
  Level,
  Note,
} from '../../types'
import type { SectionState } from '../employee/sectionState'
import {
  criterionStatus,
  criterionStep,
  FIRST_DATA_STEP,
  FIRST_LEVELS,
  isBlocked,
  SUMMARY_STEP,
  toDraftInput,
  type Criterion,
  type FormState,
  type LocalAnswer,
} from './model'
import { Stepper } from './Stepper'
import { CriterionContainer, SaveStatus, type SaveState } from './AssessmentForm'
import { FirstDataStep, type ScheduleState } from './FirstDataStep'
import { SummaryStep } from './SummaryStep'
import { BackLink } from './BackLink'

const t = texts.assessment
const tf = texts.firstAssessment
const AUTOSAVE_MS = 2500

type FirstState = FormState<'first'> & { first: FirstAssessmentFields }

/**
 * Stan z zapisanego szkicu. Szkice sprzed formularza (także w bazie wdrożenia) mogą mieć niepełne
 * dane albo poziomy spoza skali 3/5/7: takie decyzje pomijamy, żeby przełożony wybrał je ponownie.
 */
function initialState(detail: AssessmentDetail): FirstState {
  return {
    form: 'first',
    additional: [],
    answers: Object.fromEntries((detail.answers ?? []).map((a) => [a.indicator_id, { ...a }])),
    decisions: Object.fromEntries(
      (detail.decisions ?? []).map((d) => [
        d.competency_id,
        {
          selected_level: d.selected_level !== null && FIRST_LEVELS.includes(d.selected_level) ? d.selected_level : null,
          decision_note: d.decision_note ?? '',
        },
      ]),
    ),
    justification: detail.justification_draft ?? '',
    conclusions: detail.development_conclusions ?? '',
    step: detail.last_step ?? FIRST_DATA_STEP,
    first: {
      exam_status: detail.exam_status ?? null,
      report_on_time: detail.report_on_time ?? null,
      initial_interview_date: detail.initial_interview_date ?? null,
      evaluation_interview_date: detail.evaluation_interview_date ?? null,
    },
  }
}

/** Formularz pierwszej oceny: dane pierwszej oceny, pięć elementów (skala 3/5/7), podsumowanie. */
export function FirstAssessmentForm({
  detail,
  model,
  notes,
}: {
  detail: AssessmentDetail
  model: CompetencyModel
  notes: SectionState<Note[]>
  docs: SectionState<JobDescriptionDocument[]>
}) {
  const navigate = useNavigate()
  const [state, setState] = useState<FirstState>(() => initialState(detail))
  const [version, setVersion] = useState(0)
  const [savedVersion, setSavedVersion] = useState(0)
  const [saveState, setSaveState] = useState<SaveState>(detail.updated_at ? { kind: 'saved', at: detail.updated_at } : { kind: 'idle' })
  const [template, setTemplate] = useState<AssessmentTemplate | null>(null)
  const [templateError, setTemplateError] = useState(false)
  const [templateAttempt, setTemplateAttempt] = useState(0)
  const [schedule, setSchedule] = useState<ScheduleState>({ kind: 'loading' })
  const [scheduleAttempt, setScheduleAttempt] = useState(0)
  const [activeIndicator, setActiveIndicator] = useState<string | null>(null)
  const [assistantRequest, setAssistantRequest] = useState<AssistantRequest>()
  const [leaveSaveFailed, setLeaveSaveFailed] = useState(false)
  const [completing, setCompleting] = useState(false)
  const leavingRef = useRef(false)
  const focusOnStepChange = useRef(false)
  const saveOnStepChange = useRef(false)

  const dirty = version !== savedVersion
  const byId = useMemo(() => new Map(model.competencies.map((c) => [c.competency_id, c])), [model])

  /* Pięć elementów pierwszej oceny z backendu (GET /competencies?form_type=FIRST_EVAL_FORM). */
  useEffect(() => {
    let active = true
    setTemplateError(false)
    getAssessmentTemplate('first')
      .then((tpl) => active && setTemplate(tpl))
      .catch(() => active && setTemplateError(true))
    return () => {
      active = false
    }
  }, [templateAttempt])

  /* Terminy pierwszej oceny z backendu (z danych umowy pracownika). */
  useEffect(() => {
    let active = true
    setSchedule({ kind: 'loading' })
    getEmployee(detail.employee_id)
      .then((employee) => {
        if (!employee) throw new Error('brak pracownika')
        return getFirstAssessmentSchedule({
          hire_date: employee.hire_date,
          contract_type: employee.contract_type,
          contract_end_date: employee.contract_end_date ?? null,
          first_eval_agreement_date: employee.first_eval_agreement_date ?? null,
        })
      })
      .then((data) => active && setSchedule({ kind: 'ready', data }))
      .catch(() => active && setSchedule({ kind: 'error' }))
    return () => {
      active = false
    }
  }, [detail.employee_id, scheduleAttempt])

  const criteria: Criterion[] = useMemo(
    () =>
      (template?.mandatory_competency_ids ?? []).flatMap((id) => {
        const competency = byId.get(id)
        return competency ? [{ competency, mandatory: true }] : []
      }),
    [template, byId],
  )

  const steps = useMemo(() => [FIRST_DATA_STEP, ...criteria.map((c) => criterionStep(c.competency.competency_id)), SUMMARY_STEP], [criteria])
  // Krok spoza listy (np. ze starego szkicu) albo zanim przyjdą elementy → dane pierwszej oceny.
  const currentStep = template && steps.includes(state.step) ? state.step : FIRST_DATA_STEP
  const stepIndex = steps.indexOf(currentStep)
  const currentCriterion = criteria.find((c) => criterionStep(c.competency.competency_id) === currentStep) ?? null
  const currentBlocked = currentCriterion ? isBlocked(state, currentCriterion.competency) : false

  /* ------------------------------ zapis ------------------------------ */

  const stateRef = useRef(state)
  const criteriaRef = useRef(criteria)
  const versionRef = useRef(version)
  useEffect(() => {
    stateRef.current = state
    criteriaRef.current = criteria
    versionRef.current = version
  })

  const save = useCallback(async (): Promise<boolean> => {
    if (criteriaRef.current.length === 0) return false
    const savingVersion = versionRef.current
    setSaveState({ kind: 'saving' })
    try {
      const saved = await saveAssessmentDraft(detail.id, toDraftInput(stateRef.current, criteriaRef.current))
      setSavedVersion(savingVersion)
      setSaveState({ kind: 'saved', at: saved.updated_at ?? new Date().toISOString() })
      return true
    } catch {
      setSaveState({ kind: 'error' })
      return false
    }
  }, [detail.id])

  useEffect(() => {
    if (!dirty || !template || saveState.kind === 'saving' || saveState.kind === 'error') return
    const timer = setTimeout(() => void save(), AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [dirty, version, savedVersion, template, save, saveState.kind])

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && !leavingRef.current && currentLocation.pathname !== nextLocation.pathname,
  )
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  /* ----------------------------- zmiany ------------------------------ */

  const update = useCallback((change: (s: FirstState) => FirstState) => {
    setState(change)
    setVersion((v) => v + 1)
  }, [])

  function setAnswer(indicator: BehavioralIndicator, patch: Partial<Pick<LocalAnswer, 'selected_level' | 'star_note'>>) {
    update((s) => {
      const previous = s.answers[indicator.indicator_id]
      return {
        ...s,
        answers: {
          ...s.answers,
          [indicator.indicator_id]: {
            competency_id: indicator.competency_id,
            indicator_id: indicator.indicator_id,
            selected_level: previous?.selected_level,
            star_note: previous?.star_note ?? null,
            ...patch,
          },
        },
      }
    })
  }

  function setDecision(competency_id: string, patch: { selected_level?: Level; decision_note?: string }) {
    update((s) => {
      const previous = s.decisions[competency_id] ?? { selected_level: null, decision_note: '' }
      return { ...s, decisions: { ...s.decisions, [competency_id]: { ...previous, ...patch } } }
    })
  }

  /* --------------------------- nawigacja ----------------------------- */

  function goTo(step: string) {
    const target = steps.indexOf(step)
    if (currentBlocked && target > stepIndex && step !== SUMMARY_STEP) {
      document.getElementById('blokada-kryterium')?.focus()
      return
    }
    focusOnStepChange.current = true
    saveOnStepChange.current = true
    // Krok zapisuje się razem z resztą szkicu, żeby wznowienie wracało w to samo miejsce.
    update((s) => ({ ...s, step }))
  }

  /* Przejście między krokami to moment zapisu (po aktualizacji stateRef w efekcie wyżej). */
  useEffect(() => {
    if (!saveOnStepChange.current) return
    saveOnStepChange.current = false
    void save()
  }, [state.step, save])

  useEffect(() => {
    if (!focusOnStepChange.current) return
    focusOnStepChange.current = false
    window.scrollTo({ top: 0 })
    document.querySelector<HTMLElement>('[data-step-heading]')?.focus()
  }, [currentStep])

  /* --------------------------- zakończenie --------------------------- */

  async function complete(): Promise<boolean> {
    setCompleting(true)
    try {
      const done = await completeAssessment(detail.id, toDraftInput(state, criteria))
      leavingRef.current = true
      navigate(`/przelozony/pracownicy/${detail.employee_id}`, { state: { completedResult: done.result, completedKind: 'first' } })
      return true
    } catch {
      setCompleting(false)
      return false
    }
  }

  /* ---------------------------- asystent ----------------------------- */

  function buildAssistantContext(): AssistantContext {
    const a = t.assistant
    const fa = tf.assistant
    if (currentCriterion) {
      const c = currentCriterion.competency
      const indicator = c.indicators.find((i) => i.indicator_id === activeIndicator) ?? c.indicators[0]
      const base = `${fa.context} ${fa.element(c.name, c.competency_id)}`
      const decision = state.decisions[c.competency_id]?.selected_level
      const ask = (label: string, extra = '') => ({ label, question: `${base}${extra}\n${a.context.question(label)}` })
      const interview: AssistantSuggestion[] = [ask(a.suggestions.criterion.justifyLevel(3))]
      if (decision && decision !== 3) interview.unshift(ask(a.suggestions.criterion.justifyLevel(decision)))
      return {
        subject: fa.subject(detail.employee_name, c.name),
        note: a.note,
        suggestions: {
          formal: [
            ask(a.suggestions.criterion.whatIndicator, indicator ? ` ${a.context.indicator(indicator.indicator_id, indicator.description)}` : ''),
            a.suggestions.criterion.noBasis,
          ],
          interview,
        },
      }
    }
    const summary = currentStep === SUMMARY_STEP
    return {
      subject: fa.subject(detail.employee_name, summary ? t.stepper.summary : tf.stepper.data),
      note: a.note,
      suggestions: summary ? fa.suggestions.summary : fa.suggestions.data,
    }
  }

  /* ------------------------------ widok ------------------------------ */

  const decisionsById = Object.fromEntries(criteria.map((c) => [c.competency.competency_id, state.decisions[c.competency.competency_id]?.selected_level ?? null]))
  const statuses = Object.fromEntries(criteria.map((c) => [c.competency.competency_id, criterionStatus(state, c.competency)]))
  const nextStep = steps[stepIndex + 1]
  const nextCriterion = criteria.find((c) => criterionStep(c.competency.competency_id) === nextStep)

  return (
    <AppLayout withAssistant assistantContext={buildAssistantContext()} assistantRequest={assistantRequest}>
      <BackLink to={`/przelozony/pracownicy/${detail.employee_id}`} />
      <header className="mb-6">
        <h1 className="font-serif text-display font-semibold text-ink">
          {t.title('first')}: {detail.employee_name}
        </h1>
        <p className="mt-1 text-ink-muted">
          {tf.subtitle}
          <span aria-hidden> · </span>
          {t.dueLabel(formatDate(detail.due_date))}
        </p>
      </header>

      <div className="sticky top-16 z-20 -mx-10 mb-8 flex min-h-14 items-center justify-between gap-4 border-y border-line bg-paper/95 px-10 py-2 backdrop-blur-sm">
        <p className="font-medium text-ink tabular-nums">
          {currentCriterion
            ? tf.progress.element(criteria.indexOf(currentCriterion) + 1, criteria.length)
            : currentStep === SUMMARY_STEP
              ? t.progress.summary
              : tf.progress.data}
        </p>
        <SaveStatus state={saveState} dirty={dirty} onSave={() => void save()} disabled={!template} />
      </div>

      {templateError && (
        <div role="alert" className="mb-6 flex items-center gap-3 rounded-md bg-danger-soft px-4 py-3 text-danger">
          <CircleAlert aria-hidden className="size-4 shrink-0" />
          <span className="flex-1">{t.setup.templateError}</span>
          <Button variant="secondary" onClick={() => setTemplateAttempt((n) => n + 1)} className="py-1.5 text-sm">
            {texts.common.retry}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-[13rem_minmax(0,1fr)] gap-10">
        <Stepper
          criteria={criteria}
          current={currentStep}
          statuses={statuses}
          decisions={decisionsById}
          onSelect={goTo}
          setupStep={FIRST_DATA_STEP}
          setupLabel={tf.stepper.data}
          mandatoryTitle={tf.stepper.elements}
        />

        <div>
          {currentStep === FIRST_DATA_STEP && (
            <FirstDataStep
              value={state.first}
              schedule={schedule}
              onRetrySchedule={() => setScheduleAttempt((n) => n + 1)}
              onChange={(patch) => update((s) => ({ ...s, first: { ...s.first, ...patch } }))}
            />
          )}

          {currentCriterion && (
            <CriterionContainer
              key={currentCriterion.competency.competency_id}
              variant="first"
              criterion={currentCriterion}
              position={criteria.indexOf(currentCriterion) + 1}
              total={criteria.length}
              state={state}
              notes={notes}
              blocked={currentBlocked}
              onAnswer={setAnswer}
              onDecision={(patch) => setDecision(currentCriterion.competency.competency_id, patch)}
              onRemove={() => undefined}
              onActiveIndicator={(i) => setActiveIndicator(i.indicator_id)}
            />
          )}

          {currentStep === SUMMARY_STEP && (
            <SummaryStep
              detail={detail}
              state={state}
              criteria={criteria}
              completing={completing}
              onJustification={(justification) => update((s) => ({ ...s, justification }))}
              onConclusions={(conclusions) => update((s) => ({ ...s, conclusions }))}
              onGoTo={goTo}
              onSaveBeforeExport={save}
              onPrepareInterview={(request) => setAssistantRequest(request)}
              onComplete={complete}
            />
          )}

          {currentStep !== SUMMARY_STEP && (
            <div className="mt-10 flex items-center justify-between gap-3 border-t border-line pt-6">
              {stepIndex > 0 ? (
                <Button variant="secondary" onClick={() => goTo(steps[stepIndex - 1])}>
                  <ArrowLeft aria-hidden className="size-4" />
                  {t.nav.back}
                </Button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-4">
                {currentBlocked && (
                  <p id="dalej-zablokowane" className="flex max-w-xs items-start gap-1.5 text-right text-sm text-danger">
                    <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                    {tf.nav.blocked}
                  </p>
                )}
                <Button
                  onClick={() => goTo(nextStep)}
                  disabled={!template}
                  aria-disabled={currentBlocked && nextStep !== SUMMARY_STEP ? true : undefined}
                  aria-describedby={currentBlocked ? 'dalej-zablokowane' : undefined}
                  className={currentBlocked && nextStep !== SUMMARY_STEP ? 'cursor-not-allowed opacity-60' : ''}
                >
                  {!template && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
                  {nextCriterion ? t.nav.next(nextCriterion.competency.name) : t.nav.toSummary}
                  <ArrowRight aria-hidden className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={blocker.state === 'blocked'}
        title={t.leave.title}
        onCancel={() => {
          setLeaveSaveFailed(false)
          blocker.reset?.()
        }}
        actions={
          <>
            <Button
              onClick={async () => {
                setLeaveSaveFailed(false)
                if (await save()) blocker.proceed?.()
                else setLeaveSaveFailed(true)
              }}
              disabled={saveState.kind === 'saving'}
            >
              {saveState.kind === 'saving' && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
              {t.leave.saveAndLeave}
            </Button>
            <Button variant="secondary" onClick={() => blocker.proceed?.()}>
              {t.leave.leaveWithoutSaving}
            </Button>
            <Button
              variant="secondary"
              className="mr-auto border-transparent"
              onClick={() => {
                setLeaveSaveFailed(false)
                blocker.reset?.()
              }}
            >
              {t.leave.stay}
            </Button>
          </>
        }
      >
        <p>{t.leave.body}</p>
        {leaveSaveFailed && (
          <p role="alert" className="mt-3 flex items-start gap-2 text-danger">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {t.leave.saveFailed}
          </p>
        )}
      </Dialog>
    </AppLayout>
  )
}
