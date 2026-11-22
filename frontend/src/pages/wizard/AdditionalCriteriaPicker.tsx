import { useEffect, useId, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Button } from '../../components/ui'
import { getAssessmentTemplate, getCompetencies } from '../../lib/api'
import { texts } from '../../lib/texts'
import type { AdditionalCriterion, AssessmentForm, Competency } from '../../types'
import { MAX_ADDITIONAL_CRITERIA } from './model'

type Catalog =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; competencies: Competency[]; mandatory: Set<string> }

/**
 * Wybór od 0 do 3 kryteriów dodatkowych z wykazu kompetencji (§ 5 ust. 2 rozporządzenia z 2016 r.).
 * Kompetencje obowiązkowe wybranego arkusza nie są pokazywane; po zmianie arkusza wybór, który stał się
 * obowiązkowy, jest odznaczany. Podpowiedź z analizy opisu stanowiska jest oznaczona i opisana.
 */
export function AdditionalCriteriaPicker({
  form,
  value,
  suggestions,
  onChange,
}: {
  form: AssessmentForm
  value: AdditionalCriterion[]
  suggestions: AdditionalCriterion[]
  onChange: (criteria: AdditionalCriterion[]) => void
}) {
  const t = texts.wizard.document
  const uid = useId()
  const [catalog, setCatalog] = useState<Catalog>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setCatalog({ kind: 'loading' })
    Promise.all([getCompetencies(), getAssessmentTemplate(form)])
      .then(([model, template]) => {
        if (!active) return
        setCatalog({ kind: 'ready', competencies: model.competencies, mandatory: new Set(template.mandatory_competency_ids) })
      })
      .catch(() => active && setCatalog({ kind: 'error' }))
    return () => {
      active = false
    }
  }, [form, attempt])

  // Po zmianie arkusza usuń z wyboru kryteria, które w nowym arkuszu są obowiązkowe.
  useEffect(() => {
    if (catalog.kind !== 'ready') return
    const kept = value.filter((c) => !catalog.mandatory.has(c.criterion_id))
    if (kept.length !== value.length) onChange(kept)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog])

  if (catalog.kind === 'loading') {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-muted" role="status">
        <LoaderCircle aria-hidden className="size-4 animate-spin" />
        {t.criteriaLoading}
      </p>
    )
  }
  if (catalog.kind === 'error') {
    return (
      <div className="flex items-center gap-3 text-sm text-danger" role="alert">
        {t.criteriaError}
        <Button variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
          {t.criteriaRetry}
        </Button>
      </div>
    )
  }

  const selected = new Set(value.map((c) => c.criterion_id))
  const suggestedById = new Map(suggestions.map((c) => [c.criterion_id, c]))
  const options = catalog.competencies.filter((c) => !catalog.mandatory.has(c.competency_id))
  const full = value.length >= MAX_ADDITIONAL_CRITERIA

  function toggle(competency: Competency) {
    if (selected.has(competency.competency_id)) {
      onChange(value.filter((c) => c.criterion_id !== competency.competency_id))
      return
    }
    if (full) return
    const suggestion = suggestedById.get(competency.competency_id)
    onChange([
      ...value,
      {
        criterion_id: competency.competency_id,
        name: competency.name,
        rationale: suggestion?.rationale ?? t.criterionChosen,
      },
    ])
  }

  return (
    <div>
      <p id={`${uid}-licznik`} className="mb-3 text-sm font-medium text-ink" aria-live="polite">
        {t.criteriaCount(value.length, MAX_ADDITIONAL_CRITERIA)}
        {full && <span className="ml-1 font-normal text-ink-muted">{t.criteriaLimit}</span>}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {options.map((c) => {
          const checked = selected.has(c.competency_id)
          const suggestion = suggestedById.get(c.competency_id)
          const disabled = !checked && full
          const inputId = `${uid}-${c.competency_id}`
          return (
            <li key={c.competency_id}>
              <label
                htmlFor={inputId}
                className={`flex h-full items-start gap-3 rounded-md border px-3 py-2.5 ${
                  checked ? 'border-accent bg-accent/5' : 'border-line-strong'
                } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
              >
                <input
                  id={inputId}
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(c)}
                  aria-describedby={`${uid}-licznik${suggestion ? ` ${inputId}-why` : ''}`}
                  className="mt-1 size-4 accent-accent"
                />
                <span>
                  <span className="flex flex-wrap items-center gap-2 font-medium text-ink">
                    {c.name}
                    {suggestion && (
                      <span className="rounded-sm border border-accent/40 px-1.5 text-xs font-medium text-accent">
                        {t.criterionSuggested}
                      </span>
                    )}
                  </span>
                  {suggestion && (
                    <span id={`${inputId}-why`} className="mt-0.5 block text-sm text-ink-muted">
                      {t.criterionWhy} {suggestion.rationale}
                    </span>
                  )}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
