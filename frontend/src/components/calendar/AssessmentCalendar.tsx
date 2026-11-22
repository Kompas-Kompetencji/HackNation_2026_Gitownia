import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Clock, LoaderCircle, Mail } from 'lucide-react'
import { Alert, Button } from '../ui'
import { getCalendar } from '../../lib/api'
import { formatDate } from '../../lib/format'
import { texts } from '../../lib/texts'
import type { CalendarEvent, CalendarEventKind, CalendarSeverity } from '../../types'

const t = texts.calendar

type Filter = 'all' | 'first' | 'periodic' | 'other'
type Load<T> = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; data: T }

const FILTER_KINDS: Record<Exclude<Filter, 'all'>, CalendarEventKind[]> = {
  first: ['first_interview', 'report_window', 'first_due'],
  periodic: ['criteria_meeting', 'periodic_due'],
  other: ['contract_end', 'objection_deadline'],
}

/** Kolor = pilność (zawsze razem z tekstem statusu), jak w pozostałych częściach aplikacji. */
const SEVERITY_STYLE: Record<CalendarSeverity, { dot: string; pill: string; text: string }> = {
  overdue: { dot: 'bg-danger', pill: 'bg-danger-soft text-danger', text: 'text-danger' },
  soon: { dot: 'bg-warning', pill: 'bg-warning-soft text-warning', text: 'text-warning' },
  upcoming: { dot: 'bg-accent', pill: 'bg-accent-soft text-accent', text: 'text-accent' },
  past: { dot: 'bg-line-strong', pill: 'bg-sunken text-ink-muted', text: 'text-ink-muted' },
  done: { dot: 'bg-positive', pill: 'bg-positive-soft text-positive', text: 'text-positive' },
}

const monthFormatter = new Intl.DateTimeFormat('pl-PL', { month: 'long' })
const shortMonth = new Intl.DateTimeFormat('pl-PL', { month: 'short' })

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

/** 6 tygodni (42 dni) od poniedziałku tygodnia, w którym zaczyna się miesiąc. */
function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  const start = addDays(first, -offset)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

function matchesFilter(e: CalendarEvent, filter: Filter): boolean {
  return filter === 'all' || FILTER_KINDS[filter].includes(e.kind)
}

/**
 * Kalendarz terminów ocen: kafelki dni miesiąca z terminami oraz panel aktualności (zaległe, najbliższe dni).
 * Zakres danych ustala backend według roli: kadry – wszyscy pracownicy, przełożony – tylko swoi podwładni.
 */
