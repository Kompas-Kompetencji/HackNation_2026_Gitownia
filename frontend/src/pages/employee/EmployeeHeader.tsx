import { useEffect, useState, type ReactNode } from 'react'
import { CalendarClock, LoaderCircle } from 'lucide-react'
import { EmployeeStatusBadge } from '../../components/StatusBadge'
import { Alert, Button } from '../../components/ui'
import { employeeStatusTone, toneClasses } from '../../components/styles'
import { getFirstAssessmentSchedule } from '../../lib/api'
import { formatDate, formatRelativeDue, fullName } from '../../lib/format'
import { texts } from '../../lib/texts'
import type { AssessmentSummary, Employee, FirstAssessmentSchedule } from '../../types'

type ScheduleState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; schedule: FirstAssessmentSchedule }

/**
 * Nagłówek panelu: dane pracownika, termin następnej oceny ze statusem (kolor + tekst),
 * terminy pierwszej oceny i główny przycisk zależny od sytuacji.
 */
export function EmployeeHeader({
  employee: e,
  openDraft,
  needsDocument,
  primaryAvailable,
  creating,
  createError,
  onPrimary,
}: {
  employee: Employee
  /** Rozpoczęty szkic oceny, jeśli jest. */
  openDraft: AssessmentSummary | null
  /** Ocena okresowa bez opisu stanowiska: przycisk najpierw prowadzi do wgrania opisu. */
  needsDocument: boolean
  /** false, dopóki historia ocen się nie wczyta (nie wiadomo, czy jest już szkic). */
  primaryAvailable: boolean
  creating: boolean
  createError: boolean
  onPrimary: () => void
}) {
  const t = texts.employee
  const tone = toneClasses[employeeStatusTone[e.status]]
  const isFirst = e.assessment_kind === 'first'

  const primaryLabel = openDraft
    ? t.actions.continueDraft(openDraft.kind)
    : isFirst
      ? t.actions.startFirst
      : needsDocument
        ? t.actions.createPeriodicNeedsDocument
        : t.actions.createPeriodic

  return (
    <header className="mb-10">
      <div className="flex items-start justify-between gap-8">
        <div className="min-w-0">
          <h1 className="font-serif text-display font-semibold tracking-[-0.01em] text-ink">{fullName(e)}</h1>
          <p className="mt-1 text-ink-muted">
            {e.position_title}, {e.organizational_unit}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Button onClick={onPrimary} disabled={creating || !primaryAvailable}>
            {creating && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
            {creating ? t.actions.creating : primaryLabel}
          </Button>
          {!primaryAvailable ? (
            <p className="text-sm text-ink-muted">{t.actions.waitingForHistory}</p>
          ) : openDraft?.started_at ? (
            <p className="text-sm text-ink-muted">{t.actions.draftStarted(formatDate(openDraft.started_at))}</p>
          ) : (
            needsDocument && !isFirst && <p className="text-sm text-ink-muted">{t.actions.needsDocumentHint}</p>
          )}
        </div>
      </div>

      {createError && (
        <div className="mt-4">
          <Alert>{t.actions.createError}</Alert>
        </div>
      )}

      <div className={`mt-6 flex items-center gap-4 rounded-md border-l-4 bg-surface px-5 py-4 shadow-raised ${tone.border}`}>
        <CalendarClock aria-hidden className={`size-5 shrink-0 ${tone.text}`} />
        <div className="min-w-0 flex-1">
          {e.next_assessment_due ? (
            <p className="text-ink">
              <span className="font-semibold">
                {isFirst ? t.deadline.first(formatDate(e.next_assessment_due)) : t.deadline.periodic(formatDate(e.next_assessment_due))}
              </span>
              <span className={`ml-2 font-medium ${tone.text}`}>{formatRelativeDue(e.next_assessment_due)}</span>
            </p>
          ) : (
            <p className="text-ink-muted">{t.deadline.notSet}</p>
          )}
        </div>
        <EmployeeStatusBadge status={e.status} />
      </div>

      <dl className="mt-6 grid grid-cols-4 gap-x-8 gap-y-4 border-b border-line pb-6">
        <Detail label={t.hireDate}>{formatDate(e.hire_date)}</Detail>
        <Detail label={t.contractType}>{texts.contractType[e.contract_type]}</Detail>
        {e.contract_end_date && <Detail label={t.contractEnd}>{formatDate(e.contract_end_date)}</Detail>}
        <Detail label={t.form}>
          {e.form ? texts.forms[e.form] : <span className="text-warning">{t.formMissing}</span>}
        </Detail>
        <Detail label={t.lastAssessment}>
          {e.last_assessment_date && e.last_assessment_result ? (
            `${formatDate(e.last_assessment_date)}, ${t.result[e.last_assessment_result]}`
          ) : (
            <span className="text-ink-muted">{t.noAssessment}</span>
          )}
        </Detail>
      </dl>

      {isFirst && <FirstSchedule employee={e} />}
    </header>
  )
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  )
}

/** Terminy pierwszej oceny z api.ts (liczy backend; na razie makieta). */
function FirstSchedule({ employee: e }: { employee: Employee }) {
  const t = texts.employee.deadline
  const [state, setState] = useState<ScheduleState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    getFirstAssessmentSchedule({ hire_date: e.hire_date, contract_type: e.contract_type, contract_end_date: e.contract_end_date })
      .then((schedule) => active && setState({ kind: 'ready', schedule }))
      .catch(() => active && setState({ kind: 'error' }))
    return () => {
      active = false
    }
  }, [e.hire_date, e.contract_type, e.contract_end_date, attempt])

  return (
    <div className="mt-6" aria-live="polite">
      {state.kind === 'loading' && (
        <p role="status" className="flex items-center gap-2 text-sm text-ink-muted">
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          {t.scheduleLoading}
        </p>
      )}
      {state.kind === 'error' && (
        <Alert
          action={
            <Button
              variant="secondary"
              className="py-1.5 text-sm"
              onClick={() => {
                setState({ kind: 'loading' })
                setAttempt((n) => n + 1)
              }}
            >
              {texts.common.retry}
            </Button>
          }
        >
          {t.scheduleError}
        </Alert>
      )}
      {state.kind === 'ready' && (
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4">
          <Detail label={t.interview}>
            {t.interviewValue(formatDate(state.schedule.introductory_interview_due))}
            <span className="ml-2 text-sm text-ink-muted">{formatRelativeDue(state.schedule.introductory_interview_due)}</span>
          </Detail>
          <Detail label={t.period}>
            {t.periodValue(
              formatDate(state.schedule.first_assessment_period_start),
              formatDate(state.schedule.first_assessment_period_end),
            )}
          </Detail>
        </dl>
      )}
    </div>
  )
}
