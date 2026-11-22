import { useCallback, useEffect, useMemo, useState } from 'react'
import { CircleAlert, CircleCheck, Clock, LoaderCircle, PenLine } from 'lucide-react'
import { AppLayout } from '../layout/AppLayout'
import { PageHeader } from '../components/PageHeader'
import { EmployeeStatusBadge } from '../components/StatusBadge'
import { AssessmentCalendar } from '../components/calendar/AssessmentCalendar'
import { Alert, Button } from '../components/ui'
import { listMonitoredEmployees } from '../lib/api'
import { formatDate, formatRelativeDue, fullName } from '../lib/format'
import { texts } from '../lib/texts'
import { isFirstAssessmentDone } from '../lib/employee'
import type { EmployeeMonitoring, EmployeeStatus } from '../types'

type Tile = 'assessment_overdue' | 'assessment_due_soon' | 'in_progress' | 'up_to_date'
type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; employees: EmployeeMonitoring[] }

const TILE_STATUSES: Record<Tile, EmployeeStatus[]> = {
  assessment_overdue: ['assessment_overdue'],
  assessment_due_soon: ['assessment_due_soon'],
  in_progress: ['assessment_in_progress', 'awaiting_first_assessment'],
  up_to_date: ['up_to_date'],
}

const TILE_STYLE: Record<Tile, { icon: typeof Clock; accent: string; ring: string }> = {
  assessment_overdue: { icon: CircleAlert, accent: 'text-danger', ring: 'ring-danger/40' },
  assessment_due_soon: { icon: Clock, accent: 'text-warning', ring: 'ring-warning/40' },
  in_progress: { icon: PenLine, accent: 'text-accent', ring: 'ring-accent/40' },
  up_to_date: { icon: CircleCheck, accent: 'text-positive', ring: 'ring-positive/40' },
}

const collator = new Intl.Collator('pl', { sensitivity: 'base' })

/** Panel kadr: statusy i terminy wszystkich ocen, kalendarz czynności i przypomnienia (bez treści ocen). */
export function HrHomePage() {
  const t = texts.hrHome
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [tile, setTile] = useState<Tile | null>(null)

  const load = useCallback(() => {
    setState({ kind: 'loading' })
    listMonitoredEmployees()
      .then((employees) => setState({ kind: 'ready', employees }))
      .catch(() => setState({ kind: 'error' }))
  }, [])

  useEffect(load, [load])

  const counts = useMemo(() => {
    const out: Record<Tile, number> = { assessment_overdue: 0, assessment_due_soon: 0, in_progress: 0, up_to_date: 0 }
    if (state.kind === 'ready') {
      for (const e of state.employees) {
        const key = (Object.keys(TILE_STATUSES) as Tile[]).find((k) => TILE_STATUSES[k].includes(e.status))
        if (key) out[key] += 1
      }
    }
    return out
  }, [state])

  const rows = useMemo(() => {
    if (state.kind !== 'ready') return []
    return state.employees
      .filter((e) => !tile || TILE_STATUSES[tile].includes(e.status))
      .sort((a, b) => (a.next_assessment_due ?? '9999').localeCompare(b.next_assessment_due ?? '9999') || collator.compare(a.last_name, b.last_name))
  }, [state, tile])

  return (
    <AppLayout>
      <PageHeader title={t.title} lead={t.lead} />

      <section aria-label="Podsumowanie statusów" className="mb-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {(Object.keys(TILE_STATUSES) as Tile[]).map((k) => {
            const { icon: Icon, accent, ring } = TILE_STYLE[k]
            const active = tile === k
            return (
              <button
                key={k}
                type="button"
                aria-pressed={active}
                onClick={() => setTile(active ? null : k)}
                className={`flex flex-col items-start rounded-lg border border-line bg-surface p-4 text-left shadow-raised transition-[box-shadow,transform] duration-150 ease-out hover:-translate-y-px active:scale-[0.99] ${
                  active ? `ring-2 ${ring}` : ''
                }`}
              >
                <span className={`flex size-8 items-center justify-center rounded-md bg-sunken ${accent}`}>
                  <Icon aria-hidden className="size-4" />
                </span>
                <span className="mt-3 font-serif text-[2rem] leading-none font-semibold text-ink tabular-nums">
                  {state.kind === 'ready' ? counts[k] : '–'}
                </span>
                <span className="mt-1.5 text-sm text-ink-muted">{t.tiles[k]}</span>
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-ink-faint">{t.tilesHint}</p>
      </section>

      <div className="mb-10">
        <AssessmentCalendar role="hr" />
      </div>

      <section aria-labelledby="tabela-kadry">
        <div className="mb-3 flex items-end justify-between gap-4">
          <h2 id="tabela-kadry" className="text-title font-semibold text-ink">
            {t.tableTitle}
            {tile && <span className="ml-2 text-base font-normal text-ink-muted">· {t.tiles[tile]}</span>}
          </h2>
          {tile && (
            <button type="button" onClick={() => setTile(null)} className="text-sm font-medium text-accent hover:underline">
              {t.clearFilter}
            </button>
          )}
        </div>

        {state.kind === 'loading' && (
          <p role="status" className="flex items-center gap-2 text-ink-muted">
            <LoaderCircle aria-hidden className="size-4 animate-spin" />
            {texts.calendar.loading}
          </p>
        )}
        {state.kind === 'error' && (
          <Alert action={<Button variant="secondary" className="py-1.5 text-sm" onClick={load}>{texts.common.retry}</Button>}>
            {t.loadError}
          </Alert>
        )}
        {state.kind === 'ready' && (
          <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-raised">
            <table className="w-full text-left text-sm">
              <thead className="bg-sunken text-ink-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">{t.columns.employee}</th>
                  <th className="px-4 py-2.5 font-medium">{t.columns.supervisor}</th>
                  <th className="px-4 py-2.5 font-medium">{t.columns.kind}</th>
                  <th className="px-4 py-2.5 font-medium">{t.columns.status}</th>
                  <th className="px-4 py-2.5 font-medium">{t.columns.due}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-ink-muted">
                      {t.empty}
                    </td>
                  </tr>
                )}
                {rows.map((e) => {
                  return (
                    <tr key={e.id} className="border-t border-line">
                      <td className="px-4 py-3">
                        <span className="font-medium text-ink">{fullName(e)}</span>
                        <span className="block text-ink-muted">{e.organizational_unit}</span>
                      </td>
                      <td className="px-4 py-3 text-ink">{e.supervisor_name || '—'}</td>
                      <td className="px-4 py-3 text-ink">{t.kind[e.assessment_kind]}</td>
                      <td className="px-4 py-3">
                        <EmployeeStatusBadge status={e.status} />
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {isFirstAssessmentDone(e) ? (
                          <span className="text-ink-muted">{texts.supervisorHome.firstDone}</span>
                        ) : e.next_assessment_due ? (
                          <>
                            <span className="text-ink">{formatDate(e.next_assessment_due)}</span>
                            <span className="block text-ink-muted">{formatRelativeDue(e.next_assessment_due)}</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppLayout>
  )
}
