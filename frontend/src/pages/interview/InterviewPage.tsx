import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { CircleAlert, CircleCheck, LoaderCircle, MessagesSquare, Save, Sparkles } from 'lucide-react'
import { AppLayout } from '../../layout/AppLayout'
import { Alert, Button, ButtonLink } from '../../components/ui'
import type { AssistantContext, AssistantRequest } from '../../assistant/AssistantPanel'
import { formStateFromDetail } from '../../assistant/formState'
import { addNote, ApiError, getAssessment, getCompetencies, listJobDescriptions, saveAssessmentDraft } from '../../lib/api'
import { formatDate } from '../../lib/format'
import { texts } from '../../lib/texts'
import type { AssessmentDetail, AssessmentDraftInput, CompetencyModel, Level } from '../../types'
import { BackLink } from '../assessment/BackLink'

const t = texts.interview

type Load =
  | { kind: 'loading' }
  | { kind: 'error'; forbidden: boolean }
  | { kind: 'ready'; detail: AssessmentDetail; model: CompetencyModel; position: { title: string; unit: string } }

type SectionKey = 'opening' | 'strengths' | 'development' | 'employee' | 'agreements'
const SECTIONS: SectionKey[] = ['opening', 'strengths', 'development', 'employee', 'agreements']

interface CriterionTalk {
  id: string
  name: string
  level: Level | null
  behaviours: string[]
  examples: string[]
  noBasis: number
}

const today = () => new Date().toISOString().slice(0, 10)

/** Ekran na czas rozmowy oceniającej: agenda z arkusza, pytania AI, notatki zapisywane do arkusza. */
export function InterviewPage() {
  const { assessmentId = '' } = useParams()
  const [state, setState] = useState<Load>({ kind: 'loading' })

  const load = useCallback(() => {
    setState({ kind: 'loading' })
    Promise.all([getAssessment(assessmentId), getCompetencies()])
      .then(async ([detail, model]) => {
        if (!detail) return setState({ kind: 'error', forbidden: false })
        const docs = await listJobDescriptions(detail.employee_id).catch(() => [])
        const last = docs.at(-1)?.analysis
        setState({ kind: 'ready', detail, model, position: { title: last?.position_title ?? '', unit: last?.organizational_unit ?? '' } })
      })
      .catch((e) => setState({ kind: 'error', forbidden: e instanceof ApiError && e.status === 403 }))
  }, [assessmentId])
  useEffect(load, [load])

  if (state.kind === 'loading') {
    return (
      <AppLayout>
        <p role="status" className="flex items-center gap-2 text-ink-muted">
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          {texts.common.loading}
        </p>
      </AppLayout>
    )
  }
  if (state.kind === 'error') {
    return (
      <AppLayout>
        <BackLink />
        <Alert action={<Button variant="secondary" className="py-1.5 text-sm" onClick={load}>{texts.common.retry}</Button>}>
          {state.forbidden ? t.forbidden : texts.assessment.loadError}
        </Alert>
      </AppLayout>
    )
  }
  return <Interview detail={state.detail} model={state.model} position={state.position} />
}

