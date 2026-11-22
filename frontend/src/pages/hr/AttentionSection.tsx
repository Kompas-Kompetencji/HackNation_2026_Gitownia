import { Fragment, useState } from 'react'
import { BellRing, ChevronRight, CircleCheck, Mail } from 'lucide-react'
import { Button } from '../../components/ui'
import { formatDate, formatDateTime, formatRelativeDue } from '../../lib/format'
import type { AttentionReason, SupervisorAttention } from '../../lib/hrMonitoring'
import { texts } from '../../lib/texts'
import { mailtoHref } from './reminderText'

const t = texts.hrHome.attention

const REASON_STYLE: Record<AttentionReason, string> = {
  overdue: 'bg-danger-soft text-danger',
  due_soon: 'bg-warning-soft text-warning',
  not_started_near_due: 'bg-sunken text-ink',
}

/**
 * „Wymaga uwagi”: przełożeni z pracownikami po terminie lub z terminem w ciągu 30 dni.
 * Wiersz można rozwinąć (lista pracowników z terminami); przycisk otwiera okno przypomnienia.
 */
export function AttentionSection({
  groups,
  remindersReady,
  onRemind,
}: {
  groups: SupervisorAttention[]
  remindersReady: boolean
  onRemind: (group: SupervisorAttention) => void
}) {
  const [open, setOpen] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setOpen((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section aria-labelledby="wymaga-uwagi" className="mb-12">
      <h2 id="wymaga-uwagi" className="text-title font-semibold text-ink">
        {t.title}
      </h2>
      <p className="mt-1 mb-4 text-sm text-ink-muted">{t.lead}</p>

      {groups.length === 0 ? (
        <p className="flex items-center gap-2 rounded-md border border-line bg-surface px-4 py-3 text-positive">
          <CircleCheck aria-hidden className="size-4" />
          {t.empty}
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-line bg-surface">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">{t.caption}</caption>
            <thead className="border-b border-line bg-sunken/60 text-ink-muted">
              <tr>
                <th scope="col" className="py-2.5 pr-3 pl-4 font-medium">{t.columns.supervisor}</th>
                <th scope="col" className="px-3 py-2.5 font-medium">{t.columns.unit}</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">{t.columns.overdue}</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">{t.columns.dueSoon}</th>
                <th scope="col" className="px-3 py-2.5 font-medium">{t.columns.nearest}</th>
                <th scope="col" className="px-3 py-2.5 font-medium">{t.columns.lastReminder}</th>
                <th scope="col" className="py-2.5 pr-4 pl-3 font-medium">
                  <span className="sr-only">{t.columns.actions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const expanded = open.has(g.supervisorId)
                const panelId = `uwaga-${g.supervisorId}`
                return (
                  <Fragment key={g.supervisorId}>
                    <tr className="border-t border-line first:border-t-0">
                      <th scope="row" className="py-3 pr-3 pl-2 font-normal">
                        <button
                          type="button"
                          onClick={() => toggle(g.supervisorId)}
                          aria-expanded={expanded}
                          aria-controls={panelId}
                          aria-label={expanded ? t.collapse(g.supervisorName) : t.expand(g.supervisorName)}
                          className="flex items-center gap-1.5 rounded-sm px-2 py-1 text-left font-medium text-ink hover:text-accent"
                        >
                          <ChevronRight
                            aria-hidden
                            className={`size-4 shrink-0 text-ink-muted transition-transform duration-150 ease-out ${expanded ? 'rotate-90' : ''}`}
                          />
                          {g.supervisorName || '—'}
                        </button>
                      </th>
                      <td className="px-3 py-3 text-ink-muted">{g.unit || '—'}</td>
                      <td className={`px-3 py-3 text-right font-semibold tabular-nums ${g.overdueCount ? 'text-danger' : 'text-ink-muted'}`}>
                        {g.overdueCount}
                      </td>
                      <td className={`px-3 py-3 text-right font-semibold tabular-nums ${g.dueSoonCount ? 'text-warning' : 'text-ink-muted'}`}>
                        {g.dueSoonCount}
                      </td>
                      <td className="px-3 py-3 tabular-nums">
                        {g.nearestDue ? (
                          <>
                            <span className="text-ink">{formatDate(g.nearestDue)}</span>
                            <span className="block text-xs text-ink-muted">{formatRelativeDue(g.nearestDue)}</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-3 text-ink-muted tabular-nums">
                        {!remindersReady ? '—' : g.lastReminder ? formatDateTime(g.lastReminder.created_at) : texts.hrHome.none}
                      </td>
                      <td className="py-3 pr-4 pl-3">
                        <div className="flex flex-col items-end gap-1">
                          <Button className="py-1.5 text-sm whitespace-nowrap active:scale-[0.97]" onClick={() => onRemind(g)}>
                            <BellRing aria-hidden className="size-4" />
                            {t.send}
                          </Button>
                          <a
                            href={mailtoHref(g.allRows, g.rows.map((r) => r.employee.id))}
                            className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap text-accent underline-offset-2 hover:underline"
                          >
                            <Mail aria-hidden className="size-3.5" />
                            {t.mail}
                          </a>
                        </div>
                      </td>
                    </tr>
                    <tr id={panelId} hidden={!expanded} className="bg-paper">
                      <td colSpan={7} className="px-4 pt-1 pb-4">
                        <table className="w-full text-sm">
                          <caption className="sr-only">{t.employeesCaption(g.supervisorName)}</caption>
                          <tbody>
                            {g.rows.map((r) => (
                              <tr key={r.employee.id} className="border-t border-line first:border-t-0">
                                <th scope="row" className="w-[28%] py-2 pl-8 text-left font-medium text-ink">
                                  {r.employeeName}
                                  <span className="block text-xs font-normal text-ink-muted">{r.employee.organizational_unit}</span>
                                </th>
                                <td className="py-2 text-ink-muted">{texts.hrHome.kind[r.kind]}</td>
                                <td className="py-2 tabular-nums">
                                  {r.due ? (
                                    <>
                                      <span className="text-ink">{formatDate(r.due)}</span>{' '}
                                      <span className="text-ink-muted">({formatRelativeDue(r.due)})</span>
                                    </>
                                  ) : (
                                    '—'
                                  )}
                                </td>
                                <td className="py-2">
                                  <span className="flex flex-wrap gap-1.5">
                                    {r.attention.map((reason) => (
                                      <span key={reason} className={`rounded-sm px-1.5 py-0.5 text-xs font-medium ${REASON_STYLE[reason]}`}>
                                        {t.reasons[reason]}
                                      </span>
                                    ))}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
