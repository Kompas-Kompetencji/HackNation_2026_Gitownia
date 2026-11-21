import { useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, FileText, Upload, X } from 'lucide-react'
import { Button, FieldError } from '../../components/ui'
import { inputClass } from '../../components/styles'
import { texts } from '../../lib/texts'
import type { FirstDocumentData } from './model'

const MAX_BYTES = 10 * 1024 * 1024

/**
 * Ścieżka pierwszej oceny, krok 2: nazwa stanowiska i opcjonalny opis stanowiska (.docx)
 * do archiwum i rozmowy wstępnej. Bez analyzeOsp, bez arkusza B lub C i kryteriów dodatkowych.
 */
export function StepFirstDocument({
  value,
  onChange,
  onBack,
  onNext,
}: {
  value: FirstDocumentData
  onChange: (v: FirstDocumentData) => void
  onBack: () => void
  onNext: () => void
}) {
  const t = texts.wizard.firstDocument
  const d = texts.wizard.document
  const [fileError, setFileError] = useState<string | null>(null)
  const [titleError, setTitleError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const baseId = useId()
  const id = (name: string) => `${baseId}-${name}`

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.docx')) {
      setFileError(d.errors.format)
      return
    }
    if (file.size > MAX_BYTES) {
      setFileError(d.errors.size)
      return
    }
    setFileError(null)
    onChange({ ...value, file })
  }

  function removeFile() {
    onChange({ ...value, file: null })
    setFileError(null)
    fileInputRef.current?.focus()
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!value.position_title.trim()) {
      setTitleError(t.positionTitleError)
      document.getElementById(id('title'))?.focus()
      return
    }
    onNext()
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-8">
      <p className="text-ink-muted">{t.lead}</p>

      <div className="max-w-md">
        <label htmlFor={id('title')} className="mb-1.5 block font-medium text-ink">
          {t.positionTitle}
        </label>
        <input
          id={id('title')}
          type="text"
          value={value.position_title}
          onChange={(e) => {
            onChange({ ...value, position_title: e.target.value })
            if (titleError && e.target.value.trim()) setTitleError(null)
          }}
          aria-required
          aria-invalid={!!titleError}
          aria-describedby={titleError ? id('title-blad') : undefined}
          className={inputClass(!!titleError)}
        />
        {titleError && <FieldError id={id('title-blad')}>{titleError}</FieldError>}
      </div>

      <div>
        <p id={id('file-label')} className="mb-1.5 font-medium text-ink">
          {t.fileLabel}
        </p>
        <div className={`flex items-center gap-4 rounded-md border bg-surface px-4 py-4 ${fileError ? 'border-danger' : 'border-line-strong'}`}>
          <FileText aria-hidden className="size-5 shrink-0 text-ink-muted" />
          <div className="min-w-0 flex-1" aria-live="polite">
            {value.file ? (
              <p className="truncate font-medium text-ink">{value.file.name}</p>
            ) : (
              <p id={id('file-hint')} className="text-ink-muted">
                {d.fileHint}
              </p>
            )}
          </div>
          {value.file && (
            <Button variant="secondary" onClick={removeFile} className="py-2">
              <X aria-hidden className="size-4" />
              {t.removeFile}
            </Button>
          )}
          <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-md border border-line-strong bg-surface px-4 py-2 font-medium text-ink transition-colors duration-150 hover:bg-sunken has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent">
            <Upload aria-hidden className="size-4" />
            {value.file ? d.replaceFile : d.chooseFile}
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFile}
              aria-labelledby={id('file-label')}
              aria-describedby={fileError ? id('file-error') : value.file ? undefined : id('file-hint')}
              aria-invalid={!!fileError}
              className="sr-only"
            />
          </label>
        </div>
        {fileError && (
          <div role="alert">
            <FieldError id={id('file-error')}>{fileError}</FieldError>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-line pt-6">
        <Button variant="secondary" onClick={onBack}>
          <ArrowLeft aria-hidden className="size-4" />
          {texts.wizard.back}
        </Button>
        <Button type="submit">
          {texts.wizard.next}
          <ArrowRight aria-hidden className="size-4" />
        </Button>
      </div>
    </form>
  )
}
