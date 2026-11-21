import { CircleAlert, FileText, Lock } from 'lucide-react'
import { texts } from '../../lib/texts'
import type { AssessmentForm, AssessmentTemplate, Competency, JobDescriptionDocument } from '../../types'

const t = texts.assessment.setup

/** Krok 1: arkusz B/C i do trzech kryteriów dodatkowych spośród czternastu kompetencji. */
export function SetupStep({
  form,
  additional,
  template,
  templateState,
  competencies,
  source,
  suggestedForm,
  suggestedAdditional,
  droppedNames,
  onFormChange,
  onToggleAdditional,
}: {
  form: AssessmentForm
  additional: string[]
  template: AssessmentTemplate | null
  templateState: 'loading' | 'error' | 'ready'
  competencies: Competency[]
  source: JobDescriptionDocument | null
  suggestedForm: AssessmentForm | null
  suggestedAdditional: string[]
  /** Kryteria z odpowiedziami, które po zmianie arkusza lub odznaczeniu wypadły z oceny. */
  droppedNames: string[]
  onFormChange: (form: AssessmentForm) => void
  onToggleAdditional: (competency_id: string) => void
}) {
  const byId = new Map(competencies.map((c) => [c.competency_id, c]))
  const mandatory = template?.mandatory_competency_ids ?? []
  const max = template?.max_additional ?? 3
  const options = competencies.filter((c) => !mandatory.includes(c.competency_id))
  const limitReached = additional.length >= max

  return (
    <div>
      <h2 tabIndex={-1} data-step-heading className="font-serif text-display font-semibold text-ink focus:outline-none">
        {t.title}
      </h2>
      <p className="mt-2 max-w-prose text-ink-muted">{t.lead}</p>
      <p className="mt-3 flex items-center gap-2 text-sm text-ink">
        <FileText aria-hidden className="size-4 shrink-0 text-ink-muted" />
        {source ? t.source(source.filename, source.version) : t.noSource}
      </p>

      <fieldset className="mt-8">
        <legend className="mb-2 font-semibold text-ink">{t.form}</legend>
        <div className="grid grid-cols-2 gap-3">
          {(['C', 'B'] as const).map((f) => {
            const checked = form === f
            return (
              <label key={f} className="block">
                <input
                  type="radio"
                  name="arkusz"
                  value={f}
                  checked={checked}
                  onChange={() => onFormChange(f)}
                  className="peer sr-only"
                />
                <span
                  className={`flex h-full cursor-pointer flex-col rounded-md border px-4 py-3 transition-colors duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${
                    checked ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface hover:bg-sunken'
                  }`}
                >
                  <span className="flex items-center gap-2 font-medium text-ink">
                    <span
                      aria-hidden
                      className={`grid size-4 place-items-center rounded-full border ${checked ? 'border-accent' : 'border-line-strong'}`}
                    >
                      {checked && <span className="size-2 rounded-full bg-accent" />}
                    </span>
                    {t.formOptions[f].label}
                    {suggestedForm === f && (
                      <span className="rounded-sm bg-surface px-1.5 py-0.5 text-xs font-medium text-accent">{t.suggested}</span>
                    )}
                  </span>
                  <span className="mt-1 pl-6 text-sm text-ink-muted">{t.formOptions[f].hint}</span>
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      {droppedNames.length > 0 && (
        <p role="status" className="mt-4 flex items-start gap-2 rounded-md bg-warning-soft px-4 py-3 text-sm text-warning">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            {t.dropped(droppedNames.join(', '))}
          </span>
        </p>
      )}

      <section aria-labelledby="kryteria-obowiazkowe" className="mt-8">
        <h3 id="kryteria-obowiazkowe" className="font-semibold text-ink">
          {t.mandatory}
        </h3>
        <p className="text-sm text-ink-muted">{t.mandatoryLead}</p>
        {templateState === 'loading' && <p className="mt-2 text-sm text-ink-muted">{t.templateLoading}</p>}
        {templateState === 'error' && <p className="mt-2 text-sm text-danger">{t.templateError}</p>}
        {templateState === 'ready' && (
          <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-sunken/50">
            {mandatory.map((id) => (
              <li key={id} className="flex items-center gap-3 px-4 py-2.5">
                <Lock aria-hidden className="size-3.5 shrink-0 text-ink-muted" />
                <span className="flex-1 text-ink">{byId.get(id)?.name ?? id}</span>
                <span className="text-sm text-ink-muted">{t.indicatorCount(byId.get(id)?.indicators.length ?? 0)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <fieldset className="mt-8" aria-describedby="dodatkowe-opis dodatkowe-licznik">
        <legend className="font-semibold text-ink">{t.additional}</legend>
        <p id="dodatkowe-opis" className="text-sm text-ink-muted">
          {t.additionalLead(max)} {t.removeWarning}
        </p>
        <p id="dodatkowe-licznik" aria-live="polite" className="mt-2 text-sm font-medium text-ink tabular-nums">
          {t.additionalCount(additional.length, max)}
          {limitReached && <span className="ml-2 font-normal text-ink-muted">{t.additionalLimit(max)}</span>}
        </p>
        <ul className="mt-3 grid grid-cols-2 gap-x-6">
          {options.map((c) => {
            const checked = additional.includes(c.competency_id)
            const disabled = !checked && limitReached
            return (
              <li key={c.competency_id}>
                <label
                  className={`flex items-start gap-3 rounded-md px-2 py-2 transition-colors duration-150 ${
                    disabled ? 'cursor-not-allowed text-ink-muted' : 'cursor-pointer hover:bg-sunken'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => onToggleAdditional(c.competency_id)}
                    className="mt-1 size-4 shrink-0 accent-accent"
                  />
                  <span>
                    <span className={disabled ? '' : 'text-ink'}>{c.name}</span>
                    <span className="block text-xs text-ink-muted">
                      {t.indicatorCount(c.indicators.length)}
                      {suggestedAdditional.includes(c.competency_id) && (
                        <span className="ml-2 font-medium text-accent">· {t.suggestedTag}</span>
                      )}
                    </span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      </fieldset>
    </div>
  )
}
