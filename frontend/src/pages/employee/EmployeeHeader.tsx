import { useEffect, useState, type ReactNode } from 'react'
import { CalendarClock, LoaderCircle } from 'lucide-react'
import { EmployeeStatusBadge } from '../../components/StatusBadge'
import { Alert, Button } from '../../components/ui'
import { employeeStatusTone, toneClasses } from '../../components/styles'
import { ApiError, extendContract, getFirstAssessmentSchedule } from '../../lib/api'
import { Dialog } from '../../components/Dialog'
import { inputClass } from '../../components/styles'
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
  onEmployeeChange,
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
  /** Po przedłużeniu umowy: nowe dane pracownika (z przeliczonymi terminami). */
  onEmployeeChange?: (employee: Employee) => void
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
        {e.contract_end_date && (
          <Detail label={t.contractEnd}>
            {formatDate(e.contract_end_date)}
            {onEmployeeChange && isFirst && e.status !== 'up_to_date' && (
              <ContractExtension employee={e} onDone={onEmployeeChange} />
            )}
          </Detail>
        )}
        {e.contract_type === 'replacement' && e.first_eval_agreement_date && (
          <Detail label={t.agreementDate}>{formatDate(e.first_eval_agreement_date)}</Detail>
        )}
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

/** Art. 35 ust. 4: przedłużenie umowy o czas nieobecności > 3 mies.; backend przelicza terminy oceny. */
function ContractExtension({ employee: e, onDone }: { employee: Employee; onDone: (employee: Employee) => void }) {
  const t = texts.employee.extension
  const [open, setOpen] = useState(false)
  const [days, setDays] = useState('')
  const [end, setEnd] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const absence = Number(days)
  const maxEnd =
    e.contract_end_date && absence > 0
      ? new Date(new Date(`${e.contract_end_date}T00:00:00Z`).getTime() + absence * 86_400_000).toISOString().slice(0, 10)
      : undefined

  async function save() {
    setSaving(true)
    setError(null)
    try {
      onDone(await extendContract(e.id, end, absence))
      setOpen(false)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : texts.common.retry)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mt-1 block text-sm font-medium text-accent hover:underline">
        {t.open}
      </button>
      <Dialog
        open={open}
        title={t.title}
        onCancel={() => setOpen(false)}
        actions={
          <>
            <Button onClick={() => void save()} disabled={saving || absence <= 90 || !end}>
              {saving && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
              {saving ? t.saving : t.submit}
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t.cancel}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed">{t.lead}</p>
        <div className="mt-4 grid grid-cols-2 gap-4 text-ink">
          <label className="block">
            <span className="mb-1.5 block font-medium">{t.absenceDays}</span>
            <input type="number" min={91} value={days} onChange={(ev) => setDays(ev.target.value)} className={inputClass(false)} />
            <span className="mt-1 block text-xs text-ink-muted">{t.absenceHint}</span>
          </label>
          <label className="block">
            <span className="mb-1.5 block font-medium">{t.newEnd}</span>
            <input
              type="date"
              min={e.contract_end_date ?? undefined}
              max={maxEnd}
              value={end}
              onChange={(ev) => setEnd(ev.target.value)}
              className={inputClass(false)}
            />
            {maxEnd && <span className="mt-1 block text-xs text-ink-muted">{t.newEndHint(formatDate(maxEnd))}</span>}
          </label>
        </div>
        {error && (
          <div className="mt-4">
            <Alert>{error}</Alert>
          </div>
        )}
      </Dialog>
    </>
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
    getFirstAssessmentSchedule({
      hire_date: e.hire_date,
      contract_type: e.contract_type,
      contract_end_date: e.contract_end_date,
      first_eval_agreement_date: e.first_eval_agreement_date ?? null,
    })
      .then((schedule) => active && setState({ kind: 'ready', schedule }))
      .catch(() => active && setState({ kind: 'error' }))
    return () => {
      active = false
    }
  }, [e.hire_date, e.contract_type, e.contract_end_date, e.first_eval_agreement_date, attempt])

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
