import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useBlocker, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CircleAlert, CircleCheck, LoaderCircle, Save } from 'lucide-react'
import { AppLayout } from '../../layout/AppLayout'
import { Button } from '../../components/ui'
import { Dialog } from '../../components/Dialog'
import type { AssistantContext, AssistantRequest, AssistantSuggestion } from '../../assistant/AssistantPanel'
import { completeAssessment, getAssessmentTemplate, saveAssessmentDraft } from '../../lib/api'
import { formatDate } from '../../lib/format'
import { texts } from '../../lib/texts'
import type {
  AssessmentDetail,
  AssessmentForm as FormLetter,
  AssessmentTemplate,
  BehavioralIndicator,
  CompetencyModel,
  JobDescriptionDocument,
  Level,
  Note,
} from '../../types'
import type { SectionState } from '../employee/sectionState'
import {
  answersFor,
  criterionStatus,
  criterionStep,
  isBlocked,
  SETUP_STEP,
  SUMMARY_STEP,
  toDraftInput,
  type Criterion,
  type FormState,
  type LocalAnswer,
} from './model'
import { Stepper } from './Stepper'
import { SetupStep } from './SetupStep'
import { CriterionStep } from './CriterionStep'
import { SummaryStep } from './SummaryStep'
import { useScoreHint } from './useScoreHint'
import { BackLink } from './BackLink'

const t = texts.assessment
const AUTOSAVE_MS = 2500

export type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: string } | { kind: 'error' }

function initialState(detail: AssessmentDetail): FormState {
  return {
    form: detail.form === 'B' ? 'B' : 'C',
    additional: detail.additional_competency_ids ?? [],
    answers: Object.fromEntries(detail.answers.map((a) => [a.indicator_id, { ...a }])),
    decisions: Object.fromEntries(
      detail.decisions.map((d) => [d.competency_id, { selected_level: d.selected_level, decision_note: d.decision_note }]),
    ),
    justification: detail.justification_draft,
    conclusions: detail.development_conclusions ?? '',
    step: detail.last_step ?? SETUP_STEP,
  }
}

