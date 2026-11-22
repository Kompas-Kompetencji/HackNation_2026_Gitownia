import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { AppLayout } from '../layout/AppLayout'
import { PageHeader } from '../components/PageHeader'
import { AssessmentCalendar } from '../components/calendar/AssessmentCalendar'
import { Alert, Button } from '../components/ui'
import { listAssessments, listDemoUsers, listMonitoredEmployees, listReminders } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { buildAttention, buildRows, lastReminderFor } from '../lib/hrMonitoring'
import { texts } from '../lib/texts'
import type { AssessmentSummary, EmployeeMonitoring, Reminder } from '../types'
import { AttentionSection } from './hr/AttentionSection'
import { AssessmentsTable } from './hr/AssessmentsTable'
import { EMPTY_FILTERS, type TableFilters } from './hr/filters'
import { ReminderDialog, type ReminderTarget } from './hr/ReminderDialog'

const t = texts.hrHome

type Load =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; employees: EmployeeMonitoring[]; assessments: AssessmentSummary[]; units: Map<string, string> }
type RemindersLoad = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; data: Reminder[] }

type OverviewKey = 'not_started' | 'in_progress' | 'completed' | 'overdue' | 'due_soon'
const OVERVIEW: OverviewKey[] = ['not_started', 'in_progress', 'completed', 'overdue', 'due_soon']

function overviewFilter(key: OverviewKey): TableFilters {
  if (key === 'overdue') return { ...EMPTY_FILTERS, overdue: true }
  if (key === 'due_soon') return { ...EMPTY_FILTERS, dueSoon: true }
  return { ...EMPTY_FILTERS, status: key }
}

function isOverviewActive(key: OverviewKey, f: TableFilters): boolean {
  return JSON.stringify(f) === JSON.stringify(overviewFilter(key))
}

/**
 * Panel kadr: przegląd statusów, „Wymaga uwagi” z przypomnieniami, kalendarz terminów i tabela wszystkich ocen.
 * Kadry widzą tylko status, terminy, rodzaj oceny, wynik końcowy i przełożonego; nie ma stąd drogi do treści oceny.
 */
