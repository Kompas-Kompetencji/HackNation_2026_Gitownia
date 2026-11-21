import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ArrowLeft, CircleCheck, FileText, LoaderCircle, UserX } from 'lucide-react'
import { AppLayout } from '../layout/AppLayout'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { EmployeeStatusBadge } from '../components/StatusBadge'
import { Alert, Button } from '../components/ui'
import { getEmployee, listJobDescriptions } from '../lib/api'
import { formatDate, formatDateTime, formatRelativeDue, fullName } from '../lib/format'
import { texts } from '../lib/texts'
import type { Employee, JobDescriptionDocument } from '../types'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'not_found' }
  | { kind: 'ready'; employee: Employee; document: JobDescriptionDocument | null }

/** Prosta strona pracownika (etap 2): same szczegóły i aktualny opis stanowiska. */
export function EmployeePage() {
  const t = texts.employee
  const { employeeId = '' } = useParams()
  const location = useLocation()
  const created = (location.state as { created?: string } | null)?.created
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  const load = useCallback(() => {
    setState({ kind: 'loading' })
    Promise.all([getEmployee(employeeId), listJobDescriptions(employeeId)])
      .then(([employee, docs]) => {
        if (!employee) return setState({ kind: 'not_found' })
        const latest = [...docs].sort((a, b) => b.version - a.version)[0] ?? null
        setState({ kind: 'ready', employee, document: latest })
      })
      .catch(() => setState({ kind: 'error' }))
  }, [employeeId])

  useEffect(load, [load])

  return (
    <AppLayout withAssistant>
      <Link
        to="/przelozony"
        className="mb-4 inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-ink-muted underline-offset-2 hover:text-ink hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {texts.wizard.backToList}
      </Link>

      {state.kind === 'loading' && (
        <p role="status" className="flex items-center gap-2 py-10 text-ink-muted">
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          {t.loading}
        </p>
      )}

      {state.kind === 'error' && (
        <div className="mt-6">
          <Alert
            action={
              <Button variant="secondary" onClick={load} className="py-1.5 text-sm">
                {texts.common.retry}
              </Button>
            }
          >
            {t.loadError}
          </Alert>
        </div>
      )}

      {state.kind === 'not_found' && (
        <div className="mt-6">
          <EmptyState icon={UserX} title={t.notFoundTitle} body={t.notFoundBody} />
        </div>
      )}

      {state.kind === 'ready' && (
        <EmployeeDetails employee={state.employee} document={state.document} created={created} />
      )}
    </AppLayout>
  )
}

function EmployeeDetails({
  employee: e,
  document: doc,
  created,
}: {
  employee: Employee
  document: JobDescriptionDocument | null
  created?: string
}) {
  const t = texts.employee
  const analysis = doc?.analysis

  return (
    <>
      {created && (
        <div role="status" className="mb-6 flex items-center gap-3 rounded-md bg-positive-soft px-4 py-3 text-positive">
          <CircleCheck aria-hidden className="size-4 shrink-0" />
          {t.created(created)}
        </div>
      )}

      <PageHeader title={fullName(e)} lead={`${e.position_title}, ${e.organizational_unit}`} actions={<EmployeeStatusBadge status={e.status} />} />

      <div className="space-y-8">
        <section aria-labelledby="szczegoly">
          <h2 id="szczegoly" className="mb-3 text-title font-semibold text-ink">
            {t.detailsTitle}
          </h2>
          <dl className="divide-y divide-line rounded-md border border-line bg-surface">
            <Row label={t.position}>{e.position_title}</Row>
            <Row label={t.unit}>{e.organizational_unit}</Row>
            <Row label={t.hireDate}>{formatDate(e.hire_date)}</Row>
            <Row label={t.contractType}>{texts.contractType[e.contract_type]}</Row>
            {e.contract_end_date && <Row label={t.contractEnd}>{formatDate(e.contract_end_date)}</Row>}
            <Row label={t.form}>{e.form ? texts.forms[e.form] : '—'}</Row>
            <Row label={t.nextDue}>
              {e.next_assessment_due ? (
                <>
                  {formatDate(e.next_assessment_due)}
                  <span className="text-ink-muted">, {formatRelativeDue(e.next_assessment_due)}</span>
                </>
              ) : (
                <span className="text-ink-muted">{texts.supervisorHome.dueNotSet}</span>
              )}
            </Row>
            <Row label={t.lastAssessment}>
              {e.last_assessment_date && e.last_assessment_result ? (
                `${formatDate(e.last_assessment_date)}, ${t.result[e.last_assessment_result]}`
              ) : (
                <span className="text-ink-muted">{t.noAssessment}</span>
              )}
            </Row>
          </dl>
        </section>

        <section aria-labelledby="opis-stanowiska">
          <h2 id="opis-stanowiska" className="mb-3 text-title font-semibold text-ink">
            {t.documentTitle}
          </h2>
          {doc ? (
            <div className="rounded-md border border-line bg-surface">
              <div className="flex items-center gap-3 border-b border-line px-5 py-3">
                <FileText aria-hidden className="size-4 shrink-0 text-ink-muted" />
                <p className="min-w-0 flex-1 truncate font-medium text-ink">{doc.filename}</p>
                <p className="shrink-0 text-sm text-ink-muted">
                  {t.version(doc.version)}, {t.uploadedAt.toLowerCase()} {formatDateTime(doc.uploaded_at)}
                </p>
              </div>
              {analysis && (
                <dl className="divide-y divide-line">
                  <Row label={texts.wizard.document.form}>{texts.wizard.document.formOptions[analysis.suggested_form].label}</Row>
                  <Row label={texts.wizard.document.subordinates}>{analysis.subordinates_count ?? '—'}</Row>
                  <Row label={texts.wizard.document.criteria}>
                    <ol className="list-decimal space-y-0.5 pl-5">
                      {analysis.additional_criteria.map((c) => (
                        <li key={c.criterion_id}>{c.name}</li>
                      ))}
                    </ol>
                  </Row>
                </dl>
              )}
            </div>
          ) : (
            <p className="text-ink-muted">{t.noDocument}</p>
          )}
        </section>

        <p className="text-sm text-ink-muted">{t.nextStage}</p>
      </div>
    </>
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
