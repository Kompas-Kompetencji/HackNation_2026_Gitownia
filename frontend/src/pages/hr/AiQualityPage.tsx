import { useCallback, useEffect, useState } from 'react'
import { CircleCheck, CircleAlert, LoaderCircle, ShieldCheck, ShieldAlert, Ban } from 'lucide-react'
import { AppLayout } from '../../layout/AppLayout'
import { PageHeader } from '../../components/PageHeader'
import { Alert, Button } from '../../components/ui'
import { getAiQuality } from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import { texts } from '../../lib/texts'
import type { AiQualityReport } from '../../types'

const t = texts.aiQuality

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; report: AiQualityReport }

/** Kadry/administrator: wiarygodność asystenta – test kontrolny i luki w bazie wiedzy. */
export function AiQualityPage() {
  const [state, setState] = useState<Load>({ kind: 'loading' })

  const load = useCallback(() => {
    setState({ kind: 'loading' })
    getAiQuality()
      .then((report) => setState({ kind: 'ready', report }))
      .catch(() => setState({ kind: 'error' }))
  }, [])
  useEffect(load, [load])

  return (
    <AppLayout>
      <PageHeader title={t.title} lead={t.lead} />
      {state.kind === 'loading' && (
        <p role="status" className="flex items-center gap-2 text-ink-muted">
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          {t.loading}
        </p>
      )}
      {state.kind === 'error' && (
        <Alert action={<Button variant="secondary" className="py-1.5 text-sm" onClick={load}>{texts.common.retry}</Button>}>{t.error}</Alert>
      )}
      {state.kind === 'ready' && <Report report={state.report} />}
    </AppLayout>
  )
}

function Report({ report }: { report: AiQualityReport }) {
  const c = report.check
  const tiles = [
    { value: `${c.passed}/${c.total}`, label: t.tiles.passed, icon: CircleCheck, tone: 'text-positive' },
    { value: `${c.strong}/${c.in_domain}`, label: t.tiles.strong, icon: ShieldCheck, tone: 'text-positive' },
    { value: `${c.partial}/${c.in_domain}`, label: t.tiles.partial, icon: ShieldAlert, tone: 'text-warning' },
    { value: `${c.refusals_ok}/${c.refusals_expected}`, label: t.tiles.refusals, icon: Ban, tone: 'text-accent' },
  ]
  return (
    <>
      <section aria-label={t.title} className="mb-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map(({ value, label, icon: Icon, tone }) => (
          <div key={label} className="rounded-lg border border-line bg-surface p-4 shadow-raised">
            <span className={`flex size-8 items-center justify-center rounded-md bg-sunken ${tone}`}>
              <Icon aria-hidden className="size-4" />
            </span>
            <p className="mt-3 font-serif text-[2rem] leading-none font-semibold text-ink tabular-nums">{value}</p>
            <p className="mt-1.5 text-sm text-ink-muted">{label}</p>
          </div>
        ))}
      </section>
      <p className="mb-10 text-xs text-ink-faint">{t.checkedAt(formatDateTime(c.checked_at))}</p>

      <section aria-labelledby="pytania-bez-odpowiedzi" className="mb-10">
        <h2 id="pytania-bez-odpowiedzi" className="text-title font-semibold text-ink">{t.unansweredTitle}</h2>
        <p className="mt-1 mb-3 max-w-3xl text-sm text-ink-muted">{t.unansweredLead}</p>
        {report.unanswered.length === 0 ? (
          <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink-muted">{t.unansweredEmpty}</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {report.unanswered.map((u) => (
              <li key={`${u.at}-${u.question}`} className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-sm">
                <span className="text-ink">{u.question}</span>
                <span className="shrink-0 text-ink-muted tabular-nums">{formatDateTime(u.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="wyniki-kontrolne">
        <h2 id="wyniki-kontrolne" className="mb-3 text-title font-semibold text-ink">{t.tableTitle}</h2>
        <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-raised">
          <table className="w-full text-left text-sm">
            <thead className="bg-sunken text-ink-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t.columns.question}</th>
                <th className="px-4 py-2.5 font-medium">{t.columns.expected}</th>
                <th className="px-4 py-2.5 font-medium">{t.columns.result}</th>
                <th className="px-4 py-2.5 font-medium">{t.columns.coverage}</th>
                <th className="px-4 py-2.5 font-medium">{t.columns.source}</th>
              </tr>
            </thead>
            <tbody>
              {c.items.map((i) => (
                <tr key={i.question} className="border-t border-line align-top">
                  <td className="px-4 py-2.5 text-ink">{i.question}</td>
                  <td className="px-4 py-2.5 text-ink-muted">{t.expected[i.expected]}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1.5 ${i.ok ? 'text-positive' : 'text-danger'}`}>
                      {i.ok ? <CircleCheck aria-hidden className="size-4" /> : <CircleAlert aria-hidden className="size-4" />}
                      {i.ok ? t.ok : t.notOk}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-ink-muted">{i.coverage ? t.coverage[i.coverage] : t.coverage.none}</td>
                  <td className="px-4 py-2.5 text-ink-muted">{i.top_document ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