export function HrHomePage() {
  const [state, setState] = useState<Load>({ kind: 'loading' })
  const [reminders, setReminders] = useState<RemindersLoad>({ kind: 'loading' })
  const [filters, setFilters] = useState<TableFilters>(EMPTY_FILTERS)
  const [target, setTarget] = useState<(ReminderTarget & { key: number }) | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const tableRef = useRef<HTMLDivElement>(null)
  // Fokus wraca po zamknięciu okna do przycisku, który je otworzył.
  const returnFocus = useRef<HTMLElement | null>(null)

  const load = useCallback(() => {
    setState({ kind: 'loading' })
    Promise.all([
      listMonitoredEmployees(),
      listAssessments(),
      // Komórka przełożonego z listy kont; bez niej panel działa dalej (komórki pracowników).
      listDemoUsers().catch(() => []),
    ])
      .then(([employees, assessments, users]) =>
        setState({ kind: 'ready', employees, assessments, units: new Map(users.map((u) => [u.id, u.organizational_unit])) }),
      )
      .catch(() => setState({ kind: 'error' }))
  }, [])

  const loadReminders = useCallback(() => {
    setReminders({ kind: 'loading' })
    listReminders()
      .then((data) => setReminders({ kind: 'ready', data }))
      .catch(() => setReminders({ kind: 'error' }))
  }, [])

  useEffect(load, [load])
  useEffect(loadReminders, [loadReminders])

  const reminderList = useMemo(() => (reminders.kind === 'ready' ? reminders.data : []), [reminders])
  const rows = useMemo(
    () => (state.kind === 'ready' ? buildRows(state.employees, state.assessments, reminderList) : []),
    [state, reminderList],
  )
  const attention = useMemo(
    () => (state.kind === 'ready' ? buildAttention(rows, reminderList, state.units) : []),
    [rows, reminderList, state],
  )

  const counts = useMemo(() => {
    const c: Record<OverviewKey, number> = { not_started: 0, in_progress: 0, completed: 0, overdue: 0, due_soon: 0 }
    for (const r of rows) {
      c[r.process] += 1
      if (r.overdue) c.overdue += 1
      if (r.dueSoon) c.due_soon += 1
    }
    return c
  }, [rows])

  function openReminder(supervisorId: string, preselected: string[]) {
    const all = rows.filter((r) => r.employee.supervisor_id === supervisorId)
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setNotice(null)
    setTarget({ supervisorId, supervisorName: all[0]?.employee.supervisor_name ?? '', rows: all, preselected, key: Date.now() })
  }

  function closeReminder() {
    setTarget(null)
    requestAnimationFrame(() => returnFocus.current?.focus())
  }

  function onSent(reminder: Reminder) {
    setReminders((r) => ({ kind: 'ready', data: [reminder, ...(r.kind === 'ready' ? r.data : [])] }))
    closeReminder()
    setNotice(t.reminder.sent(reminder.supervisor_name, formatDateTime(reminder.created_at)))
  }

  function pickOverview(key: OverviewKey) {
    setFilters((f) => (isOverviewActive(key, f) ? EMPTY_FILTERS : overviewFilter(key)))
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <AppLayout>
      <PageHeader title={t.title} lead={t.lead} />
      {/* Wynik wysłania przypomnienia dla czytników ekranu (region istnieje stale, treść się zmienia). */}
      <p className="sr-only" role="status" aria-live="polite">
        {notice ?? ''}
      </p>

      {state.kind === 'loading' && (
        <p role="status" className="flex items-center gap-2 text-ink-muted">
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          {t.loading}
        </p>
      )}
      {state.kind === 'error' && (
        <Alert action={<Button variant="secondary" className="py-1.5 text-sm" onClick={load}>{texts.common.retry}</Button>}>
          {t.loadError}
        </Alert>
      )}

      {state.kind === 'ready' && (
        <>
          <section aria-labelledby="przeglad" className="mb-10">
            <h2 id="przeglad" className="mb-2 text-sm font-medium tracking-wide text-ink-muted uppercase">
              {t.overview.title}
            </h2>
            <div className="flex flex-wrap divide-x divide-line overflow-hidden rounded-md border border-line bg-surface">
              {OVERVIEW.map((key) => {
                const active = isOverviewActive(key, filters)
                const tone =
                  key === 'overdue' && counts.overdue ? 'text-danger' : key === 'due_soon' && counts.due_soon ? 'text-warning' : 'text-ink'
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    title={t.overview.hint}
                    onClick={() => pickOverview(key)}
                    className={`relative flex min-w-[9rem] flex-1 items-baseline gap-2 px-5 py-4 text-left transition-colors duration-150 hover:bg-paper ${
                      active ? 'bg-accent-soft/70' : ''
                    }`}
                  >
                    <span className={`font-serif text-[1.75rem] leading-none font-semibold tabular-nums ${tone}`}>{counts[key]}</span>
                    <span className="text-sm text-ink-muted">{t.overview.items[key]}</span>
                    {active && <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" />}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-xs text-ink-faint">{t.overview.hint}</p>
          </section>

          {notice && (
            <div className="mb-4">
              <Alert
                tone="positive"
                action={
                  <Button variant="quiet" onClick={() => setNotice(null)}>
                    {t.close}
                  </Button>
                }
              >
                {notice}
              </Alert>
            </div>
          )}
          {reminders.kind === 'error' && (
            <div className="mb-4">
              <Alert action={<Button variant="secondary" className="py-1.5 text-sm" onClick={loadReminders}>{texts.common.retry}</Button>}>
                {t.remindersError}
              </Alert>
            </div>
          )}

          <AttentionSection
            groups={attention}
            remindersReady={reminders.kind === 'ready'}
            onRemind={(g) => openReminder(g.supervisorId, g.rows.map((r) => r.employee.id))}
          />

          <AssessmentCalendar role="hr" onRemind={(e) => openReminder(e.supervisor_id, [e.employee_id])} />

          <div ref={tableRef} className="scroll-mt-6">
            <AssessmentsTable
              rows={rows}
              filters={filters}
              onFilters={setFilters}
              remindersReady={reminders.kind === 'ready'}
              onRemind={(r) => openReminder(r.employee.supervisor_id, [r.employee.id])}
            />
          </div>
        </>
      )}

      {target && (
        <ReminderDialog
          key={target.key}
          target={target}
          lastReminder={lastReminderFor(reminderList, target.supervisorId)}
          onClose={closeReminder}
          onSent={onSent}
        />
      )}
    </AppLayout>
  )
}