function Interview({
  detail,
  model,
  position,
}: {
  detail: AssessmentDetail
  model: CompetencyModel
  position: { title: string; unit: string }
}) {
  const { formState, criteria } = useMemo(() => formStateFromDetail(detail, model, position), [detail, model, position])
  const [discussed, setDiscussed] = useState<Record<SectionKey, boolean>>({ opening: false, strengths: false, development: false, employee: false, agreements: false })
  const [date, setDate] = useState(detail.evaluation_interview_date ?? today())
  const [employeeView, setEmployeeView] = useState('')
  const [agreements, setAgreements] = useState(detail.development_conclusions ?? '')
  const [save, setSave] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [request, setRequest] = useState<AssistantRequest | undefined>()
  const readOnly = detail.status === 'completed'

  const talks: CriterionTalk[] = criteria.map(({ competency: c }) => {
    const decision = detail.decisions.find((d) => d.competency_id === c.competency_id)
    const answers = detail.answers.filter((a) => a.competency_id === c.competency_id)
    const behaviours: string[] = []
    const examples: string[] = []
    let noBasis = 0
    for (const a of answers) {
      if (a.selected_level === null) {
        noBasis += 1
        continue
      }
      const ind = c.indicators.find((i) => i.indicator_id === a.indicator_id)
      const desc = ind?.level_descriptions?.[a.selected_level]
      if (desc) behaviours.push(desc)
      const s = a.star_note
      if (s && (s.situation || s.action || s.result)) examples.push([s.situation, s.action, s.result].filter(Boolean).join(' → '))
    }
    return { id: c.competency_id, name: c.name, level: decision?.selected_level ?? null, behaviours, examples, noBasis }
  })
  // Skala 1–9 i 3/5/7: powyżej oczekiwań od 7, poniżej oczekiwań do 3.
  const strengths = talks.filter((c) => c.level !== null && c.level >= 7)
  const development = talks.filter((c) => (c.level !== null && c.level <= 3) || c.examples.length === 0)
  const doneCount = SECTIONS.filter((k) => discussed[k]).length

  const assistantContext: AssistantContext = {
    subject: `${t.title(detail.employee_name)}`,
    note: texts.assessment.assistant.note,
    suggestions: t.suggestions,
    formState,
  }

  async function persist() {
    setSave('saving')
    try {
      const input: AssessmentDraftInput = {
        form: detail.form,
        additional_competency_ids: detail.additional_competency_ids,
        answers: detail.answers,
        decisions: detail.decisions,
        justification_draft: detail.justification_draft,
        last_step: detail.last_step,
        development_conclusions: agreements.trim() || null,
        ...(detail.form === 'first'
          ? {
              exam_status: detail.exam_status ?? null,
              report_on_time: detail.report_on_time ?? null,
              initial_interview_date: detail.initial_interview_date ?? null,
              evaluation_interview_date: date || null,
            }
          : {}),
      }
      await saveAssessmentDraft(detail.id, input)
      if (employeeView.trim()) await addNote(detail.employee_id, t.noteText(formatDate(date), employeeView.trim()))
      setSave('saved')
    } catch {
      setSave('error')
    }
  }

  return (
    <AppLayout withAssistant assistantContext={assistantContext} assistantRequest={request}>
      <BackLink to={`/przelozony/oceny/${detail.id}`} label={t.backToForm} />
      <header className="mb-6 flex items-start justify-between gap-6">
        <div>
          <h1 className="font-serif text-display font-semibold text-ink">{t.title(detail.employee_name)}</h1>
          <p className="mt-1 max-w-2xl text-ink-muted">{t.subtitle}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Button
            variant="secondary"
            onClick={() => setRequest({ id: crypto.randomUUID(), mode: 'interview', label: t.aiButton, question: t.aiQuestion })}
          >
            <Sparkles aria-hidden className="size-4" />
            {t.aiButton}
          </Button>
          <p className="text-sm text-ink-muted tabular-nums" aria-live="polite">{t.progress(doneCount, SECTIONS.length)}</p>
        </div>
      </header>

      {readOnly && <Alert>{t.completedNote}</Alert>}

      <ol className="mt-6 space-y-4">
        <Section n={1} k="opening" discussed={discussed} setDiscussed={setDiscussed}>
          <ul className="list-disc space-y-1 pl-5 text-ink">
            {t.sections.opening.points.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </Section>

        <Section n={2} k="strengths" discussed={discussed} setDiscussed={setDiscussed}>
          {strengths.length === 0 ? <p className="text-ink-muted">{t.sections.strengths.empty}</p> : <CriteriaList items={strengths} />}
        </Section>

        <Section n={3} k="development" discussed={discussed} setDiscussed={setDiscussed}>
          {development.length === 0 ? <p className="text-ink-muted">{t.sections.development.empty}</p> : <CriteriaList items={development} />}
        </Section>

        <Section n={4} k="employee" discussed={discussed} setDiscussed={setDiscussed}>
          <Field label={t.sections.employee.label}>
            {(id) => (
              <textarea id={id} rows={4} value={employeeView} onChange={(e) => setEmployeeView(e.target.value)} placeholder={t.sections.employee.placeholder} disabled={readOnly}
                className="block w-full resize-y rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint" />
            )}
          </Field>
        </Section>

        <Section n={5} k="agreements" discussed={discussed} setDiscussed={setDiscussed}>
          <Field label={t.sections.agreements.label}>
            {(id) => (
              <textarea id={id} rows={4} maxLength={2000} value={agreements} onChange={(e) => setAgreements(e.target.value)} placeholder={t.sections.agreements.placeholder} disabled={readOnly}
                className="block w-full resize-y rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint" />
            )}
          </Field>
        </Section>
      </ol>

      {!readOnly && (
        <div className="sticky bottom-0 mt-8 flex flex-wrap items-end justify-between gap-4 border-t border-line bg-paper py-4">
          <Field label={t.dateLabel} inline>
            {(id) => (
              <input id={id} type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)}
                className="rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm text-ink" />
            )}
          </Field>
          <div className="flex items-center gap-3">
            {save === 'saved' && (
              <p role="status" className="flex items-center gap-1.5 text-sm text-positive">
                <CircleCheck aria-hidden className="size-4" />
                {t.saved}
              </p>
            )}
            {save === 'error' && (
              <p role="alert" className="flex items-center gap-1.5 text-sm text-danger">
                <CircleAlert aria-hidden className="size-4" />
                {t.saveError}
              </p>
            )}
            <ButtonLink variant="secondary" to={`/przelozony/oceny/${detail.id}`}>{t.backToForm}</ButtonLink>
            <Button onClick={() => void persist()} disabled={save === 'saving'}>
              {save === 'saving' ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Save aria-hidden className="size-4" />}
              {save === 'saving' ? t.saving : t.save}
            </Button>
          </div>
        </div>
      )}
    </AppLayout>
  )
}

