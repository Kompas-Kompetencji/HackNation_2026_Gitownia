import { History } from 'lucide-react'
import { ResultBadge } from '../../components/StatusBadge'
import { formatDate } from '../../lib/format'
import { texts } from '../../lib/texts'
import type { AssessmentSummary } from '../../types'

/** Zakończone oceny pracownika, od najnowszej. */
export function AssessmentHistory({ assessments }: { assessments: AssessmentSummary[] }) {
  const t = texts.employee.history
  const completed = assessments
    .filter((a) => a.status === 'completed' && a.completed_at)
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))

  return (
    <section aria-labelledby="historia-ocen">
      <h2 id="historia-ocen" className="mb-3 text-title font-semibold text-ink">
        {t.title}
      </h2>
      {completed.length === 0 ? (
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
            <tbody className="divide-y divide-line">
              {completed.map((a) => (
                <tr key={a.id}>
                  <td className="px-5 py-3 text-ink">{t.kind[a.kind]}</td>
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
