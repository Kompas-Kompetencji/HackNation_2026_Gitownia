import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { LoaderCircle, Lock, NotebookPen } from 'lucide-react'
import { Alert, Button, FieldError } from '../../components/ui'
import { inputClass } from '../../components/styles'
import { addNote, listNotes } from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import { texts } from '../../lib/texts'
import type { Note } from '../../types'

const MAX_LENGTH = 500
type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; notes: Note[] }

/** Szybkie notatki przełożonego: zapis z datą i godziną, lista od najnowszej. */
export function NotesSection({ employeeId }: { employeeId: string }) {
  const t = texts.employee.notes
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState(false)
  const fieldId = useId()

  const load = useCallback(() => {
    setState({ kind: 'loading' })
    listNotes(employeeId)
      .then((notes) => setState({ kind: 'ready', notes }))
      .catch(() => setState({ kind: 'error' }))
  }, [employeeId])

  useEffect(load, [load])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) {
      setFieldError(t.emptyError)
      document.getElementById(fieldId)?.focus()
      return
    }
    setSaving(true)
    setSaveError(false)
    try {
      const note = await addNote(employeeId, trimmed)
      setText('')
      setState((s) => (s.kind === 'ready' ? { kind: 'ready', notes: [note, ...s.notes] } : s))
    } catch {
      setSaveError(true)
    } finally {
      setSaving(false)
    }
  }

  const notes =
    state.kind === 'ready' ? [...state.notes].sort((a, b) => b.created_at.localeCompare(a.created_at)) : []

  return (
    <section aria-labelledby="notatki">
      <h2 id="notatki" className="mb-3 text-title font-semibold text-ink">
        {t.title}
      </h2>

      <form onSubmit={handleSubmit} noValidate className="rounded-md border border-line bg-surface p-5">
        <label htmlFor={fieldId} className="mb-1.5 block font-medium text-ink">
          {t.label}
        </label>
        <textarea
          id={fieldId}
          rows={2}
          maxLength={MAX_LENGTH}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            if (fieldError) setFieldError(null)
          }}
          onKeyDown={(e) => {
            // Ctrl+Enter zapisuje notatkę bez sięgania po mysz.
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              e.currentTarget.form?.requestSubmit()
            }
          }}
          placeholder={t.placeholder}
          aria-invalid={!!fieldError}
          aria-describedby={`${fieldId}-info${fieldError ? ` ${fieldId}-blad` : ''}`}
          className={`${inputClass(!!fieldError)} resize-y`}
        />
        {fieldError && <FieldError id={`${fieldId}-blad`}>{fieldError}</FieldError>}
        <div className="mt-2 flex items-start justify-between gap-4">
          <p id={`${fieldId}-info`} className="flex items-center gap-1.5 text-sm text-ink-muted">
            <Lock aria-hidden className="size-3.5 shrink-0" />
            {t.privacy}
          </p>
          <p className="shrink-0 text-sm text-ink-muted tabular-nums">{t.counter(text.length, MAX_LENGTH)}</p>
        </div>
        {saveError && (
          <div className="mt-3">
            <Alert>{t.saveError}</Alert>
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={saving} className="py-2">
            {saving && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
            {saving ? t.saving : t.save}
          </Button>
        </div>
      </form>

      <div className="mt-4" aria-live="polite">
        {state.kind === 'loading' && (
          <p role="status" className="flex items-center gap-2 text-ink-muted">
            <LoaderCircle aria-hidden className="size-4 animate-spin" />
            {texts.common.loading}
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
        {state.kind === 'ready' && notes.length === 0 && (
          <p className="flex items-center gap-3 rounded-md border border-dashed border-line-strong px-5 py-4 text-ink-muted">
            <NotebookPen aria-hidden className="size-4 shrink-0" />
            {t.empty}
          </p>
        )}
        {notes.length > 0 && (
          <ol className="divide-y divide-line rounded-md border border-line bg-surface">
            {notes.map((n) => (
              <li key={n.id} className="px-5 py-3">
                <p className="text-sm text-ink-muted tabular-nums">
                  <time dateTime={n.created_at}>{formatDateTime(n.created_at)}</time>
                </p>
                <p className="mt-0.5 whitespace-pre-line text-ink">{n.text}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
