import { useId, useState } from 'react'
import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { Dialog } from '../../components/Dialog'
import { Alert, Button } from '../../components/ui'
import { inputClass } from '../../components/styles'
import { sendReminder, ApiError } from '../../lib/api'
import { formatDate, formatDateTime } from '../../lib/format'
import { isRecent, type MonitoringRow } from '../../lib/hrMonitoring'
import { defaultMessage } from './reminderText'
import { texts } from '../../lib/texts'
import { REMINDER_MAX_LENGTH, type Reminder } from '../../types'

const t = texts.hrHome.reminder

export interface ReminderTarget {
  supervisorId: string
  supervisorName: string
  /** Wszyscy pracownicy przełożonego (do zaznaczenia). */
  rows: MonitoringRow[]
  /** Pracownicy zaznaczeni na starcie (np. ci, którzy wymagają uwagi). */
  preselected: string[]
}

/**
 * Okno przypomnienia: wybór pracowników, edytowalna treść, ostrzeżenie o przypomnieniu z ostatniej doby.
 * Natywny <dialog> zapewnia pułapkę fokusu i zamykanie klawiszem Escape. Błąd backendu nie jest ukrywany.
 */
export function ReminderDialog({
  target,
  lastReminder,
  onClose,
  onSent,
}: {
  target: ReminderTarget
  lastReminder: Reminder | null
  onClose: () => void
  onSent: (reminder: Reminder) => void
}) {
  const uid = useId()
  const [selected, setSelected] = useState<string[]>(target.preselected)
  const [message, setMessage] = useState(() => defaultMessage(target.rows, target.preselected))
  const [edited, setEdited] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  const recent = isRecent(lastReminder)
  const trimmed = message.trim()
  const messageError = !trimmed ? t.empty : trimmed.length > REMINDER_MAX_LENGTH ? t.tooLong(REMINDER_MAX_LENGTH) : null
  const canSend = !messageError && (!recent || confirmed) && !sending

  function toggle(id: string) {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
    setSelected(next)
    // Dopóki osoba z kadr nie zmieniła treści, lista pracowników w treści nadąża za zaznaczeniem.
    if (!edited) setMessage(defaultMessage(target.rows, next))
  }

  async function submit() {
    setTouched(true)
    if (!canSend) return
    setSending(true)
    setError(null)
    try {
      const reminder = await sendReminder(target.supervisorId, selected, trimmed)
      onSent(reminder)
    } catch (e) {
      setError(e instanceof ApiError && e.message ? e.message : t.error)
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog
      open
      title={t.title(target.supervisorName)}
      onCancel={() => !sending && onClose()}
      actions={
        <>
          <Button onClick={submit} disabled={sending || (recent && !confirmed)} aria-describedby={recent && !confirmed ? `${uid}-dublet` : undefined}>
            {sending && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
            {sending ? t.sending : t.send}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={sending}>
            {t.cancel}
          </Button>
        </>
      }
    >
      <p className="text-sm">{t.intro}</p>

      {recent && lastReminder && (
        <div id={`${uid}-dublet`} className="mt-4 rounded-md border border-warning/40 bg-warning-soft px-4 py-3 text-warning">
          <p className="flex items-center gap-2 font-medium">
            <TriangleAlert aria-hidden className="size-4 shrink-0" />
            {t.recentTitle}
          </p>
          <p className="mt-1 text-sm">{t.recentBody(formatDateTime(lastReminder.created_at))}</p>
          <label className="mt-2 flex items-start gap-2 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 size-4 accent-accent"
            />
            {t.recentConfirm}
          </label>
        </div>
      )}

      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-ink">{t.employees}</legend>
        <p className="text-xs text-ink-muted">{t.employeesHint}</p>
        {target.rows.length === 0 ? (
          <p className="mt-2 text-sm">{t.noEmployees}</p>
        ) : (
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-md border border-line px-3 py-2">
            {target.rows.map((row) => (
              <li key={row.employee.id}>
                <label className="flex items-baseline gap-2 py-0.5 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={selected.includes(row.employee.id)}
                    onChange={() => toggle(row.employee.id)}
                    className="size-4 translate-y-0.5 accent-accent"
                  />
                  <span className="font-medium">{row.employeeName}</span>
                  <span className="text-ink-muted">
                    {texts.hrHome.kind[row.kind]}
                    {row.due && `, ${t.due(formatDate(row.due))}`}
                    {row.overdue && ` · ${texts.hrHome.attention.reasons.overdue.toLowerCase()}`}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <div className="mt-4">
        <label htmlFor={`${uid}-tresc`} className="text-sm font-medium text-ink">
          {t.message}
        </label>
        <textarea
          id={`${uid}-tresc`}
          rows={9}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value)
            setEdited(true)
          }}
          aria-invalid={touched && messageError ? true : undefined}
          aria-describedby={`${uid}-licznik${touched && messageError ? ` ${uid}-blad` : ''}`}
          className={`mt-1.5 resize-y font-sans text-sm leading-relaxed ${inputClass(Boolean(touched && messageError))}`}
        />
        <div className="mt-1 flex justify-between gap-4 text-xs">
          <span id={`${uid}-blad`} className="text-danger">
            {touched && messageError}
          </span>
          <span
            id={`${uid}-licznik`}
            className={`tabular-nums ${trimmed.length > REMINDER_MAX_LENGTH ? 'text-danger' : 'text-ink-muted'}`}
          >
            {t.counter(trimmed.length, REMINDER_MAX_LENGTH)}
          </span>
        </div>
      </div>

      {error && (
        <div className="mt-4">
          <Alert
            action={
              <Button variant="secondary" className="py-1.5 text-sm" onClick={submit} disabled={sending}>
                {t.retry}
              </Button>
            }
          >
            <p className="font-medium">{t.error}</p>
            <p className="text-sm">{error}</p>
          </Alert>
        </div>
      )}
    </Dialog>
  )
}
