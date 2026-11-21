import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ClipboardPen, LoaderCircle, ShieldAlert } from 'lucide-react'
import { AppLayout } from '../../layout/AppLayout'
import { PageHeader } from '../../components/PageHeader'
import { EmptyState } from '../../components/EmptyState'
import { Alert } from '../../components/ui'
import { ApiError, getAssessment } from '../../lib/api'
import { formatDate } from '../../lib/format'
import { texts } from '../../lib/texts'
import type { AssessmentSummary } from '../../types'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'ready'; assessment: AssessmentSummary }

/** Zaślepka formularza oceny (formularz powstaje w etapie 4). */
export function AssessmentStubPage() {
  const t = texts.assessmentStub
  const { assessmentId = '' } = useParams()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    let active = true
    getAssessment(assessmentId)
      .then((a) => active && setState(a ? { kind: 'ready', assessment: a } : { kind: 'not_found' }))
      .catch((e) => active && setState(e instanceof ApiError && e.status === 403 ? { kind: 'forbidden' } : { kind: 'error' }))
    return () => {
      active = false
    }
  }, [assessmentId])

  const a = state.kind === 'ready' ? state.assessment : null

  return (
    <AppLayout withAssistant>
      <Link
        to={a ? `/przelozony/pracownicy/${a.employee_id}` : '/przelozony'}
        className="mb-4 inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-ink-muted underline-offset-2 hover:text-ink hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {a ? t.back : texts.wizard.backToList}
      </Link>

      {state.kind === 'loading' && (
        <p role="status" className="flex items-center gap-2 py-10 text-ink-muted">
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          {t.loading}
        </p>
      )}
      {state.kind === 'error' && <Alert>{t.loadError}</Alert>}
      {state.kind === 'not_found' && <Alert>{t.notFound}</Alert>}
      {state.kind === 'forbidden' && (
        <EmptyState icon={ShieldAlert} title={texts.employee.forbiddenTitle} body={texts.employee.forbiddenBody} />
      )}

      {a && (
        <>
          <PageHeader title={`${t.title(a.kind)}: ${a.employee_name}`} />
          <dl className="mb-8 grid grid-cols-4 gap-x-8 gap-y-4">
            <Detail label={t.form}>{texts.forms[a.form]}</Detail>
            <Detail label={t.status}>{texts.status.assessment[a.status]}</Detail>
            <Detail label={t.started}>{a.started_at ? formatDate(a.started_at) : '—'}</Detail>
            <Detail label={t.due}>{formatDate(a.due_date)}</Detail>
          </dl>
          <EmptyState icon={ClipboardPen} title={t.title(a.kind)} body={t.lead} />
        </>
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
