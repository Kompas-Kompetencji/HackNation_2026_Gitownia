import { useState } from 'react'
import { CircleAlert, FileDown, LoaderCircle, PencilLine } from 'lucide-react'
import { ResultBadge } from '../../components/StatusBadge'
import { Button } from '../../components/ui'
import { USE_MOCKS, exportAssessmentPdf } from '../../lib/api'
import { assessmentPdfName, downloadBlob } from '../../lib/download'
import { texts } from '../../lib/texts'
import type { AssessmentEvaluation, Level } from '../../types'
import { formatTwoDecimals } from './model'

const t = texts.assessment.summary

export interface DecisionRow {
  competency_id: string
  name: string
  mandatory: boolean
  suggested: Level | null | undefined
  /** Decyzja bez żadnego ocenionego wskaźnika (blokuje zakończenie). */
  noEvidence?: boolean
  decision: Level | null
  note: string
  /** Krok formularza do edycji; brak = widok tylko do odczytu. */
  step?: string
}

/** Tabela decyzji dla wszystkich kryteriów (podsumowanie i widok tylko do odczytu). */
export function DecisionsTable({
  rows,
  onEdit,
  showSuggestion = true,
  decisionLabel = t.table.decision,
  caption = t.table.caption,
  criterionLabel = t.table.criterion,
}: {
  rows: DecisionRow[]
  onEdit?: (step: string) => void
  showSuggestion?: boolean
  decisionLabel?: string
  caption?: string
  criterionLabel?: string
}) {
  const c = t.table
  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-line bg-sunken/60 text-sm text-ink-muted">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">{criterionLabel}</th>
            {showSuggestion && <th scope="col" className="px-4 py-2.5 font-medium">{c.suggested}</th>}
            <th scope="col" className="px-4 py-2.5 font-medium">{decisionLabel}</th>
            {onEdit && (
              <th scope="col" className="px-4 py-2.5 font-medium">
                <span className="sr-only">{c.editShort}</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.competency_id} className="align-top">
              <th scope="row" className="px-4 py-3 font-normal">
                <span className="text-ink">{r.name}</span>
                <span className="block text-xs text-ink-muted">{r.mandatory ? c.mandatory : c.additional}</span>
                {r.noEvidence && (
                  <span className="mt-1 flex items-center gap-1 text-xs font-medium text-danger">
                    <CircleAlert aria-hidden className="size-3.5" />
                    {c.noEvidence}
                  </span>
                )}
                {r.decision && r.suggested && r.decision !== r.suggested && (
                  <span className="mt-1 inline-block rounded-sm bg-warning-soft px-1.5 py-0.5 text-xs font-medium text-warning">
                    {c.differs}
                  </span>
                )}
                {r.note && <span className="mt-1 block text-sm text-ink-muted italic">„{r.note}”</span>}
              </th>
              {showSuggestion && (
                <td className="px-4 py-3 whitespace-nowrap text-ink-muted tabular-nums">
                  {r.suggested === undefined ? (
                    <LoaderCircle aria-label={texts.common.loading} className="size-4 animate-spin" />
                  ) : r.suggested ? (
                    texts.assessment.criterion.levelPoints(r.suggested)
                  ) : (
                    c.noSuggestion
                  )}
                </td>
              )}
              <td className="px-4 py-3">
                {r.decision ? (
                  <span className="text-ink">
                    <span className="font-semibold tabular-nums">{texts.assessment.criterion.levelPoints(r.decision)}</span>
                    <span className="block text-xs text-ink-muted">{texts.assessment.levels[r.decision]}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-danger">
                    <CircleAlert aria-hidden className="size-4" />
                    {c.noDecision}
                  </span>
                )}
              </td>
              {onEdit && r.step && (
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onEdit(r.step!)}
                    aria-label={c.edit(r.name)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-accent transition-colors duration-150 hover:bg-accent-soft"
                  >
                    <PencilLine aria-hidden className="size-3.5" />
                    {c.editShort}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Wynik z backendu: ocena pozytywna lub negatywna, średnia, ogólny poziom, powody. */
export function EvaluationResultView({ evaluation }: { evaluation: AssessmentEvaluation }) {
  const r = t.result
  const negative = evaluation.result === 'negative'
  return (
    <div className={`rounded-md border-l-4 bg-surface px-5 py-4 ${negative ? 'border-danger' : 'border-positive'}`}>
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <div className="text-lg">
          <ResultBadge result={evaluation.result} />
        </div>
        <dl className="flex gap-8">
          <div>
            <dt className="text-sm text-ink-muted">{r.mean}</dt>
            <dd className="font-semibold text-ink tabular-nums">{r.points(formatTwoDecimals(evaluation.mean))}</dd>
          </div>
          {evaluation.overall_level && (
            <div>
              <dt className="text-sm text-ink-muted">{r.level}</dt>
              <dd className="font-semibold text-ink">{evaluation.overall_level}</dd>
            </div>
          )}
        </dl>
      </div>
      {evaluation.reasons.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium text-ink">{r.reasons}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink">
            {evaluation.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
      {evaluation.warnings.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-medium text-warning">{r.warnings}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink">
            {evaluation.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Pobranie arkusza PDF; beforeExport pozwala najpierw zapisać wersję roboczą. */
export function PdfButton({
  assessmentId,
  employeeName,
  label,
  beforeExport,
}: {
  assessmentId: string
  employeeName: string
  label: string
  beforeExport?: () => Promise<boolean>
}) {
  const [state, setState] = useState<'idle' | 'working' | 'error'>('idle')

  async function handleClick() {
    setState('working')
    try {
      if (beforeExport && !(await beforeExport())) throw new Error('save failed')
      downloadBlob(await exportAssessmentPdf(assessmentId), assessmentPdfName(employeeName))
      setState('idle')
    } catch {
      setState('error')
    }
  }

  return (
    <div>
      <Button variant="secondary" onClick={() => void handleClick()} disabled={state === 'working'} className="whitespace-nowrap">
        {state === 'working' ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <FileDown aria-hidden className="size-4" />}
        {state === 'working' ? t.pdfPreparing : label}
      </Button>
      {state === 'error' && (
        <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-sm text-danger">
          <CircleAlert aria-hidden className="size-4" />
          {t.pdfError}
        </p>
      )}
      {USE_MOCKS && <p className="mt-1.5 max-w-64 text-xs text-ink-muted">{t.pdfMock}</p>}
    </div>
  )
}
