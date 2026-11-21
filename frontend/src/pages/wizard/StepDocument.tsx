import { useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, FileText, LoaderCircle, Upload } from 'lucide-react'
import { Alert, Button, FieldError } from '../../components/ui'
import { inputClass } from '../../components/styles'
import { analyzeOsp } from '../../lib/api'
import { texts } from '../../lib/texts'
import type { AssessmentForm } from '../../types'
import { toEditable, type DocumentData, type EditableAnalysis } from './model'

const MAX_BYTES = 10 * 1024 * 1024
const FORMS: AssessmentForm[] = ['B', 'C']

type FileState = { kind: 'idle' } | { kind: 'analyzing'; name: string } | { kind: 'error'; message: string; retryable: boolean }

type DetectedErrors = Partial<Record<'position_title' | 'subordinates_count' | 'criterion0' | 'criterion1' | 'criterion2', string>>

function validateDetected(e: EditableAnalysis): DetectedErrors {
  const t = texts.wizard.document.errors2
  const errors: DetectedErrors = {}
  if (!e.position_title.trim()) errors.position_title = t.positionTitle
  if (!/^\d+$/.test(e.subordinates_count.trim())) errors.subordinates_count = t.subordinates
  e.criteria.forEach((c, i) => {
    if (!c.trim()) errors[`criterion${i}` as keyof DetectedErrors] = t.criterion
  })
  return errors
}