function Section({
  n,
  k,
  discussed,
  setDiscussed,
  children,
}: {
  n: number
  k: SectionKey
  discussed: Record<SectionKey, boolean>
  setDiscussed: (fn: (d: Record<SectionKey, boolean>) => Record<SectionKey, boolean>) => void
  children: ReactNode
}) {
  const s = t.sections[k]
  const checkId = useId()
  const done = discussed[k]
  return (
    <li className={`rounded-lg border bg-surface p-5 shadow-raised transition-colors duration-150 ${done ? 'border-positive/40' : 'border-line'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className={`flex size-8 shrink-0 items-center justify-center rounded-full font-semibold tabular-nums ${done ? 'bg-positive-soft text-positive' : 'bg-accent-soft text-accent'}`}>
            {done ? <CircleCheck aria-hidden className="size-4" /> : n}
          </span>
          <div>
            <h2 className="text-title font-semibold text-ink">{s.title}</h2>
            <p className="mt-0.5 flex items-start gap-1.5 text-sm text-ink-muted">
              <MessagesSquare aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              {s.hint}
            </p>
          </div>
        </div>
        <label htmlFor={checkId} className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-ink-muted">
          <input id={checkId} type="checkbox" checked={done} onChange={() => setDiscussed((d) => ({ ...d, [k]: !d[k] }))} className="size-4 accent-[var(--color-accent)]" />
          {t.discussed}
        </label>
      </div>
      <div className="mt-4 pl-11">{children}</div>
    </li>
  )
}

function CriteriaList({ items }: { items: CriterionTalk[] }) {
  return (
    <ul className="space-y-3">
      {items.map((c) => (
        <li key={c.id} className="rounded-md bg-sunken px-4 py-3">
          <p className="font-medium text-ink">
            {c.name}
            <span className="ml-2 text-sm font-normal text-ink-muted">
              {c.level !== null ? t.level(c.level) : '—'}
            </span>
          </p>
          {c.behaviours.slice(0, 3).map((b) => (
            <p key={b} className="mt-1 text-sm text-ink">„{b}”</p>
          ))}
          {c.examples.length > 0 ? (
            c.examples.map((e) => <p key={e} className="mt-1 text-sm text-ink-muted">STAR: {e}</p>)
          ) : (
            <p className="mt-1 text-sm text-warning">{t.noExamples}</p>
          )}
        </li>
      ))}
    </ul>
  )
}

function Field({ label, inline = false, children }: { label: string; inline?: boolean; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div className={inline ? 'flex items-center gap-3' : ''}>
      <label htmlFor={id} className={`text-sm font-medium text-ink ${inline ? '' : 'mb-1.5 block'}`}>{label}</label>
      {children(id)}
    </div>
  )
}
