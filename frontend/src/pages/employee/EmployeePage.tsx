import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CircleCheck, LoaderCircle, ShieldAlert, UserX } from 'lucide-react'
import { AppLayout } from '../../layout/AppLayout'
import { EmptyState } from '../../components/EmptyState'
import { Alert, Button } from '../../components/ui'
import { ApiError, createAssessmentDraft, getEmployee, listAssessments, listJobDescriptions } from '../../lib/api'
import { fullName } from '../../lib/format'
import { texts } from '../../lib/texts'
import type { AssessmentSummary, Employee, JobDescriptionDocument } from '../../types'
import type { AssistantContext } from '../../assistant/AssistantPanel'
import { EmployeeHeader } from './EmployeeHeader'
import { AssessmentHistory } from './AssessmentHistory'
import { JobDescriptionSection } from './JobDescriptionSection'
import { NotesSection } from './NotesSection'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'not_found' }
  | { kind: 'forbidden' }
  | { kind: 'ready'; employee: Employee; documents: JobDescriptionDocument[]; assessments: AssessmentSummary[] }

const OPEN_STATUSES = ['draft', 'awaiting_interview']

/** Panel pracownika: szczegóły, terminy, historia ocen, opis stanowiska, notatki i asystent z kontekstem. */
export function EmployeePage() {
  const t = texts.employee
  const { employeeId = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const navState = location.state as { created?: string; withDocument?: boolean } | null
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [editorOpen, setEditorOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingCreate, setPendingCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(false)

  const fetchAll = useCallback(async () => {
    const employee = await getEmployee(employeeId)
    if (!employee) return { kind: 'not_found' } as const
    const [documents, assessments] = await Promise.all([
      listJobDescriptions(employeeId),
      listAssessments({ employee_id: employeeId }),
    ])
    return { kind: 'ready', employee, documents, assessments } as const
  }, [employeeId])

  const load = useCallback(() => {
    setState({ kind: 'loading' })
    fetchAll()
      .then(setState)
      .catch((error) => setState(error instanceof ApiError && error.status === 403 ? { kind: 'forbidden' } : { kind: 'error' }))
  }, [fetchAll])

  useEffect(load, [load])

  const createDraft = useCallback(
    async (employee: Employee) => {
      setCreating(true)
      setCreateError(false)
      try {
        const draft = await createAssessmentDraft({ employee_id: employee.id, kind: employee.assessment_kind })
        navigate(`/przelozony/oceny/${draft.id}`)
      } catch {
        setCreateError(true)
        setCreating(false)
      }
    },
    [navigate],
  )

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
        {state.kind === 'forbidden' && (
          <div className="mt-6">
            <EmptyState icon={ShieldAlert} title={t.forbiddenTitle} body={t.forbiddenBody} />
          </div>
        )}
      </AppLayout>
    )
  }

  const { employee, documents, assessments } = state
  const openDraft = assessments.find((a) => OPEN_STATUSES.includes(a.status)) ?? null
  const needsDocument = employee.assessment_kind === 'periodic' && (documents.length === 0 || !employee.form)

  function handlePrimary() {
    if (openDraft) return navigate(`/przelozony/oceny/${openDraft.id}`)
    if (needsDocument) {
      setNotice(t.actions.needsDocument)
      setPendingCreate(true)
      setEditorOpen(true)
      return
    }
    void createDraft(employee)
  }

  async function handleDocumentSaved() {
    const fresh = await fetchAll()
    setState(fresh)
    setEditorOpen(false)
    setNotice(null)
    if (pendingCreate && fresh.kind === 'ready') {
      setPendingCreate(false)
      await createDraft(fresh.employee)
    }
  }

  const situation = employee.assessment_kind === 'first' ? 'first' : employee.status === 'assessment_overdue' ? 'overdue' : 'periodic'
  const assistantContext: AssistantContext = {
    subject: t.assistantSubject(fullName(employee)),
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

      <EmployeeHeader
        employee={employee}
        openDraft={openDraft}
        creating={creating}
        createError={createError}
        onPrimary={handlePrimary}
      />

      <div className="space-y-12">
        <AssessmentHistory assessments={assessments} />
        <JobDescriptionSection
          employee={employee}
          documents={documents}
          editorOpen={editorOpen}
          notice={notice}
          onOpenEditor={() => {
            setNotice(null)
            setPendingCreate(false)
            setEditorOpen(true)
          }}
          onCloseEditor={() => {
            setEditorOpen(false)
            setNotice(null)
            setPendingCreate(false)
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
