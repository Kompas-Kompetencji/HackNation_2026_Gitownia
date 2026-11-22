import { useId, useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, BellRing, ChevronRight, Search, X } from 'lucide-react'
import { Button } from '../../components/ui'
import { toneClasses, type Tone } from '../../components/styles'
import { formatDate, formatDateTime, formatRelativeDue } from '../../lib/format'
import type { MonitoringRow, ProcessStatus } from '../../lib/hrMonitoring'
import { texts } from '../../lib/texts'
import { EMPTY_FILTERS, hasFilters, type TableFilters } from './filters'

const t = texts.hrHome.table

type SortKey = 'employee' | 'unit' | 'supervisor' | 'kind' | 'status' | 'due' | 'result' | 'lastReminder'
type Sort = { key: SortKey; dir: 'asc' | 'desc' }

const collator = new Intl.Collator('pl', { sensitivity: 'base' })

/** Kolejność statusów przy sortowaniu: najpilniejsze najpierw. */
function statusRank(r: MonitoringRow): number {
  if (r.overdue) return 0
  if (r.dueSoon) return 1
  return { not_started: 2, in_progress: 3, completed: 4 }[r.process]
}

/** Status: tekst zawsze widoczny, kolor tylko go wzmacnia. */
function statusView(r: MonitoringRow): { tone: Tone; label: string; note: string | null } {
  const label = texts.hrHome.process[r.process]
  if (r.overdue) return { tone: 'danger', label, note: texts.hrHome.attention.reasons.overdue }
  if (r.dueSoon) return { tone: 'warning', label, note: texts.hrHome.attention.reasons.due_soon }
  return { tone: r.process === 'completed' ? 'positive' : r.process === 'in_progress' ? 'accent' : 'neutral', label, note: null }
}

function nullsLast(a: string | null, b: string | null): number {
  if (!a) return b ? 1 : 0
  if (!b) return -1
  return a.localeCompare(b)
}

function compare(a: MonitoringRow, b: MonitoringRow, key: SortKey): number {
  switch (key) {
    case 'employee':
      return collator.compare(`${a.employee.last_name} ${a.employee.first_name}`, `${b.employee.last_name} ${b.employee.first_name}`)
    case 'unit':
      return collator.compare(a.employee.organizational_unit, b.employee.organizational_unit)
    case 'supervisor':
      return collator.compare(a.employee.supervisor_name, b.employee.supervisor_name)
    case 'kind':
      return collator.compare(texts.hrHome.kind[a.kind], texts.hrHome.kind[b.kind])
    case 'status':
      return statusRank(a) - statusRank(b)
    case 'due':
      return nullsLast(a.due, b.due)
    case 'result':
      return nullsLast(a.result, b.result)
    case 'lastReminder':
      return nullsLast(a.lastReminder?.created_at ?? null, b.lastReminder?.created_at ?? null)
  }
}

function matches(r: MonitoringRow, f: TableFilters): boolean {
  const q = f.query.trim().toLocaleLowerCase('pl')
  if (q && !`${r.employeeName} ${r.employee.supervisor_name} ${r.employee.organizational_unit}`.toLocaleLowerCase('pl').includes(q)) {
    return false
  }
  if (f.kind && r.kind !== f.kind) return false
  if (f.status && r.process !== f.status) return false
  if (f.supervisor && r.employee.supervisor_id !== f.supervisor) return false
  if (f.unit && r.employee.organizational_unit !== f.unit) return false
  if (f.dueSoon && !r.dueSoon) return false
  if (f.overdue && !r.overdue) return false
  return true
}

/**
 * „Wszystkie oceny”: wyszukiwanie, filtry, sortowanie po kliknięciu nagłówka, rozwinięcie wiersza
 * z terminami i historią przypomnień. Bez żadnej treści oceny i bez odnośników do niej.
 */
