import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ClipboardPen, LoaderCircle, ShieldAlert } from 'lucide-react'
import { AppLayout } from '../../layout/AppLayout'
import { EmptyState } from '../../components/EmptyState'
import { Alert, Button } from '../../components/ui'
import { ApiError, getAssessment, getCompetencies, listJobDescriptions, listNotes } from '../../lib/api'
import { texts } from '../../lib/texts'
import type { AssessmentDetail, CompetencyModel, JobDescriptionDocument, Note } from '../../types'
import type { SectionState } from '../employee/sectionState'
import { AssessmentForm } from './AssessmentForm'
import { AssessmentReadOnly } from './AssessmentReadOnly'
import { BackLink } from './BackLink'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'ready'; detail: AssessmentDetail; model: CompetencyModel }

/**
 * Ocena pod adresem /przelozony/oceny/:id: formularz szkicu oceny okresowej
 * albo widok tylko do odczytu zakończonej oceny.
 */
export function AssessmentPage() {
  const t = texts.assessment
  const { assessmentId = '' } = useParams()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [notes, setNotes] = useState<SectionState<Note[]>>({ kind: 'loading' })
  const [docs, setDocs] = useState<SectionState<JobDescriptionDocument[]>>({ kind: 'loading' })

  const load = useCallback(() => {
    let active = true
    setState({ kind: 'loading' })
    Promise.all([getAssessment(assessmentId), getCompetencies()])
      .then(([detail, model]) => {
        if (!active) return
        if (!detail) return setState({ kind: 'not_found' })
        setState({ kind: 'ready', detail, model })
        listNotes(detail.employee_id)
          .then((data) => active && setNotes({ kind: 'ready', data }))
          .catch(() => active && setNotes({ kind: 'error' }))
        listJobDescriptions(detail.employee_id)
          .then((data) => active && setDocs({ kind: 'ready', data }))
          .catch(() => active && setDocs({ kind: 'error' }))
      })
      .catch((e) => active && setState(e instanceof ApiError && e.status === 403 ? { kind: 'forbidden' } : { kind: 'error' }))
    return () => {
      active = false
    }
  }, [assessmentId])

  useEffect(load, [load])

  if (state.kind === 'ready') {
    const { detail, model } = state
    if (detail.status === 'completed') return <AssessmentReadOnly detail={detail} model={model} />
    if (detail.kind === 'periodic') return <AssessmentForm detail={detail} model={model} notes={notes} docs={docs} />
    return (
      <AppLayout withAssistant>
        <BackLink to={`/przelozony/pracownicy/${detail.employee_id}`} />
        <h1 className="mb-6 font-serif text-display font-semibold text-ink">
          {t.title(detail.kind)}: {detail.employee_name}
        </h1>
        <EmptyState icon={ClipboardPen} title={t.title(detail.kind)} body={t.firstPending} />
      </AppLayout>
    )
  }

  return (
    <AppLayout withAssistant>
      <BackLink />
      {state.kind === 'loading' && (
        <p role="status" className="flex items-center gap-2 py-10 text-ink-muted">
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          {t.loading}
        </p>
      )}
      {state.kind === 'error' && (
        <Alert
          action={
            <Button variant="secondary" onClick={load} className="py-1.5 text-sm">
              {texts.common.retry}
            </Button>
          }
        >
          {t.loadError}
        </Alert>
      )}
      {state.kind === 'not_found' && <Alert>{t.notFound}</Alert>}
      {state.kind === 'forbidden' && (
        <EmptyState icon={ShieldAlert} title={texts.employee.forbiddenTitle} body={texts.employee.forbiddenBody} />
      )}
    </AppLayout>
  )
}
