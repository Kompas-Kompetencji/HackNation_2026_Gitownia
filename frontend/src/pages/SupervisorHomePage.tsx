import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, ArrowUpDown, Search, UserPlus, Users, X } from 'lucide-react'
import { AppLayout } from '../layout/AppLayout'
import { PageHeader } from '../components/PageHeader'
import { EmptyState } from '../components/EmptyState'
import { EmployeeStatusBadge } from '../components/StatusBadge'
import { AssessmentCalendar } from '../components/calendar/AssessmentCalendar'
import { Alert, Button, ButtonLink } from '../components/ui'
import { listEmployees } from '../lib/api'
import { formatDate, formatRelativeDue, fullName } from '../lib/format'
import { texts } from '../lib/texts'
import { isFirstAssessmentDone } from '../lib/employee'
import type { Employee, EmployeeStatus } from '../types'

type SortKey = 'name' | 'position' | 'status' | 'due'
type SortDir = 'asc' | 'desc'
type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; employees: Employee[] }

/** Kolejność wyświetlania statusów: najpilniejsze najpierw. */
const STATUS_ORDER: Record<EmployeeStatus, number> = {
  assessment_overdue: 0,
  assessment_due_soon: 1,
  awaiting_first_assessment: 2,
  assessment_in_progress: 3,
  up_to_date: 4,
}

const collator = new Intl.Collator('pl', { sensitivity: 'base' })

function compare(a: Employee, b: Employee, key: SortKey): number {
  switch (key) {
    case 'name':
      return collator.compare(`${a.last_name} ${a.first_name}`, `${b.last_name} ${b.first_name}`)
    case 'position':
      return collator.compare(a.position_title, b.position_title)
    case 'status':
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    case 'due':
      // Brak terminu zawsze na końcu.
      if (!a.next_assessment_due) return b.next_assessment_due ? 1 : 0
      if (!b.next_assessment_due) return -1
      return a.next_assessment_due.localeCompare(b.next_assessment_due)
  }
}

function matches(e: Employee, query: string): boolean {
  const q = query.trim().toLocaleLowerCase('pl')
  if (!q) return true
  return `${e.first_name} ${e.last_name} ${e.position_title}`.toLocaleLowerCase('pl').includes(q)
}