/** Formularz oceny okresowej (arkusz B lub C): konfiguracja, kryteria, podsumowanie. */
export function AssessmentForm({
  detail,
  model,
  notes,
  docs,
}: {
  detail: AssessmentDetail
  model: CompetencyModel
  notes: SectionState<Note[]>
  docs: SectionState<JobDescriptionDocument[]>
}) {
  const navigate = useNavigate()
  const [state, setState] = useState<FormState>(() => initialState(detail))
  const [version, setVersion] = useState(0)
  const [savedVersion, setSavedVersion] = useState(0)
  const [saveState, setSaveState] = useState<SaveState>(
    detail.updated_at ? { kind: 'saved', at: detail.updated_at } : { kind: 'idle' },
  )
  const [templates, setTemplates] = useState<Partial<Record<FormLetter, AssessmentTemplate>>>({})
  const [templateError, setTemplateError] = useState(false)
  const [activeIndicator, setActiveIndicator] = useState<string | null>(null)
  const [assistantRequest, setAssistantRequest] = useState<AssistantRequest>()
  const [leaveSaveFailed, setLeaveSaveFailed] = useState(false)
  const [completing, setCompleting] = useState(false)
  const additionalTouched = useRef(detail.additional_competency_ids !== null)
  const leavingRef = useRef(false)
  const focusOnStepChange = useRef(false)

  const dirty = version !== savedVersion
  const template = templates[state.form] ?? null
  const byId = useMemo(() => new Map(model.competencies.map((c) => [c.competency_id, c])), [model])

  /* Szablon arkusza (kryteria obowiązkowe) z backendu, osobno dla B i C. */
  useEffect(() => {
    if (templates[state.form]) return
    let active = true
    setTemplateError(false)
    getAssessmentTemplate(state.form)
      .then((tpl) => active && setTemplates((all) => ({ ...all, [tpl.form]: tpl })))
      .catch(() => active && setTemplateError(true))
    return () => {
      active = false
    }
  }, [state.form, templates])

  /* Propozycja z opisu stanowiska: arkusz i kryteria dodatkowe, dopóki przełożony ich nie zmienił. */
  const source = docs.kind === 'ready' ? ([...docs.data].reverse().find((d) => d.analysis) ?? null) : null
  const suggestedAdditional = useMemo(
    () => (source?.analysis?.additional_criteria ?? []).map((c) => c.criterion_id).filter((id) => byId.has(id)),
    [source, byId],
  )
  useEffect(() => {
    if (additionalTouched.current || !template || suggestedAdditional.length === 0) return
    additionalTouched.current = true
    setState((s) => ({
      ...s,
      additional: suggestedAdditional.filter((id) => !template.mandatory_competency_ids.includes(id)).slice(0, template.max_additional),
    }))
  }, [template, suggestedAdditional])

  const criteria: Criterion[] = useMemo(() => {
    if (!template) return []
    const mandatory = template.mandatory_competency_ids.flatMap((id) => {
      const competency = byId.get(id)
      return competency ? [{ competency, mandatory: true }] : []
    })
    const additional = state.additional
      .filter((id) => !template.mandatory_competency_ids.includes(id))
      .flatMap((id) => {
        const competency = byId.get(id)
        return competency ? [{ competency, mandatory: false }] : []
      })
    return [...mandatory, ...additional]
  }, [template, state.additional, byId])

  const steps = useMemo(() => [SETUP_STEP, ...criteria.map((c) => criterionStep(c.competency.competency_id)), SUMMARY_STEP], [criteria])
  // Krok spoza listy (np. usunięte kryterium) albo zanim przyjdzie szablon → konfiguracja.
  const currentStep = template && steps.includes(state.step) ? state.step : template ? SETUP_STEP : state.step
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

  /* Ostrzeżenie przed wyjściem: w aplikacji (useBlocker) i przy zamknięciu karty (beforeunload). */
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !leavingRef.current && currentLocation.pathname !== nextLocation.pathname,
  )
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  /* ----------------------------- zmiany ------------------------------ */

  const update = useCallback((change: (s: FormState) => FormState) => {
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

  function toggleAdditional(competency_id: string) {
    additionalTouched.current = true
    update((s) => ({
      ...s,
      additional: s.additional.includes(competency_id)
        ? s.additional.filter((id) => id !== competency_id)
        : [...s.additional, competency_id],
    }))
  }

  function changeForm(form: FormLetter) {
    additionalTouched.current = true
    update((s) => ({ ...s, form }))
  }

  /* --------------------------- nawigacja ----------------------------- */

  function showStep(step: string) {
    focusOnStepChange.current = true
    setState((s) => ({ ...s, step }))
    // Przejście do innego kroku to naturalny moment zapisu.
    if (dirty) void save()
  }

  function goTo(step: string) {
    const target = steps.indexOf(step)
    // Podsumowanie zawsze dostępne (pokazuje braki i blokuje zakończenie); kolejne kryteria nie.
    if (currentBlocked && target > stepIndex && step !== SUMMARY_STEP) {
      document.getElementById('blokada-kryterium')?.focus()
      return
    }
    showStep(step)
  }

  function removeCurrentAdditional() {
    if (!currentCriterion || currentCriterion.mandatory) return
    const id = currentCriterion.competency.competency_id
    const next = steps[stepIndex + 1] ?? SUMMARY_STEP
    additionalTouched.current = true
    update((s) => ({ ...s, additional: s.additional.filter((a) => a !== id), step: next }))
    focusOnStepChange.current = true
  }

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
      navigate(`/przelozony/pracownicy/${detail.employee_id}`, { state: { completedResult: done.result } })
      return true
    } catch {
      setCompleting(false)
      return false
    }
  }

  /* ---------------------------- asystent ----------------------------- */

  const decisionsById = Object.fromEntries(criteria.map((c) => [c.competency.competency_id, state.decisions[c.competency.competency_id]?.selected_level ?? null]))
  const statuses = Object.fromEntries(criteria.map((c) => [c.competency.competency_id, criterionStatus(state, c.competency)]))
  const assistantContext = buildAssistantContext()

  function buildAssistantContext(): AssistantContext {
    const a = t.assistant
    const formCtx = a.context.form(state.form)
    if (currentCriterion) {
      const c = currentCriterion.competency
      const indicator = c.indicators.find((i) => i.indicator_id === activeIndicator) ?? c.indicators[0]
      const base = `${formCtx} ${a.context.criterion(c.name, c.competency_id)}`
      const decision = state.decisions[c.competency_id]?.selected_level
      const ask = (label: string, extra = '') => ({ label, question: `${base}${extra}\n${a.context.question(label)}` })
      const interview: AssistantSuggestion[] = [ask(a.suggestions.criterion.justifyLevel(1))]
      if (decision && decision !== 1) interview.unshift(ask(a.suggestions.criterion.justifyLevel(decision)))
      return {
        subject: a.subject(detail.employee_name, c.name),
        note: a.note,
        suggestions: {
          formal: [
            ask(a.suggestions.criterion.whatIndicator, ` ${a.context.indicator(indicator.indicator_id, indicator.description)}`),
            a.suggestions.criterion.noBasis,
          ],
          interview,
        },
      }
    }
    const summary = currentStep === SUMMARY_STEP
    return {
      subject: a.subject(detail.employee_name, summary ? t.stepper.summary : t.stepper.setup),
      note: a.note,
      suggestions: summary ? a.suggestions.summary : a.suggestions.setup,
    }
  }

  /* ------------------------------ widok ------------------------------ */

  const droppedNames = [...new Set(Object.values(state.answers).filter((a) => a.selected_level !== undefined).map((a) => a.competency_id))]
    .filter((id) => !criteria.some((c) => c.competency.competency_id === id))
    .map((id) => byId.get(id)?.name ?? id)

  const nextStep = steps[stepIndex + 1]
  const nextCriterion = criteria.find((c) => criterionStep(c.competency.competency_id) === nextStep)

  return (
    <AppLayout withAssistant assistantContext={assistantContext} assistantRequest={assistantRequest}>
      <BackLink to={`/przelozony/pracownicy/${detail.employee_id}`} />
      <header className="mb-6">
        <h1 className="font-serif text-display font-semibold text-ink">
          {t.title('periodic')}: {detail.employee_name}
        </h1>
        <p className="mt-1 text-ink-muted">
          {texts.assessment.setup.formOptions[state.form].label}
          <span aria-hidden> · </span>
          {t.dueLabel(formatDate(detail.due_date))}
        </p>
      </header>

      <div className="sticky top-16 z-20 -mx-10 mb-8 flex min-h-14 items-center justify-between gap-4 border-y border-line bg-paper/95 px-10 py-2 backdrop-blur-sm">
        <p className="font-medium text-ink tabular-nums">
          {currentCriterion
            ? t.progress.criterion(criteria.indexOf(currentCriterion) + 1, criteria.length)
            : currentStep === SUMMARY_STEP
              ? t.progress.summary
              : t.progress.setup}
        </p>
        <SaveStatus state={saveState} dirty={dirty} onSave={() => void save()} disabled={!template} />
      </div>

      <div className="grid grid-cols-[13rem_minmax(0,1fr)] gap-10">
        <Stepper criteria={criteria} current={currentStep} statuses={statuses} decisions={decisionsById} onSelect={goTo} />

        <div>
          {currentStep === SETUP_STEP && (
            <SetupStep
              form={state.form}
              additional={state.additional.filter((id) => !template?.mandatory_competency_ids.includes(id))}
              template={template}
              templateState={templateError ? 'error' : template ? 'ready' : 'loading'}
              competencies={model.competencies}
              source={source}
              suggestedForm={source?.analysis?.suggested_form ?? null}
              suggestedAdditional={suggestedAdditional}
              droppedNames={droppedNames}
              onFormChange={changeForm}
              onToggleAdditional={toggleAdditional}
            />
          )}

          {currentCriterion && (
            <CriterionContainer
              key={currentCriterion.competency.competency_id}
              criterion={currentCriterion}
              position={criteria.indexOf(currentCriterion) + 1}
              total={criteria.length}
              state={state}
              notes={notes}
              blocked={currentBlocked}
              onAnswer={setAnswer}
              onDecision={(patch) => setDecision(currentCriterion.competency.competency_id, patch)}
              onRemove={removeCurrentAdditional}
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
                    {t.nav.blocked}
                  </p>
                )}
                <Button
                  onClick={() => goTo(nextStep)}
                  disabled={!template}
                  aria-disabled={currentBlocked && nextStep !== SUMMARY_STEP ? true : undefined}
                  aria-describedby={currentBlocked ? 'dalej-zablokowane' : undefined}
                  className={currentBlocked && nextStep !== SUMMARY_STEP ? 'cursor-not-allowed opacity-60' : ''}
                >
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

/** Kontener kroku kryterium: osobna wskazówka poziomu dla każdego kryterium. */
export function CriterionContainer(
  props: Omit<Parameters<typeof CriterionStep>[0], 'hint' | 'onRetryHint'> & { criterion: Criterion },
) {
  const answers = answersFor(props.state, props.criterion.competency)
  const { hint, retry } = useScoreHint(answers)
  return <CriterionStep {...props} hint={hint} onRetryHint={retry} />
}

export function SaveStatus({
  state,
  dirty,
  onSave,
  disabled,
}: {
  state: SaveState
  dirty: boolean
  onSave: () => void
  disabled: boolean
}) {
  const s = t.save
  const time = (iso: string) => new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
  let label: ReactNode
  if (state.kind === 'saving') {
    label = (
      <>
        <LoaderCircle aria-hidden className="size-4 animate-spin" />
        {s.saving}
      </>
    )
  } else if (state.kind === 'error') {
    label = (
      <span className="flex items-center gap-1.5 text-danger">
        <CircleAlert aria-hidden className="size-4" />
        {s.error}
      </span>
    )
  } else if (dirty) {
    label = s.unsaved
  } else if (state.kind === 'saved') {
    label = (
      <>
        <CircleCheck aria-hidden className="size-4 text-positive" />
        {s.saved(time(state.at))}
      </>
    )
  } else {
    label = s.neverSaved
  }

  return (
    <div className="flex items-center gap-4">
      <p role="status" className="flex items-center gap-1.5 text-sm text-ink-muted" title={s.autosaveHint}>
        {label}
      </p>
      <Button variant="secondary" onClick={onSave} disabled={disabled || state.kind === 'saving'} className="py-1.5 text-sm">
        <Save aria-hidden className="size-4" />
        {state.kind === 'error' ? texts.common.retry : s.button}
      </Button>
    </div>
  )
}