export function AssessmentCalendar({ role }: { role: 'hr' | 'supervisor' }) {
  const today = useMemo(() => new Date(), [])
  const todayIso = iso(today)
  const [cursor, setCursor] = useState(() => ({ year: today.getFullYear(), month: today.getMonth() }))
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [grid, setGrid] = useState<Load<CalendarEvent[]>>({ kind: 'loading' })
  const [news, setNews] = useState<Load<CalendarEvent[]>>({ kind: 'loading' })

  const days = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor])

  const loadGrid = useCallback(() => {
    setGrid({ kind: 'loading' })
    getCalendar(iso(days[0]), iso(days[days.length - 1]))
      .then((data) => setGrid({ kind: 'ready', data }))
      .catch(() => setGrid({ kind: 'error' }))
  }, [days])

  const loadNews = useCallback(() => {
    setNews({ kind: 'loading' })
    // Zaległe z ostatnich ok. 11 miesięcy i terminy na 45 dni naprzód.
    getCalendar(iso(addDays(today, -340)), iso(addDays(today, 45)))
      .then((data) => setNews({ kind: 'ready', data }))
      .catch(() => setNews({ kind: 'error' }))
  }, [today])

  useEffect(loadGrid, [loadGrid])
  useEffect(loadNews, [loadNews])

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    if (grid.kind === 'ready') {
      for (const e of grid.data) {
        if (!matchesFilter(e, filter)) continue
        map.set(e.date, [...(map.get(e.date) ?? []), e])
      }
    }
    return map
  }, [grid, filter])

  function shiftMonth(delta: number) {
    setSelected(null)
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  const monthName = monthFormatter.format(new Date(cursor.year, cursor.month, 1))
  const selectedEvents = selected ? (byDay.get(selected) ?? []) : []

  return (
    <section aria-labelledby="kalendarz-tytul" className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="rounded-lg border border-line bg-surface p-5 shadow-raised">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 id="kalendarz-tytul" className="flex items-center gap-2 text-sm font-medium tracking-wide text-ink-muted uppercase">
              <CalendarDays aria-hidden className="size-4" />
              {t.title}
            </h2>
            <p className="mt-1 font-serif text-display font-semibold text-ink capitalize" aria-live="polite">
              {monthName} <span className="font-normal text-ink-muted">{cursor.year}</span>
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <IconButton label={t.prev} onClick={() => shiftMonth(-1)}>
              <ChevronLeft aria-hidden className="size-4" />
            </IconButton>
            <button
              type="button"
              onClick={() => {
                setCursor({ year: today.getFullYear(), month: today.getMonth() })
                setSelected(todayIso)
              }}
              className="rounded-md border border-line-strong px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-sunken"
            >
              {t.today}
            </button>
            <IconButton label={t.next} onClick={() => shiftMonth(1)}>
              <ChevronRight aria-hidden className="size-4" />
            </IconButton>
          </div>
        </header>

        <div role="radiogroup" aria-label="Filtr terminów" className="mt-4 inline-flex rounded-md bg-sunken p-1">
          {(Object.keys(t.filters) as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-[5px] px-3 py-1 text-sm transition-[background-color,box-shadow,color] duration-150 ${
                filter === f ? 'bg-surface font-medium text-ink shadow-raised' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {t.filters[f]}
            </button>
          ))}
        </div>

        {grid.kind === 'error' && (
          <div className="mt-4">
            <Alert action={<Button variant="secondary" className="py-1.5 text-sm" onClick={loadGrid}>{texts.common.retry}</Button>}>
              {t.error}
            </Alert>
          </div>
        )}

        <div className="mt-4 grid grid-cols-7 gap-1.5" aria-hidden>
          {t.weekdays.map((w, i) => (
            <div key={w} className={`px-2 text-xs font-medium tracking-wide uppercase ${i >= 5 ? 'text-ink-faint' : 'text-ink-muted'}`}>
              {w}
            </div>
          ))}
        </div>
        <div className={`mt-1.5 grid grid-cols-7 gap-1.5 transition-opacity ${grid.kind === 'loading' ? 'opacity-60' : ''}`}>
          {days.map((d) => {
            const key = iso(d)
            const inMonth = d.getMonth() === cursor.month
            const isToday = key === todayIso
            const isSelected = key === selected
            const weekend = d.getDay() === 0 || d.getDay() === 6
            const events = byDay.get(key) ?? []
            const urgent = events.some((e) => e.severity === 'overdue')
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(isSelected ? null : key)}
                aria-pressed={isSelected}
                aria-label={`${formatDate(key)}${events.length ? `, terminy: ${events.length}` : ''}`}
                className={`group flex min-h-[6.25rem] flex-col rounded-lg border p-2 text-left transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out active:scale-[0.98] ${
                  isSelected
                    ? 'border-accent bg-accent-soft/60 shadow-raised'
                    : inMonth
                      ? `${weekend ? 'bg-sunken/60' : 'bg-paper'} border-transparent hover:border-line-strong hover:bg-surface hover:shadow-raised`
                      : 'border-transparent bg-transparent opacity-45 hover:opacity-80'
                }`}
              >
                <span className="flex items-center justify-between">
                  <span
                    className={`flex size-7 items-center justify-center rounded-full text-sm tabular-nums ${
                      isToday ? 'bg-accent font-semibold text-accent-ink' : inMonth ? 'font-medium text-ink' : 'text-ink-muted'
                    }`}
                  >
                    {d.getDate()}
                  </span>
                  {urgent && <span className="size-2 rounded-full bg-danger" aria-hidden />}
                </span>
                <span className="mt-1.5 flex flex-col gap-1">
                  {events.slice(0, 2).map((e) => (
                    <span
                      key={e.id}
                      title={`${e.title} – ${e.employee_name}`}
                      className={`truncate rounded-[5px] px-1.5 py-0.5 text-[0.6875rem] leading-tight font-medium ${SEVERITY_STYLE[e.severity].pill}`}
                    >
                      {e.employee_name.split(' ').slice(-1)[0]} · {shortTitle(e.kind)}
                    </span>
                  ))}
                  {events.length > 2 && <span className="px-1.5 text-[0.6875rem] text-ink-muted">{t.more(events.length - 2)}</span>}
                </span>
              </button>
            )
          })}
        </div>

        <Legend />
      </div>

      <aside className="rounded-lg border border-line bg-surface p-5 shadow-raised" aria-live="polite">
        {selected ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-title font-semibold text-ink">{t.dayTitle(formatDate(selected))}</h3>
              <button type="button" onClick={() => setSelected(null)} className="shrink-0 text-sm font-medium text-accent hover:underline">
                {t.backToNews}
              </button>
            </div>
            {selectedEvents.length === 0 ? (
              <p className="mt-4 text-sm text-ink-muted">{t.dayEmpty}</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {selectedEvents.map((e) => (
                  <EventCard key={e.id} event={e} role={role} />
                ))}
              </ul>
            )}
          </>
        ) : (
          <NewsPanel state={news} role={role} filter={filter} todayIso={todayIso} onRetry={loadNews} />
        )}
      </aside>
    </section>
  )
}

function shortTitle(kind: CalendarEventKind): string {
  return {
    first_interview: 'rozmowa wstępna',
    report_window: 'sprawozdanie',
    first_due: 'pierwsza ocena',
    contract_end: 'koniec umowy',
    criteria_meeting: 'kryteria',
    periodic_due: 'ocena okresowa',
    objection_deadline: 'sprzeciw',
  }[kind]
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-md border border-line-strong text-ink transition-colors hover:bg-sunken"
    >
      {children}
    </button>
  )
}

