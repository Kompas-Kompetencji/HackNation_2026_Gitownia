import { useId, type ReactNode } from 'react'
import { CircleAlert, LoaderCircle, RotateCcw } from 'lucide-react'
import { Button } from '../../components/ui'
import { formatDate } from '../../lib/format'
import { texts } from '../../lib/texts'
import type { ExamStatus, FirstAssessmentFields, FirstAssessmentSchedule } from '../../types'

const t = texts.firstAssessment.data

const EXAM_OPTIONS: ExamStatus[] = ['passed', 'exempt', 'failed']

export type ScheduleState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; data: FirstAssessmentSchedule }

const inputClass =
  'block w-full rounded-md border border-line-strong bg-surface px-3 py-2.5 text-ink tabular-nums focus-visible:outline-2 focus-visible:outline-offset-0'

/**
 * Krok „Dane pierwszej oceny”: daty rozmowy wstępnej i oceniającej, sprawozdanie, egzamin.
 * Terminy pokazuje z backendu (getFirstAssessmentSchedule); frontend ich nie liczy.
 */
export function FirstDataStep({
  value,
  schedule,
  onRetrySchedule,
  onChange,
}: {
  value: FirstAssessmentFields
  schedule: ScheduleState
  onRetrySchedule: () => void
  onChange: (patch: Partial<FirstAssessmentFields>) => void
}) {
  const uid = useId()
  const due = schedule.kind === 'ready' ? schedule.data.introductory_interview_due : null
  // Porównanie z terminem z backendu (daty RRRR-MM-DD porównują się jak tekst); bez terminu nie ostrzegamy.
  const interviewLate = !!due && !!value.initial_interview_date && value.initial_interview_date > due

  return (
    <div>
      <h2 tabIndex={-1} data-step-heading className="font-serif text-display font-semibold text-ink focus:outline-none">
        {t.title}
      </h2>
      <p className="mt-2 max-w-prose text-ink-muted">{t.lead}</p>

      <section aria-labelledby={`${uid}-terminy`} className="mt-6 rounded-md bg-sunken px-5 py-4">
        <h3 id={`${uid}-terminy`} className="text-sm font-semibold text-ink">
          {t.deadlines}
        </h3>
        {schedule.kind === 'loading' && (
          <p role="status" className="mt-2 flex items-center gap-2 text-sm text-ink-muted">
            <LoaderCircle aria-hidden className="size-4 animate-spin" />
            {t.deadlinesLoading}
          </p>
        )}
        {schedule.kind === 'error' && (
          <div role="alert" className="mt-2 flex items-center gap-3 text-sm text-danger">
            <CircleAlert aria-hidden className="size-4 shrink-0" />
            <span>{t.deadlinesError}</span>
            <Button variant="secondary" onClick={onRetrySchedule} className="py-1 text-sm">
              <RotateCcw aria-hidden className="size-3.5" />
              {texts.common.retry}
            </Button>
          </div>
        )}
        {schedule.kind === 'ready' && (
          <dl className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
            <div>
              <dt className="text-ink-muted">{t.interviewDue}</dt>
              <dd className="text-ink tabular-nums">{t.interviewDueValue(formatDate(schedule.data.introductory_interview_due))}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">{t.period}</dt>
              <dd className="text-ink tabular-nums">
                {t.periodValue(
                  formatDate(schedule.data.first_assessment_period_start),
                  formatDate(schedule.data.first_assessment_period_end),
                )}
              </dd>
            </div>
          </dl>
        )}
      </section>

      <div className="mt-8 grid grid-cols-2 gap-6">
        <div>
          <label htmlFor={`${uid}-wstepna`} className="mb-1 block font-medium text-ink">
            {t.initialInterview}
          </label>
          <p id={`${uid}-wstepna-opis`} className="mb-2 text-sm text-ink-muted">
            {t.initialInterviewHint}
          </p>
          <input
            id={`${uid}-wstepna`}
            type="date"
            value={value.initial_interview_date ?? ''}
            onChange={(e) => onChange({ initial_interview_date: e.target.value || null })}
            aria-describedby={`${uid}-wstepna-opis${interviewLate ? ` ${uid}-wstepna-po-terminie` : ''}`}
            className={inputClass}
          />
          {interviewLate && due && (
            <p
              id={`${uid}-wstepna-po-terminie`}
              role="status"
              className="mt-2 flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning"
            >
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              {t.initialInterviewLate(formatDate(due))}
            </p>
          )}
        </div>
        <div>
          <label htmlFor={`${uid}-oceniajaca`} className="mb-1 block font-medium text-ink">
            {t.evaluationInterview}
          </label>
          <p id={`${uid}-oceniajaca-opis`} className="mb-2 text-sm text-ink-muted">
            {t.evaluationInterviewHint}
          </p>
          <input
            id={`${uid}-oceniajaca`}
            type="date"
            value={value.evaluation_interview_date ?? ''}
            onChange={(e) => onChange({ evaluation_interview_date: e.target.value || null })}
            aria-describedby={`${uid}-oceniajaca-opis`}
            className={inputClass}
          />
        </div>
      </div>

      <fieldset className="mt-8">
        <legend className="mb-2 font-medium text-ink">{t.report}</legend>
        <div className="grid grid-cols-2 gap-3">
          {([true, false] as const).map((option) => (
            <Choice
              key={String(option)}
              name={`${uid}-sprawozdanie`}
              checked={value.report_on_time === option}
              onSelect={() => onChange({ report_on_time: option })}
              label={option ? t.reportOptions.yes : t.reportOptions.no}
              hint={option ? undefined : t.reportNo}
              negative={!option}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-8">
        <legend className="mb-2 font-medium text-ink">{t.exam}</legend>
        <div className="grid grid-cols-3 gap-3">
          {EXAM_OPTIONS.map((option) => (
            <Choice
              key={option}
              name={`${uid}-egzamin`}
              checked={value.exam_status === option}
              onSelect={() => onChange({ exam_status: option })}
              label={t.examOptions[option].label}
              hint={t.examOptions[option].hint || undefined}
              negative={option === 'failed'}
            />
          ))}
        </div>
      </fieldset>
    </div>
  )
}

/** Opcja wyboru w stylu konfiguracji oceny okresowej: natywny radio (strzałki) pod etykietą. */
function Choice({
  name,
  checked,
  onSelect,
  label,
  hint,
  negative,
}: {
  name: string
  checked: boolean
  onSelect: () => void
  label: ReactNode
  hint?: string
  negative?: boolean
}) {
  return (
    <label className="block">
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="peer sr-only" />
      <span
        className={`flex h-full cursor-pointer flex-col rounded-md border px-4 py-3 transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${
          checked ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface hover:bg-sunken'
        }`}
      >
        <span className="flex items-center gap-2 font-medium text-ink">
          <span aria-hidden className={`grid size-4 shrink-0 place-items-center rounded-full border ${checked ? 'border-accent' : 'border-line-strong'}`}>
            {checked && <span className="size-2 rounded-full bg-accent" />}
          </span>
          {label}
        </span>
        {hint && (
          <span className={`mt-1 pl-6 text-sm ${negative && checked ? 'font-medium text-danger' : 'text-ink-muted'}`}>{hint}</span>
        )}
      </span>
    </label>
  )
}
