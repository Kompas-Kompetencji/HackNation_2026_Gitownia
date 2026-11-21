import { ChevronRight, History, LoaderCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Alert, Button } from '../../components/ui'
import type { SectionState } from './sectionState'
import { ResultBadge } from '../../components/StatusBadge'
import { formatDate } from '../../lib/format'
import { texts } from '../../lib/texts'
import type { AssessmentSummary } from '../../types'

/** Zakończone oceny pracownika, od najnowszej. */
export function AssessmentHistory({
  state,
  onRetry,
}: {
  state: SectionState<AssessmentSummary[]>
  onRetry: () => void
}) {
  const t = texts.employee.history
  const completed = (state.kind === 'ready' ? state.data : [])
    .filter((a) => a.status === 'completed' && a.completed_at)
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))

  return (
    <section aria-labelledby="historia-ocen">
      <h2 id="historia-ocen" className="mb-3 text-title font-semibold text-ink">
        {t.title}
      </h2>
      {state.kind === 'loading' && (
        <p role="status" className="flex items-center gap-2 text-ink-muted">
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          {texts.common.loading}
        </p>
      )}
      {state.kind === 'error' && (
        <Alert
          action={
            <Button variant="secondary" onClick={onRetry} className="py-1.5 text-sm">
              {texts.common.retry}
            </Button>
          }
        >
          {t.loadError}
        </Alert>
      )}
      {state.kind !== 'ready' ? null : completed.length === 0 ? (
        <p className="flex items-center gap-3 rounded-md border border-dashed border-line-strong px-5 py-4 text-ink-muted">
          <History aria-hidden className="size-4 shrink-0" />
          {t.empty}
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-line bg-surface">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">{t.title}</caption>
            <thead className="border-b border-line bg-sunken/60 text-sm text-ink-muted">
              <tr>
                <th scope="col" className="px-5 py-2.5 font-medium">{t.columns.kind}</th>
                <th scope="col" className="px-5 py-2.5 font-medium">{t.columns.form}</th>
                <th scope="col" className="px-5 py-2.5 font-medium">{t.columns.date}</th>
                <th scope="col" className="px-5 py-2.5 font-medium">{t.columns.result}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line [&>tr]:relative">
              {completed.map((a) => (
                <tr key={a.id} className="group transition-colors duration-150 hover:bg-sunken/60">
                  <td className="px-5 py-3 text-ink">
                    {/* Link w pierwszej komórce otwiera ocenę; ::after rozciąga obszar kliknięcia na cały wiersz. */}
                    <Link
                      to={`/przelozony/oceny/${a.id}`}
                      aria-label={t.open(t.kind[a.kind], formatDate(a.completed_at!))}
                      className="inline-flex items-center gap-1 font-medium text-accent underline-offset-2 group-hover:underline after:absolute after:inset-0"
                    >
                      {t.kind[a.kind]}
                      <ChevronRight aria-hidden className="size-4" />
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-ink-muted">{texts.forms[a.form]}</td>
                  <td className="px-5 py-3 text-ink tabular-nums">{formatDate(a.completed_at!)}</td>
                  <td className="px-5 py-3">{a.result && <ResultBadge result={a.result} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