function Legend() {
  const items: CalendarSeverity[] = ['overdue', 'soon', 'upcoming', 'done']
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
      <span className="font-medium">{t.legend}:</span>
      {items.map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className={`size-2 rounded-full ${SEVERITY_STYLE[s].dot}`} aria-hidden />
          {t.severity[s]}
        </span>
      ))}
    </div>
  )
}

function NewsPanel({
  state,
  role,
  filter,
  todayIso,
  onRetry,
}: {
  state: Load<CalendarEvent[]>
  role: 'hr' | 'supervisor'
  filter: Filter
  todayIso: string
  onRetry: () => void
}) {
  const groups = useMemo(() => {
    if (state.kind !== 'ready') return null
    const list = state.data.filter((e) => matchesFilter(e, filter))
    return {
      overdue: list.filter((e) => e.severity === 'overdue').sort((a, b) => a.date.localeCompare(b.date)),
      soon: list.filter((e) => e.severity === 'soon'),
      later: list.filter((e) => e.severity === 'upcoming' && e.date >= todayIso).slice(0, 8),
    }
  }, [state, filter, todayIso])

  return (
    <>
      <h3 className="text-title font-semibold text-ink">{t.news.title}</h3>
      {state.kind === 'loading' && (
        <p role="status" className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          {t.loading}
        </p>
      )}
      {state.kind === 'error' && (
        <div className="mt-4">
          <Alert action={<Button variant="secondary" className="py-1.5 text-sm" onClick={onRetry}>{texts.common.retry}</Button>}>
            {t.error}
          </Alert>
        </div>
      )}
      {groups && groups.overdue.length + groups.soon.length + groups.later.length === 0 && (
        <p className="mt-4 flex items-center gap-2 text-sm text-positive">
          <CircleCheck aria-hidden className="size-4" />
          {t.news.empty}
        </p>
      )}
      {groups && (
        <div className="mt-4 space-y-5">
          <NewsGroup title={t.news.overdue} icon={<CircleAlert aria-hidden className="size-4 text-danger" />} events={groups.overdue} role={role} />
          <NewsGroup title={t.news.soon} icon={<Clock aria-hidden className="size-4 text-warning" />} events={groups.soon} role={role} />
          <NewsGroup title={t.news.later} icon={<CalendarDays aria-hidden className="size-4 text-accent" />} events={groups.later} role={role} />
        </div>
      )}
    </>
  )
}

function NewsGroup({ title, icon, events, role }: { title: string; icon: React.ReactNode; events: CalendarEvent[]; role: 'hr' | 'supervisor' }) {
  if (events.length === 0) return null
  return (
    <div>
      <h4 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">
        {icon}
        {title}
        <span className="rounded-full bg-sunken px-1.5 py-px text-[0.6875rem] tabular-nums">{events.length}</span>
      </h4>
      <ul className="mt-2 space-y-2">
        {events.map((e) => (
          <EventCard key={e.id} event={e} role={role} compact />
        ))}
      </ul>
    </div>
  )
}

/** Pozycja terminu: mini-kartka z datą (jak w kalendarzu systemowym), opis i – dla kadr – przypomnienie. */
function EventCard({ event: e, role, compact = false }: { event: CalendarEvent; role: 'hr' | 'supervisor'; compact?: boolean }) {
  const style = SEVERITY_STYLE[e.severity]
  const d = new Date(`${e.date}T00:00:00`)
  const mailto = `mailto:?subject=${encodeURIComponent(t.reminder.subject(e.title, e.employee_name))}&body=${encodeURIComponent(
    t.reminder.body(e.title, e.employee_name, formatDate(e.date), e.legal_basis),
  )}`
  return (
    <li className="flex gap-3 rounded-lg border border-line bg-paper p-3">
      <div className="flex w-11 shrink-0 flex-col items-center overflow-hidden rounded-md border border-line bg-surface text-center shadow-raised">
        <span className={`w-full py-0.5 text-[0.625rem] font-semibold tracking-wide uppercase ${style.pill}`}>
          {shortMonth.format(d).replace('.', '')}
        </span>
        <span className="py-0.5 text-lg leading-tight font-semibold text-ink tabular-nums">{d.getDate()}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{e.title}</p>
        <p className="truncate text-sm text-ink-muted">
          {e.employee_name}
          {role === 'hr' && e.supervisor_name && <span> · {t.news.supervisorOf(e.supervisor_name)}</span>}
        </p>
        {!compact && <p className="mt-1 text-sm text-ink-muted">{e.description}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={`text-xs font-medium ${style.text}`}>{t.severity[e.severity]}</span>
          <span className="text-xs text-ink-faint">{e.legal_basis}</span>
          {role === 'hr' && (e.severity === 'overdue' || e.severity === 'soon') && (
            <a href={mailto} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
              <Mail aria-hidden className="size-3.5" />
              {texts.hrHome.remind}
            </a>
          )}
        </div>
      </div>
    </li>
  )
}