export function StepDocument({
  value,
  onChange,
  onBack,
  onNext,
  labels,
  saving = false,
}: {
  value: DocumentData
  onChange: (v: DocumentData) => void
  onBack: () => void
  onNext: () => void
  /** Własne etykiety przycisków (np. w panelu pracownika: „Anuluj” i „Zapisz nową wersję”). */
  labels?: { back: string; confirm: string; saving: string }
  saving?: boolean
}) {
  const t = texts.wizard.document
  const [fileState, setFileState] = useState<FileState>({ kind: 'idle' })
  const [errors, setErrors] = useState<DetectedErrors>({})
  const [submitted, setSubmitted] = useState(false)
  const [missingFile, setMissingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const baseId = useId()
  const id = (name: string) => `${baseId}-${name}`

  async function analyze(file: File) {
    setFileState({ kind: 'analyzing', name: file.name })
    onChange({ file, analysis: null, edited: null })
    try {
      const analysis = await analyzeOsp(file)
      onChange({ file, analysis, edited: toEditable(analysis) })
      setFileState({ kind: 'idle' })
    } catch {
      setFileState({ kind: 'error', message: t.errors.upload, retryable: true })
    }
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // pozwala wybrać ten sam plik ponownie
    if (!file) return
    setMissingFile(false)
    setErrors({})
    setSubmitted(false)
    if (!file.name.toLowerCase().endsWith('.docx')) {
      setFileState({ kind: 'error', message: t.errors.format, retryable: false })
      onChange({ file: null, analysis: null, edited: null })
      return
    }
    if (file.size > MAX_BYTES) {
      setFileState({ kind: 'error', message: t.errors.size, retryable: false })
      onChange({ file: null, analysis: null, edited: null })
      return
    }
    void analyze(file)
  }

  function updateEdited(patch: Partial<EditableAnalysis>) {
    if (!value.edited) return
    const edited = { ...value.edited, ...patch }
    onChange({ ...value, edited })
    if (submitted) setErrors(validateDetected(edited))
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (fileState.kind === 'analyzing' || saving) return
    if (!value.file || !value.edited) {
      setMissingFile(true)
      fileInputRef.current?.focus()
      return
    }
    const found = validateDetected(value.edited)
    setErrors(found)
    setSubmitted(true)
    const order: (keyof DetectedErrors)[] = ['position_title', 'subordinates_count', 'criterion0', 'criterion1', 'criterion2']
    const first = order.find((k) => found[k])
    if (first) {
      document.getElementById(id(first))?.focus()
      return
    }
    onNext()
  }

  const fileError =
    fileState.kind === 'error' ? fileState.message : missingFile ? t.errors.missing : null
  const busy = fileState.kind === 'analyzing'
  const edited = value.edited

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-8">
      <p className="text-ink-muted">{t.lead}</p>

      <div>
        <p id={id('file-label')} className="mb-1.5 font-medium text-ink">
          {t.fileLabel}
        </p>
        <div
          className={`flex items-center gap-4 rounded-md border bg-surface px-4 py-4 ${
            fileError ? 'border-danger' : 'border-line-strong border-dashed'
          }`}
        >
          {busy ? (
            <LoaderCircle aria-hidden className="size-5 shrink-0 animate-spin text-accent" />
          ) : (
            <FileText aria-hidden className="size-5 shrink-0 text-ink-muted" />
          )}
          <div className="min-w-0 flex-1" aria-live="polite">
            {busy ? (
              <p className="text-ink">{t.analyzing(fileState.name)}</p>
            ) : value.file ? (
              <p className="truncate font-medium text-ink">{value.file.name}</p>
            ) : (
              <p className="text-ink-muted">{t.fileHint}</p>
            )}
          </div>
          <label
            className={`${busy ? 'pointer-events-none opacity-60' : 'cursor-pointer'} inline-flex shrink-0 items-center gap-2 rounded-md border border-line-strong bg-surface px-4 py-2 font-medium text-ink transition-colors duration-150 hover:bg-sunken has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent`}
          >
            <Upload aria-hidden className="size-4" />
            {value.file ? t.replaceFile : t.chooseFile}
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFile}
              disabled={busy}
              aria-labelledby={id('file-label')}
              aria-describedby={fileError ? id('file-error') : id('file-hint')}
              aria-invalid={!!fileError}
              className="sr-only"
            />
          </label>
        </div>
        {value.file && !fileError && (
          <p id={id('file-hint')} className="mt-1.5 text-sm text-ink-muted">
            {t.fileHint}
          </p>
        )}
        {!value.file && !fileError && <span id={id('file-hint')} hidden />}
        {fileError && (
          <div role="alert">
            <FieldError id={id('file-error')}>{fileError}</FieldError>
            {fileState.kind === 'error' && fileState.retryable && value.file && (
              <Button variant="secondary" className="mt-2 ml-5.5 py-1.5 text-sm" onClick={() => value.file && void analyze(value.file)}>
                {t.retry}
              </Button>
            )}
          </div>
        )}
      </div>

      {edited && value.analysis && (
        <section aria-labelledby={id('detected')} className="animate-panel-in space-y-6 border-t border-line pt-8">
          <div>
            <h3 id={id('detected')} className="text-title font-semibold text-ink">
              {t.detectedTitle}
            </h3>
            <p className="mt-1 text-ink-muted">{t.detectedLead}</p>
          </div>

          {Object.keys(errors).length > 0 && <Alert>{texts.wizard.personal.errorSummary(Object.keys(errors).length)}</Alert>}

          <div className="grid grid-cols-2 gap-5">
            <Field id={id('position_title')} label={t.positionTitle} error={errors.position_title}>
              {(p) => <input {...p} type="text" value={edited.position_title} onChange={(e) => updateEdited({ position_title: e.target.value })} />}
            </Field>
            <Field id={id('unit')} label={t.organizationalUnit} optional>
              {(p) => <input {...p} type="text" value={edited.organizational_unit} onChange={(e) => updateEdited({ organizational_unit: e.target.value })} />}
            </Field>
          </div>

          <div className="max-w-xs">
            <Field id={id('subordinates_count')} label={t.subordinates} hint={t.subordinatesHint} error={errors.subordinates_count}>
              {(p) => (
                <input
                  {...p}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={edited.subordinates_count}
                  onChange={(e) => updateEdited({ subordinates_count: e.target.value })}
                />
              )}
            </Field>
          </div>

          <fieldset>
            <legend className="mb-2 font-medium text-ink">{t.form}</legend>
            <div className="grid grid-cols-2 gap-3">
              {FORMS.map((f) => {
                const checked = edited.form === f
                return (
                  <label
                    key={f}
                    className={`flex cursor-pointer items-start gap-3 rounded-md border px-4 py-3 transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                      checked ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface hover:bg-sunken'
                    }`}
                  >
                    <input
                      type="radio"
                      name="form"
                      value={f}
                      checked={checked}
                      onChange={() => updateEdited({ form: f })}
                      className="mt-1 size-4 accent-accent focus-visible:outline-none"
                    />
                    <span>
                      <span className="flex items-center gap-2 font-medium text-ink">
                        {t.formOptions[f].label}
                        {value.analysis!.suggested_form === f && (
                          <span className="rounded-sm border border-accent/40 px-1.5 text-xs font-medium text-accent">{t.suggested}</span>
                        )}
                      </span>
                      <span className="block text-sm text-ink-muted">{t.formOptions[f].hint}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="font-medium text-ink">{t.criteria}</legend>
            <p className="mt-0.5 mb-3 text-sm text-ink-muted">{t.criteriaLead}</p>
            <ol className="space-y-4">
              {edited.criteria.map((c, i) => {
                const key = `criterion${i}` as keyof DetectedErrors
                return (
                  <li key={i}>
                    <Field
                      id={id(key)}
                      label={t.criterionLabel(i + 1)}
                      hint={`${t.criterionWhy} ${value.analysis!.additional_criteria[i]?.rationale ?? ''}`}
                      error={errors[key]}
                    >
                      {(p) => (
                        <input
                          {...p}
                          type="text"
                          value={c}
                          onChange={(e) => updateEdited({ criteria: edited.criteria.map((x, j) => (j === i ? e.target.value : x)) })}
                        />
                      )}
                    </Field>
                  </li>
                )
              })}
            </ol>
          </fieldset>
        </section>
      )}

      <div className="flex items-center justify-between border-t border-line pt-6">
        <Button variant="secondary" onClick={onBack} disabled={saving}>
          {!labels && <ArrowLeft aria-hidden className="size-4" />}
          {labels?.back ?? texts.wizard.back}
        </Button>
        <Button type="submit" disabled={busy || saving}>
          {saving && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
          {saving ? labels?.saving : (labels?.confirm ?? t.confirm)}
          {!labels && <ArrowRight aria-hidden className="size-4" />}
        </Button>
      </div>
    </form>
  )
}

/** Pole z etykietą nad nim, podpowiedzią i błędem powiązanymi przez aria-describedby. */
function Field({
  id,
  label,
  hint,
  error,
  children,
  optional = false,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  children: (props: {
    id: string
    className: string
    'aria-invalid': boolean
    'aria-describedby'?: string
    'aria-required': boolean
  }) => ReactNode
  optional?: boolean
}) {
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-blad` : ''].filter(Boolean).join(' ') || undefined
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block font-medium text-ink">
        {label}
      </label>
      {children({ id, className: inputClass(!!error), 'aria-invalid': !!error, 'aria-describedby': describedBy, 'aria-required': !optional })}
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {error && <FieldError id={`${id}-blad`}>{error}</FieldError>}
    </div>
  )
}