export function AssessmentsTable({
  rows,
  filters,
  onFilters,
  remindersReady,
  onRemind,
}: {
  rows: MonitoringRow[]
  filters: TableFilters
  onFilters: (f: TableFilters) => void
  remindersReady: boolean
  onRemind: (row: MonitoringRow) => void
}) {
  const uid = useId()
  const [sort, setSort] = useState<Sort>({ key: 'status', dir: 'asc' })
  const [open, setOpen] = useState<Set<string>>(new Set())

  const supervisors = useMemo(() => {
    const map = new Map(rows.map((r) => [r.employee.supervisor_id, r.employee.supervisor_name]))
    return [...map].sort((a, b) => collator.compare(a[1], b[1]))
  }, [rows])
  const units = useMemo(() => [...new Set(rows.map((r) => r.employee.organizational_unit).filter(Boolean))].sort(collator.compare), [rows])

  const visible = useMemo(() => {
    const list = rows.filter((r) => matches(r, filters))
    list.sort((a, b) => {
      const c = compare(a, b, sort.key) || compare(a, b, 'due') || compare(a, b, 'employee')
      return sort.dir === 'asc' ? c : -c
    })
    return list
  }, [rows, filters, sort])

  const set = <K extends keyof TableFilters>(key: K, value: TableFilters[K]) => onFilters({ ...filters, [key]: value })

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  function toggleRow(id: string) {
    setOpen((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectClass =
    'block w-full rounded-md border border-line-strong bg-surface px-2.5 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-0'

  return (
    <section aria-labelledby="wszystkie-oceny" className="mt-12">
      <h2 id="wszystkie-oceny" className="text-title font-semibold text-ink">
        {t.title}
      </h2>
      <p className="mt-1 mb-4 text-sm text-ink-muted">{t.lead}</p>

      <div className="mb-3 grid grid-cols-[minmax(14rem,1.6fr)_repeat(4,minmax(8rem,1fr))] items-end gap-3">
        <div>
          <label htmlFor={`${uid}-szukaj`} className="mb-1 block text-sm font-medium text-ink">
            {t.search}
          </label>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-muted" />
            <input
              id={`${uid}-szukaj`}
              type="search"
              value={filters.query}
              onChange={(e) => set('query', e.target.value)}
              placeholder={t.searchPlaceholder}
              className={`${selectClass} pl-8 placeholder:text-ink-faint`}
            />
          </div>
        </div>
        <FilterSelect id={`${uid}-rodzaj`} label={t.filters.kind} value={filters.kind} onChange={(v) => set('kind', v as TableFilters['kind'])} className={selectClass}>
          <option value="">{t.filters.all}</option>
          <option value="first">{texts.hrHome.kind.first}</option>
          <option value="periodic">{texts.hrHome.kind.periodic}</option>
        </FilterSelect>
        <FilterSelect id={`${uid}-status`} label={t.filters.status} value={filters.status} onChange={(v) => set('status', v as TableFilters['status'])} className={selectClass}>
          <option value="">{t.filters.all}</option>
          {(Object.keys(texts.hrHome.process) as ProcessStatus[]).map((s) => (
            <option key={s} value={s}>
              {texts.hrHome.process[s]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect id={`${uid}-przelozony`} label={t.filters.supervisor} value={filters.supervisor} onChange={(v) => set('supervisor', v)} className={selectClass}>
          <option value="">{t.filters.allSupervisors}</option>
          {supervisors.map(([id, name]) => (
            <option key={id} value={id}>
              {name || id}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect id={`${uid}-komorka`} label={t.filters.unit} value={filters.unit} onChange={(v) => set('unit', v)} className={selectClass}>
          <option value="">{t.filters.all}</option>
          {units.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </FilterSelect>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={filters.dueSoon} onChange={(e) => set('dueSoon', e.target.checked)} className="size-4 accent-accent" />
            {t.filters.dueSoon}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={filters.overdue} onChange={(e) => set('overdue', e.target.checked)} className="size-4 accent-accent" />
            {t.filters.overdue}
          </label>
          {hasFilters(filters) && (
            <button type="button" onClick={() => onFilters(EMPTY_FILTERS)} className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
              <X aria-hidden className="size-4" />
              {t.clear}
            </button>
          )}
        </div>
        <p className="text-sm text-ink-muted tabular-nums" aria-live="polite">
          {t.count(visible.length, rows.length)}
        </p>
      </div>

      <div className="overflow-hidden rounded-md border border-line bg-surface">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">{t.caption}</caption>
          <thead className="border-b border-line bg-sunken/60 text-ink-muted">
            <tr>
              <SortHeader label={t.columns.employee} k="employee" sort={sort} onSort={toggleSort} />
              <SortHeader label={t.columns.unit} k="unit" sort={sort} onSort={toggleSort} />
              <SortHeader label={t.columns.supervisor} k="supervisor" sort={sort} onSort={toggleSort} />
              <SortHeader label={t.columns.kind} k="kind" sort={sort} onSort={toggleSort} />
              <SortHeader label={t.columns.status} k="status" sort={sort} onSort={toggleSort} />
              <SortHeader label={t.columns.due} k="due" sort={sort} onSort={toggleSort} />
              <SortHeader label={t.columns.result} k="result" sort={sort} onSort={toggleSort} />
              <SortHeader label={t.columns.lastReminder} k="lastReminder" sort={sort} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <TableRow
                key={r.employee.id}
                row={r}
                expanded={open.has(r.employee.id)}
                onToggle={() => toggleRow(r.employee.id)}
                remindersReady={remindersReady}
                onRemind={() => onRemind(r)}
              />
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <div className="flex items-center justify-between gap-4 border-t border-line px-5 py-6">
            <div>
              <p className="font-medium text-ink">{t.noResultsTitle}</p>
              <p className="text-sm text-ink-muted">{t.noResultsBody}</p>
            </div>
            <Button variant="secondary" onClick={() => onFilters(EMPTY_FILTERS)}>
              <X aria-hidden className="size-4" />
              {t.clear}
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  className,
  children,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  className: string
  children: ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={className}>
        {children}
      </select>
    </div>
  )
}

function SortHeader({ label, k, sort, onSort }: { label: string; k: SortKey; sort: Sort; onSort: (k: SortKey) => void }) {
  const active = sort.key === k
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className="px-1 py-1.5 font-medium">
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`flex items-center gap-1 rounded-sm px-2 py-1.5 text-left transition-colors duration-150 hover:text-ink ${active ? 'text-ink' : ''}`}
      >
        {label}
        <Icon aria-hidden className={`size-3.5 shrink-0 ${active ? 'text-accent' : 'opacity-60'}`} />
      </button>
    </th>
  )
}

function TableRow({
  row: r,
  expanded,
  onToggle,
  remindersReady,
  onRemind,
}: {
  row: MonitoringRow
  expanded: boolean
  onToggle: () => void
  remindersReady: boolean
  onRemind: () => void
}) {
  const panelId = `szczegoly-${r.employee.id}`
  const status = statusView(r)
  const tone = toneClasses[status.tone]
  const firstDone = r.kind === 'first' && r.result != null && r.due == null
  return (
    <>
      <tr className="border-t border-line first:border-t-0 hover:bg-paper">
        <th scope="row" className="py-2.5 pr-2 pl-1 text-left font-normal">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={panelId}
            aria-label={expanded ? t.collapse(r.employeeName) : t.expand(r.employeeName)}
            className="flex items-center gap-1.5 rounded-sm px-2 py-1 text-left font-medium text-ink hover:text-accent"
          >
            <ChevronRight aria-hidden className={`size-4 shrink-0 text-ink-muted transition-transform duration-150 ease-out ${expanded ? 'rotate-90' : ''}`} />
            {r.employeeName}
          </button>
        </th>
        <td className="px-3 py-2.5 text-ink-muted">{r.employee.organizational_unit || '—'}</td>
        <td className="px-3 py-2.5 text-ink">{r.employee.supervisor_name || '—'}</td>
        <td className="px-3 py-2.5 text-ink">{texts.hrHome.kind[r.kind]}</td>
        <td className="px-3 py-2.5">
          <span className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 font-medium whitespace-nowrap ${tone.box}`}>
            <span aria-hidden className={`size-1.5 rounded-full ${tone.dot}`} />
            {status.label}
          </span>
          {status.note && <span className={`mt-0.5 block text-xs font-medium ${tone.text}`}>{status.note}</span>}
        </td>
        <td className="px-3 py-2.5 tabular-nums">
          {r.due ? (
            <>
              <span className="text-ink">{formatDate(r.due)}</span>
              <span className="block text-xs text-ink-muted">{formatRelativeDue(r.due)}</span>
            </>
          ) : (
            <span className="text-ink-muted">{firstDone ? t.firstDone : t.noDue}</span>
          )}
        </td>
        <td className="px-3 py-2.5">
          {r.result ? (
            <span className={`font-medium ${r.result === 'positive' ? 'text-positive' : 'text-danger'}`}>{texts.hrHome.result[r.result]}</span>
          ) : (
            <span className="text-ink-muted">—</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-ink-muted tabular-nums">
          {!remindersReady ? '—' : r.lastReminder ? formatDateTime(r.lastReminder.created_at) : texts.hrHome.none}
        </td>
      </tr>
      <tr id={panelId} hidden={!expanded} className="bg-paper">
        <td colSpan={8} className="px-6 pt-2 pb-5">
          <Details row={r} remindersReady={remindersReady} onRemind={onRemind} />
        </td>
      </tr>
    </>
  )
}

function Details({ row: r, remindersReady, onRemind }: { row: MonitoringRow; remindersReady: boolean; onRemind: () => void }) {
  const d = t.detail
  return (
    <div className="grid grid-cols-3 gap-8 pl-7">
      <div>
        <h3 className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{d.terms}</h3>
        <dl className="mt-2 space-y-1.5 text-sm">
          <Term label={d.nextDue} value={r.due ? `${formatDate(r.due)} (${formatRelativeDue(r.due)})` : '—'} />
          <Term label={d.contractEnd} value={r.employee.contract_end_date ? formatDate(r.employee.contract_end_date) : '—'} />
          <Term
            label={d.lastAssessment}
            value={
              r.employee.last_assessment_date
                ? `${formatDate(r.employee.last_assessment_date)}${r.result ? `, ${texts.hrHome.result[r.result].toLowerCase()}` : ''}`
                : '—'
            }
          />
        </dl>
      </div>
      <div>
        <h3 className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{d.assessments}</h3>
        {r.assessments.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">{d.noAssessments}</p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-sm text-ink">
            {r.assessments.map((a) => (
              <li key={a.id}>
                {d.assessmentLine(texts.hrHome.kind[a.kind], texts.status.assessment[a.status].toLowerCase(), formatDate(a.due_date))}
                {a.completed_at && <span className="text-ink-muted">, {d.completedOn(formatDate(a.completed_at))}</span>}
                {a.result && <span className="text-ink-muted">, {texts.hrHome.result[a.result].toLowerCase()}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{d.reminders}</h3>
        {!remindersReady ? (
          <p className="mt-2 text-sm text-ink-muted">—</p>
        ) : r.reminders.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">{d.noReminders}</p>
        ) : (
          <ul className="mt-2 space-y-1.5 text-sm text-ink">
            {r.reminders.map((rem) => (
              <li key={rem.id} className="tabular-nums">
                {d.reminderBy(formatDateTime(rem.created_at), rem.author_name)}
              </li>
            ))}
          </ul>
        )}
        <Button variant="secondary" className="mt-3 py-1.5 text-sm active:scale-[0.97]" onClick={onRemind}>
          <BellRing aria-hidden className="size-4" />
          {d.remind}
        </Button>
      </div>
    </div>
  )
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-ink tabular-nums">{value}</dd>
    </div>
  )
}

