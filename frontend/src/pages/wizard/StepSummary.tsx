import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, LoaderCircle } from 'lucide-react'
import { Alert, Button } from '../../components/ui'
import { getFirstAssessmentSchedule } from '../../lib/api'
import { formatDate } from '../../lib/format'
import { texts } from '../../lib/texts'
import type { FirstAssessmentSchedule } from '../../types'
import { needsContractEnd, type DocumentData, type FirstDocumentData, type PersonalData } from './model'

type ScheduleState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; schedule: FirstAssessmentSchedule }

export function StepSummary({
  personal,
  document: doc,
  firstDocument,
  onEdit,
  onBack,
  onCreate,
}: {
  personal: PersonalData
  /** Ścieżka oceny okresowej: wynik analizy opisu stanowiska. */
  document: DocumentData
  /** Ścieżka pierwszej oceny: stanowisko i opcjonalny plik. */
  firstDocument: FirstDocumentData
  onEdit: (step: 0 | 1) => void
  onBack: () => void
  /** Zwraca obietnicę; odrzucenie pokazuje błąd, a dane w kreatorze zostają. */
  onCreate: () => Promise<void>
}) {
  const t = texts.wizard.summary
  const d = texts.wizard.document
  const p = texts.wizard.personal
  const isFirst = personal.assessment_kind === 'first'
  const [state, setState] = useState<'idle' | 'creating' | 'error'>('idle')
  const [schedule, setSchedule] = useState<ScheduleState>({ kind: 'loading' })
  const edited = doc.edited

  const loadSchedule = useCallback(() => {
    if (!personal.contract_type) return
    setSchedule({ kind: 'loading' })
    getFirstAssessmentSchedule({
      hire_date: personal.hire_date,
      contract_type: personal.contract_type,
      contract_end_date: needsContractEnd(personal.contract_type) ? personal.contract_end_date : null,
      first_eval_agreement_date: personal.first_eval_agreement_date || null,
    })
      .then((s) => setSchedule({ kind: 'ready', schedule: s }))
      .catch(() => setSchedule({ kind: 'error' }))
  }, [personal.contract_type, personal.hire_date, personal.contract_end_date, personal.first_eval_agreement_date])

  useEffect(() => {
    if (isFirst) loadSchedule()
  }, [isFirst, loadSchedule])

  async function handleCreate() {
    setState('creating')
    try {
      await onCreate()
    } catch {
      setState('error')
    }
  }

  return (
    <div className="space-y-8">
      <p className="text-ink-muted">{t.lead}</p>

      <SummarySection title={t.personalTitle} onEdit={() => onEdit(0)}>
        <Row label={p.firstName}>{personal.first_name}</Row>
        <Row label={p.lastName}>{personal.last_name}</Row>
        <Row label={p.hireDate}>{personal.hire_date && formatDate(personal.hire_date)}</Row>
        <Row label={p.contractType}>{personal.contract_type && texts.contractType[personal.contract_type]}</Row>
        {needsContractEnd(personal.contract_type) && personal.contract_end_date && (
          <Row label={p.contractEndDate}>{formatDate(personal.contract_end_date)}</Row>
        )}
        {personal.contract_type === 'replacement' && personal.first_eval_agreement_date && (
          <Row label={p.agreementDate}>{formatDate(personal.first_eval_agreement_date)}</Row>
        )}
        <Row label={t.path}>{personal.assessment_kind && p.pathOptions[personal.assessment_kind].label}</Row>
      </SummarySection>

      {isFirst ? (
        <>
          <SummarySection title={t.documentTitle} onEdit={() => onEdit(1)}>
            <Row label={texts.wizard.firstDocument.positionTitle}>{firstDocument.position_title}</Row>
            <Row label={t.file}>{firstDocument.file?.name ?? <span className="text-ink-muted">{t.noFile}</span>}</Row>
            <Row label={t.form}>{texts.forms.first}</Row>
          </SummarySection>

          <section aria-labelledby="terminy" className="rounded-md border border-line bg-surface">
            <div className="border-b border-line px-5 py-3">
              <h3 id="terminy" className="font-semibold text-ink">
                {t.scheduleTitle}
              </h3>
              <p className="text-sm text-ink-muted">{t.scheduleLead}</p>
            </div>
            <div aria-live="polite">
              {schedule.kind === 'loading' && (
                <p role="status" className="flex items-center gap-2 px-5 py-3 text-ink-muted">
                  <LoaderCircle aria-hidden className="size-4 animate-spin" />
                  {t.scheduleLoading}
                </p>
              )}
              {schedule.kind === 'error' && (
                <div className="px-5 py-3">
                  <Alert
                    action={
                      <Button variant="secondary" onClick={loadSchedule} className="py-1.5 text-sm">
                        {texts.common.retry}
                      </Button>
                    }
                  >
                    {t.scheduleError}
                  </Alert>
                </div>
              )}
              {schedule.kind === 'ready' && (
                <dl className="divide-y divide-line">
                  <Row label={t.interviewDue}>{t.interviewDueValue(formatDate(schedule.schedule.introductory_interview_due))}</Row>
                  <Row label={t.period}>
                    {t.periodValue(
                      formatDate(schedule.schedule.first_assessment_period_start),
                      formatDate(schedule.schedule.first_assessment_period_end),
                    )}
                  </Row>
                </dl>
              )}
            </div>
          </section>
        </>
      ) : (
        edited && (
          <SummarySection title={t.documentTitle} onEdit={() => onEdit(1)}>
            <Row label={t.file}>{doc.file?.name}</Row>
            <Row label={d.positionTitle}>{edited.position_title}</Row>
            {edited.organizational_unit && <Row label={texts.employee.unit}>{edited.organizational_unit}</Row>}
            <Row label={d.subordinates}>{edited.subordinates_count}</Row>
            <Row label={d.form}>{d.formOptions[edited.form].label}</Row>
            <Row label={d.criteria}>
              {edited.criteria.length === 0 ? (
                d.noCriteria
              ) : (
                <ol className="list-decimal space-y-0.5 pl-5">
                  {edited.criteria.map((c) => (
                    <li key={c.criterion_id}>{c.name}</li>
                  ))}
                </ol>
              )}
            </Row>
          </SummarySection>
        )
      )}

      {state === 'error' && <Alert>{t.createError}</Alert>}

      <div className="flex items-center justify-between border-t border-line pt-6">
        <Button variant="secondary" onClick={onBack} disabled={state === 'creating'}>
          <ArrowLeft aria-hidden className="size-4" />
          {texts.wizard.back}
        </Button>
        <Button onClick={handleCreate} disabled={state === 'creating'}>
          {state === 'creating' ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Check aria-hidden className="size-4" />}
          {state === 'creating' ? t.creating : t.create}
        </Button>
      </div>
    </div>
  )
}

function SummarySection({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <section className="rounded-md border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h3 className="font-semibold text-ink">{title}</h3>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-sm px-2 py-1 text-sm font-medium text-accent underline-offset-2 hover:underline"
          aria-label={`${texts.wizard.summary.edit}: ${title}`}
        >
          {texts.wizard.summary.edit}
        </button>
      </div>
      <dl className="divide-y divide-line">{children}</dl>
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 px-5 py-2.5">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  )
}