export function SupervisorHomePage() {
  const t = texts.supervisorHome
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'due', dir: 'asc' })
  const searchId = useId()

  const load = useCallback(() => {
    setState({ kind: 'loading' })
    listEmployees()
      .then((employees) => setState({ kind: 'ready', employees }))
      .catch(() => setState({ kind: 'error' }))
  }, [])

  useEffect(load, [load])

  const visible = useMemo(() => {
    if (state.kind !== 'ready') return []
    const list = state.employees.filter((e) => matches(e, query))
    list.sort((a, b) => {
      const c = compare(a, b, sort.key)
      return sort.dir === 'asc' ? c : -c
    })
    return list
  }, [state, query, sort])

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  const addButton = (
    <ButtonLink to="/przelozony/pracownicy/nowy">
      <UserPlus aria-hidden className="size-4" />
      {t.addEmployee}
    </ButtonLink>
  )

  const hasEmployees = state.kind === 'ready' && state.employees.length > 0

  return (
    <AppLayout>
      <PageHeader title={t.title} lead={t.lead} actions={hasEmployees ? addButton : undefined} />

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

      {state.kind === 'ready' && state.employees.length === 0 && (
        <EmptyState icon={Users} title={t.emptyTitle} body={t.emptyBody} action={addButton} />
      )}

      {(state.kind === 'loading' || hasEmployees) && (
        <>
          <div className="mb-4 flex items-end justify-between gap-6">
            <div className="w-full max-w-sm">
              <label htmlFor={searchId} className="mb-1.5 block text-sm font-medium text-ink">
                {t.searchLabel}
              </label>
              <div className="relative">
                <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" />
                <input
                  id={searchId}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t.searchPlaceholder}
                  disabled={state.kind !== 'ready'}
                  className="block w-full rounded-md border border-line-strong bg-surface py-2.5 pr-3 pl-9 text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-0 disabled:opacity-60"
                />
              </div>
            </div>
            {state.kind === 'ready' && (
              <p className="text-sm text-ink-muted" aria-live="polite">
                {t.count(visible.length, state.employees.length)}
              </p>
            )}
          </div>

          <div className="overflow-hidden rounded-md border border-line bg-surface">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">{t.tableCaption}</caption>
              <thead className="border-b border-line bg-sunken/60 text-sm text-ink-muted">
                <tr>
                  <SortHeader label={t.columns.name} sortKey="name" sort={sort} onSort={toggleSort} className="w-[30%]" />
                  <SortHeader label={t.columns.position} sortKey="position" sort={sort} onSort={toggleSort} />
                  <SortHeader label={t.columns.status} sortKey="status" sort={sort} onSort={toggleSort} />
                  <SortHeader label={t.columns.due} sortKey="due" sort={sort} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {state.kind === 'loading' && <SkeletonRows />}
                {visible.map((e) => (
                  <EmployeeRow key={e.id} employee={e} />
                ))}
              </tbody>
            </table>

            {state.kind === 'ready' && visible.length === 0 && (
              <div className="flex items-center justify-between gap-4 border-t border-line px-5 py-6">
                <div>
                  <p className="font-medium text-ink">{t.noResultsTitle}</p>
                  <p className="text-sm text-ink-muted">{t.noResultsBody}</p>
                </div>
                <Button variant="secondary" onClick={() => setQuery('')}>
                  <X aria-hidden className="size-4" />
                  {t.clearSearch}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
      <div className="mt-12">
        <AssessmentCalendar role="supervisor" />
      </div>
    </AppLayout>
  )
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className = '',
}: {
  label: string
  sortKey: SortKey
  sort: { key: SortKey; dir: SortDir }
  onSort: (k: SortKey) => void
  className?: string
}) {
  const active = sort.key === sortKey
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`px-2 py-1.5 font-medium ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 transition-colors duration-150 hover:text-ink ${active ? 'text-ink' : ''}`}
      >
        {label}
        <Icon aria-hidden className={`size-3.5 ${active ? 'text-accent' : 'opacity-60'}`} />
      </button>
    </th>
  )
}

function EmployeeRow({ employee: e }: { employee: Employee }) {
  return (
    <tr className="transition-colors duration-150 hover:bg-paper">
      <td className="px-5 py-3.5">
        <Link
          to={`/przelozony/pracownicy/${e.id}`}
          className="font-medium text-ink underline-offset-2 hover:text-accent hover:underline"
        >
          {fullName(e)}
        </Link>
        <p className="text-sm text-ink-muted">{e.organizational_unit}</p>
      </td>
      <td className="px-5 py-3.5 text-ink">{e.position_title}</td>
      <td className="px-5 py-3.5">
        <EmployeeStatusBadge status={e.status} />
      </td>
      <td className="px-5 py-3.5">
        {isFirstAssessmentDone(e) ? (
          <p className="text-ink-muted">{texts.supervisorHome.firstDone}</p>
        ) : e.next_assessment_due ? (
          <>
            <p className="text-ink tabular-nums">{formatDate(e.next_assessment_due)}</p>
            <p className="text-sm text-ink-muted">{formatRelativeDue(e.next_assessment_due)}</p>
          </>
        ) : (
          <p className="text-ink-muted">{texts.supervisorHome.dueNotSet}</p>
        )}
      </td>
    </tr>
  )
}

function SkeletonRows() {
  return (
    <>
      <tr>
        <td colSpan={4} className="sr-only">
          <span role="status">{texts.supervisorHome.loading}</span>
        </td>
      </tr>
      {[0, 1, 2].map((i) => (
        <tr key={i} aria-hidden>
          {[40, 28, 22, 30].map((w, j) => (
            <td key={j} className="px-5 py-4">
              <div className="h-4 animate-pulse rounded-sm bg-sunken" style={{ width: `${w + i * 4}%` }} />
              {j === 0 && <div className="mt-2 h-3 w-1/3 animate-pulse rounded-sm bg-sunken" />}
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
