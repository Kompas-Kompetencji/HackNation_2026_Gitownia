import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CircleCheck, LoaderCircle, ShieldAlert, UserX } from 'lucide-react'
import { AppLayout } from '../../layout/AppLayout'
import { EmptyState } from '../../components/EmptyState'
import { Alert, Button } from '../../components/ui'
import { ApiError, createAssessmentDraft, getEmployee, listAssessments, listJobDescriptions } from '../../lib/api'
import { formatDate, fullName } from '../../lib/format'
import { texts } from '../../lib/texts'
import type { AssessmentResult, AssessmentSummary, Employee, JobDescriptionDocument } from '../../types'
import type { AssistantContext } from '../../assistant/AssistantPanel'
import type { SectionState } from './sectionState'
import { EmployeeHeader } from './EmployeeHeader'
import { AssessmentHistory } from './AssessmentHistory'
import { JobDescriptionSection } from './JobDescriptionSection'
import { NotesSection } from './NotesSection'

type EmployeeState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'ready'; employee: Employee }

const OPEN_STATUSES = ['draft', 'awaiting_interview']

/**
 * Panel pracownika: szczegóły, terminy, historia ocen, opis stanowiska, notatki i asystent z kontekstem.
 * Każda sekcja wczytuje dane osobno, więc błąd jednej nie wyłącza reszty panelu.
 */
export function EmployeePage() {
  const t = texts.employee
  const { employeeId = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const navState = location.state as { created?: string; withDocument?: boolean; completedResult?: AssessmentResult | null } | null
  const [state, setState] = useState<EmployeeState>({ kind: 'loading' })
  const [docs, setDocs] = useState<SectionState<JobDescriptionDocument[]>>({ kind: 'loading' })
  const [assessments, setAssessments] = useState<SectionState<AssessmentSummary[]>>({ kind: 'loading' })
  const [editorOpen, setEditorOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(false)

  const loadEmployee = useCallback(async () => {
    try {
      const employee = await getEmployee(employeeId)
      setState(employee ? { kind: 'ready', employee } : { kind: 'not_found' })
      return !!employee
    } catch (error) {
      setState(error instanceof ApiError && error.status === 403 ? { kind: 'forbidden' } : { kind: 'error' })
      return false
    }
  }, [employeeId])

  const loadDocs = useCallback(() => {
    setDocs({ kind: 'loading' })
    return listJobDescriptions(employeeId)
      .then((data) => setDocs({ kind: 'ready', data }))
      .catch(() => setDocs({ kind: 'error' }))
  }, [employeeId])

  const loadAssessments = useCallback(() => {
    setAssessments({ kind: 'loading' })
    return listAssessments({ employee_id: employeeId })
      .then((data) => setAssessments({ kind: 'ready', data }))
      .catch(() => setAssessments({ kind: 'error' }))
  }, [employeeId])

  const loadAll = useCallback(() => {
    setState({ kind: 'loading' })
    // Sekcje wczytujemy dopiero, gdy wiadomo, że pracownik istnieje i jest dostępny.
    void loadEmployee().then((ok) => {
      if (ok) {
        void loadDocs()
        void loadAssessments()
      }
    })
  }, [loadEmployee, loadDocs, loadAssessments])

  useEffect(loadAll, [loadAll])

  if (state.kind !== 'ready') {
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
          <div className="mt-6">
            <Alert
              action={
                <Button variant="secondary" onClick={loadAll} className="py-1.5 text-sm">
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
        {state.kind === 'forbidden' && (
          <div className="mt-6">
            <EmptyState icon={ShieldAlert} title={t.forbiddenTitle} body={t.forbiddenBody} />
          </div>
        )}
      </AppLayout>
    )
  }

  const { employee } = state
  const openDraft =
    assessments.kind === 'ready' ? (assessments.data.find((a) => OPEN_STATUSES.includes(a.status)) ?? null) : null
  // Gdy lista opisów się nie wczytała, rozstrzyga brak ustalonego arkusza.
  const needsDocument =
    employee.assessment_kind === 'periodic' &&
    (!employee.form || (docs.kind === 'ready' && docs.data.length === 0))

  async function createDraft() {
    setCreating(true)
    setCreateError(false)
    try {
      const draft = await createAssessmentDraft({ employee_id: employee.id, kind: employee.assessment_kind })
      navigate(`/przelozony/oceny/${draft.id}`)
    } catch {
      setCreateError(true)
      setCreating(false)
    }
  }

  function handlePrimary() {
    if (openDraft) return navigate(`/przelozony/oceny/${openDraft.id}`)
    if (needsDocument) {
      setNotice(t.actions.needsDocument)
      setEditorOpen(true)
      return
    }
    void createDraft()
  }

  // Po zapisie opisu zostajemy w panelu: sekcja pokazuje wersję i przyjęty arkusz,
  // a przełożony sam tworzy ocenę przyciskiem na górze.
  async function handleDocumentSaved() {
    await Promise.all([loadEmployee(), loadDocs()])
    setEditorOpen(false)
    setNotice(null)
  }

  const situation =
    employee.assessment_kind === 'first' ? 'first' : employee.status === 'assessment_overdue' ? 'overdue' : 'periodic'
  const assistantContext: AssistantContext = {
    subject: t.assistantSubject(fullName(employee)),
    note: t.assistantSubjectNote,
    suggestions: t.assistantSuggestions[situation],
  }

  return (
    <AppLayout withAssistant assistantContext={assistantContext}>
      <BackLink />

      {navState?.created && (
        <p role="status" className="mb-6 flex items-center gap-3 rounded-md bg-positive-soft px-4 py-3 text-positive">
          <CircleCheck aria-hidden className="size-4 shrink-0" />
          {t.created(navState.created, navState.withDocument ?? true)}
        </p>
      )}

      {navState?.completedResult && (
        <p role="status" className="mb-6 flex items-center gap-3 rounded-md bg-positive-soft px-4 py-3 text-positive">
          <CircleCheck aria-hidden className="size-4 shrink-0" />
          {texts.assessment.completedNotice(
            t.result[navState.completedResult],
            employee.next_assessment_due ? formatDate(employee.next_assessment_due) : null,
          )}
        </p>
      )}

      <EmployeeHeader
        employee={employee}
        openDraft={openDraft}
        needsDocument={needsDocument}
        primaryAvailable={assessments.kind === 'ready'}
        creating={creating}
        createError={createError}
        onPrimary={handlePrimary}
      />

      <div className="space-y-12">
        <AssessmentHistory state={assessments} onRetry={() => void loadAssessments()} />
        <JobDescriptionSection
          employee={employee}
          state={docs}
          onRetry={() => void loadDocs()}
          editorOpen={editorOpen}
          notice={notice}
          onOpenEditor={() => {
            setNotice(null)
            setEditorOpen(true)
          }}
          onCloseEditor={() => {
            setEditorOpen(false)
            setNotice(null)
          }}
          onSaved={handleDocumentSaved}
        />
        <NotesSection employeeId={employee.id} />
      </div>
    </AppLayout>
  )
}

function BackLink() {
  return (
    <Link
      to="/przelozony"
      className="mb-4 inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-ink-muted underline-offset-2 hover:text-ink hover:underline"
    >
      <ArrowLeft aria-hidden className="size-4" />
      {texts.wizard.backToList}
    </Link>
  )
}
