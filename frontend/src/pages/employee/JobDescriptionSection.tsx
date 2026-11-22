import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { CircleCheck, FilePen, FileText, LoaderCircle, Upload } from 'lucide-react'
import { Alert, Button, FieldError } from '../../components/ui'
import { attachJobDescription } from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import { texts } from '../../lib/texts'
import type { Employee, JobDescriptionDocument } from '../../types'
import { emptyDocument, toConfirmed, type DocumentData } from '../wizard/model'
import type { SectionState } from './sectionState'
import { StepDocument } from '../wizard/StepDocument'

const MAX_BYTES = 10 * 1024 * 1024

/**
 * Opis stanowiska pracy: aktualna wersja, poprzednie wersje i wgranie nowej.
 * Ocena okresowa: analyzeOsp + potwierdzenie arkusza i kryteriów. Pierwsza ocena: tylko archiwum.
 */
export function JobDescriptionSection({
  employee,
  state,
  onRetry,
  editorOpen,
  notice,
  onOpenEditor,
  onCloseEditor,
  onSaved,
}: {
  employee: Employee
  state: SectionState<JobDescriptionDocument[]>
  onRetry: () => void
  editorOpen: boolean
  /** Komunikat nad edytorem, np. prośba o opis przed oceną okresową. */
  notice: string | null
  onOpenEditor: () => void
  onCloseEditor: () => void
  onSaved: (doc: JobDescriptionDocument) => Promise<void>
}) {
  const t = texts.employee.document
  const isFirst = employee.assessment_kind === 'first'
  const documents = state.kind === 'ready' ? state.data : []
  const sorted = [...documents].sort((a, b) => b.version - a.version)
  const [current, ...previous] = sorted
  const [saved, setSaved] = useState<{ version: number; form: string | null; forAssessment: boolean } | null>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const openButtonRef = useRef<HTMLButtonElement>(null)
  const savedRef = useRef<HTMLParagraphElement>(null)

  // Po zapisie fokus na potwierdzenie, żeby czytnik ekranu je odczytał, a klawiatura wróciła do sekcji.
  useEffect(() => {
    if (saved && !editorOpen) savedRef.current?.focus()
  }, [saved, editorOpen])

  // Po otwarciu edytora fokus na jego początek (także gdy otwiera go główny przycisk).
  useEffect(() => {
    if (editorOpen) {
      editorRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      editorRef.current?.focus()
    }
  }, [editorOpen])

  async function handleSaved(doc: JobDescriptionDocument) {
    await onSaved(doc)
    setSaved({
      version: doc.version,
      form: doc.analysis ? texts.wizard.document.formOptions[doc.analysis.suggested_form].label : null,
      // Edytor otwarty głównym przyciskiem (z prośbą o opis) → podpowiedź, co dalej.
      forAssessment: notice !== null && !isFirst,
    })
  }

  function close() {
    onCloseEditor()
    // Fokus wraca na przycisk, który otworzył edytor.
    requestAnimationFrame(() => openButtonRef.current?.focus())
  }

  return (
    <section aria-labelledby="opis-stanowiska">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 id="opis-stanowiska" className="text-title font-semibold text-ink">
          {t.title}
        </h2>
        {!editorOpen && state.kind === 'ready' && (
          <Button ref={openButtonRef} variant="secondary" onClick={() => { setSaved(null); onOpenEditor() }} className="py-2 text-sm">
            <FilePen aria-hidden className="size-4" />
            {current ? t.change : t.add}
          </Button>
        )}
      </div>

      {state.kind === 'loading' && (
        <p role="status" className="flex items-center gap-2 text-ink-muted">
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          {texts.common.loading}
        </p>
      )}
      {state.kind === 'error' && (
        <Alert
          action={
            <Button variant="secondary" onClick={onRetry} className="py-1.5 text-sm">
              {texts.common.retry}
            </Button>
          }
        >
          {t.loadError}
        </Alert>
      )}

      {saved && !editorOpen && (
        <p
          ref={savedRef}
          tabIndex={-1}
          role="status"
          className="mb-3 flex items-start gap-2 rounded-md bg-positive-soft px-4 py-2.5 text-positive focus:outline-none focus-visible:outline-2 focus-visible:outline-accent"
        >
          <CircleCheck aria-hidden className="mt-1 size-4 shrink-0" />
          <span>
            {t.saved(saved.version, saved.form)}
            {saved.forAssessment && <span className="block text-ink">{t.readyForAssessment}</span>}
          </span>
        </p>
      )}

      {editorOpen && (
        <div
          ref={editorRef}
          tabIndex={-1}
          aria-label={current ? t.change : t.add}
          className="mb-4 scroll-mt-24 rounded-md border border-accent/40 bg-surface p-6 focus:outline-none"
        >
          {notice && (
            <p className="mb-5 rounded-md bg-accent-soft px-4 py-3 text-ink">{notice}</p>
          )}
          {isFirst ? (
            <ArchiveUpload employeeId={employee.id} onCancel={close} onSaved={handleSaved} />
          ) : (
            <AnalyzedUpload employeeId={employee.id} onCancel={close} onSaved={handleSaved} />
          )}
        </div>
      )}

      {state.kind !== 'ready' ? null : current ? (
        <div className="rounded-md border border-line bg-surface">
          <div className="flex items-start gap-3 px-5 py-4">
            <FileText aria-hidden className="mt-0.5 size-5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink-muted">{t.current}</p>
              <p className="truncate font-medium text-ink">{current.filename}</p>
              <p className="text-sm text-ink-muted">
                {t.version(current.version)}, {t.uploadedAt(formatDateTime(current.uploaded_at))}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm text-ink-muted">{t.detectedForm}</p>
              <p className="font-medium text-ink">
                {current.analysis ? texts.wizard.document.formOptions[current.analysis.suggested_form].label : t.archiveOnly}
              </p>
            </div>
          </div>
          {current.analysis && (
            <div className="border-t border-line px-5 py-3 text-sm">
              <span className="text-ink-muted">{texts.wizard.document.criteria}: </span>
              <span className="text-ink">{current.analysis.additional_criteria.map((c) => c.name).join(', ')}</span>
            </div>
          )}
          {previous.length > 0 && (
            <div className="border-t border-line px-5 py-3">
              <h3 className="mb-1.5 text-sm font-medium text-ink-muted">{t.versionsTitle}</h3>
              <ol className="space-y-1 text-sm">
                {previous.map((d) => (
                  <li key={d.id} className="flex gap-3">
                    <span className="w-20 shrink-0 text-ink-muted">{t.version(d.version)}</span>
                    <span className="min-w-0 flex-1 truncate text-ink">{d.filename}</span>
                    <span className="shrink-0 text-ink-muted">{formatDateTime(d.uploaded_at)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      ) : (
        !editorOpen && (
          <p className="rounded-md border border-dashed border-line-strong px-5 py-4 text-ink-muted">
            {isFirst ? t.emptyFirst : t.empty}
          </p>
        )
      )}
    </section>
  )
}

/** Ocena okresowa: plik → analyzeOsp → poprawki i potwierdzenie → nowa wersja. */
function AnalyzedUpload({
  employeeId,
  onCancel,
  onSaved,
}: {
  employeeId: string
  onCancel: () => void
  onSaved: (doc: JobDescriptionDocument) => Promise<void>
}) {
  const t = texts.employee.document
  const [doc, setDoc] = useState<DocumentData>(emptyDocument)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  async function save() {
    if (!doc.file || !doc.analysis || !doc.edited) return
    setSaving(true)
    setError(false)
    try {
      const saved = await attachJobDescription(employeeId, doc.file, toConfirmed(doc.analysis, doc.edited))
      await onSaved(saved)
    } catch {
      setError(true)
      setSaving(false)
    }
  }

  return (
    <>
      <StepDocument
        value={doc}
        onChange={setDoc}
        onBack={onCancel}
        onNext={() => void save()}
        saving={saving}
        labels={{ back: t.cancel, confirm: t.saveVersion, saving: t.saving }}
      />
      {error && (
        <div className="mt-4">
          <Alert>{t.saveError}</Alert>
        </div>
      )}
    </>
  )
}

/** Pierwsza ocena: plik .docx tylko do archiwum, bez analizy. */
function ArchiveUpload({
  employeeId,
  onCancel,
  onSaved,
}: {
  employeeId: string
  onCancel: () => void
  onSaved: (doc: JobDescriptionDocument) => Promise<void>
}) {
  const t = texts.employee.document
  const d = texts.wizard.document
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const baseId = useId()

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const f = event.target.files?.[0]
    event.target.value = ''
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.docx')) return setFileError(d.errors.format)
    if (f.size > MAX_BYTES) return setFileError(d.errors.size)
    setFileError(null)
    setFile(f)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!file) {
      setFileError(d.errors.missing)
      inputRef.current?.focus()
      return
    }
    setSaving(true)
    setSaveError(false)
    try {
      await onSaved(await attachJobDescription(employeeId, file))
    } catch {
      setSaveError(true)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <p className="text-ink-muted">{t.firstLead}</p>
      <div>
        <p id={`${baseId}-label`} className="mb-1.5 font-medium text-ink">
          {d.fileLabel}
        </p>
        <div className={`flex items-center gap-4 rounded-md border bg-surface px-4 py-4 ${fileError ? 'border-danger' : 'border-line-strong'}`}>
          <FileText aria-hidden className="size-5 shrink-0 text-ink-muted" />
          <p className={`min-w-0 flex-1 truncate ${file ? 'font-medium text-ink' : 'text-ink-muted'}`} aria-live="polite">
            {file ? file.name : d.fileHint}
          </p>
          <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-md border border-line-strong bg-surface px-4 py-2 font-medium text-ink transition-colors duration-150 hover:bg-sunken has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent">
            <Upload aria-hidden className="size-4" />
            {file ? d.replaceFile : d.chooseFile}
            <input
              ref={inputRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFile}
              aria-labelledby={`${baseId}-label`}
              aria-describedby={fileError ? `${baseId}-blad` : undefined}
              aria-invalid={!!fileError}
              className="sr-only"
            />
          </label>
        </div>
        {fileError && (
          <div role="alert">
            <FieldError id={`${baseId}-blad`}>{fileError}</FieldError>
          </div>
        )}
      </div>
      {saveError && <Alert>{t.saveError}</Alert>}
      <div className="flex items-center justify-between border-t border-line pt-5">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          {t.cancel}
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
          {saving ? t.saving : t.saveVersion}
        </Button>
      </div>
    </form>
  )
}
