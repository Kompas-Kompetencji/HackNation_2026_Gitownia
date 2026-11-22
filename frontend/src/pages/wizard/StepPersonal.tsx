import { useId, useRef, useState, type FormEvent } from 'react'
import { ArrowRight } from 'lucide-react'
import { Alert, Button, FieldError } from '../../components/ui'
import { inputClass } from '../../components/styles'
import { todayIso } from '../../lib/format'
import { texts } from '../../lib/texts'
import type { AssessmentKind, ContractType } from '../../types'
import { allowedPaths, minReplacementEnd, needsContractEnd, type PersonalData } from './model'
import { formatDate } from '../../lib/format'

type Errors = Partial<Record<keyof PersonalData, string>>
const CONTRACT_TYPES: ContractType[] = ['fixed_term_first', 'replacement', 'indefinite', 'appointment']
const PATHS: AssessmentKind[] = ['first', 'periodic']
const RADIO_KEYS: (keyof PersonalData)[] = ['contract_type', 'assessment_kind']

function validate(d: PersonalData): Errors {
  const e = texts.wizard.personal.errors
  const errors: Errors = {}
  if (!d.first_name.trim()) errors.first_name = e.firstName
  if (!d.last_name.trim()) errors.last_name = e.lastName
  if (!d.hire_date) errors.hire_date = e.hireDate
  else if (d.hire_date > todayIso()) errors.hire_date = e.hireDateFuture
  if (!d.contract_type) errors.contract_type = e.contractType
  if (needsContractEnd(d.contract_type)) {
    if (!d.contract_end_date) errors.contract_end_date = e.contractEndDate
    else if (d.hire_date && d.contract_end_date <= d.hire_date) errors.contract_end_date = e.contractEndBeforeHire
  }
  if (d.contract_type === 'replacement') {
    if (!d.first_eval_agreement_date) errors.first_eval_agreement_date = e.agreementDate
    else if ((d.hire_date && d.first_eval_agreement_date < d.hire_date) || d.first_eval_agreement_date > todayIso())
      errors.first_eval_agreement_date = e.agreementRange
    else if (d.contract_end_date && d.contract_end_date < minReplacementEnd(d.first_eval_agreement_date))
      errors.contract_end_date = e.replacementTooShort(formatDate(minReplacementEnd(d.first_eval_agreement_date)))
  }
  if (!d.assessment_kind) errors.assessment_kind = e.path
  else if (!allowedPaths(d.contract_type).includes(d.assessment_kind)) errors.assessment_kind = e.pathIncompatible
  return errors
}

export function StepPersonal({
  value,
  onChange,
  onNext,
}: {
  value: PersonalData
  onChange: (v: PersonalData) => void
  onNext: () => void
}) {
  const t = texts.wizard.personal
  const [errors, setErrors] = useState<Errors>({})
  const [submitted, setSubmitted] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const ids = {
    first_name: useId(),
    last_name: useId(),
    hire_date: useId(),
    contract_type: useId(),
    contract_end_date: useId(),
    first_eval_agreement_date: useId(),
    assessment_kind: useId(),
  }

  function update<K extends keyof PersonalData>(key: K, v: PersonalData[K]) {
    const next = { ...value, [key]: v }
    if (key === 'contract_type') {
      // Rodzaj oceny wynika z umowy – ustawiamy go od razu, gdy jest tylko jedna możliwość.
      const paths = allowedPaths(v as ContractType)
      if (paths.length === 1) next.assessment_kind = paths[0]
    }
    onChange(next)
    // Po pierwszej próbie wysłania błędy aktualizują się na bieżąco.
    if (submitted) setErrors(validate(next))
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const found = validate(value)
    setErrors(found)
    setSubmitted(true)
    const first = (Object.keys(ids) as (keyof PersonalData)[]).find((k) => found[k])
    if (!first) {
      onNext()
      return
    }
    const target = RADIO_KEYS.includes(first)
      ? (formRef.current?.querySelector<HTMLInputElement>(`input[name="${first}"]:checked`) ??
        formRef.current?.querySelector<HTMLInputElement>(`input[name="${first}"]`))
      : document.getElementById(ids[first])
    target?.focus()
  }

  const errorCount = Object.keys(errors).length
  const describe = (key: keyof PersonalData) => (errors[key] ? `${ids[key]}-blad` : undefined)

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-6">
      <p className="text-ink-muted">{t.lead}</p>

      {errorCount > 0 && <Alert>{t.errorSummary(errorCount)}</Alert>}

      <div className="grid grid-cols-2 gap-5">
        <TextField id={ids.first_name} label={t.firstName} value={value.first_name} error={errors.first_name} autoComplete="given-name" onChange={(v) => update('first_name', v)} />
        <TextField id={ids.last_name} label={t.lastName} value={value.last_name} error={errors.last_name} autoComplete="family-name" onChange={(v) => update('last_name', v)} />
      </div>

      <div className="max-w-xs">
        <label htmlFor={ids.hire_date} className="mb-1.5 block font-medium text-ink">
          {t.hireDate}
        </label>
        <input
          id={ids.hire_date}
          type="date"
          max={todayIso()}
          value={value.hire_date}
          onChange={(e) => update('hire_date', e.target.value)}
          aria-required
          aria-invalid={!!errors.hire_date}
          aria-describedby={describe('hire_date')}
          className={inputClass(!!errors.hire_date)}
        />
        {errors.hire_date && <FieldError id={`${ids.hire_date}-blad`}>{errors.hire_date}</FieldError>}
      </div>

      <fieldset aria-describedby={describe('contract_type')} aria-required>
        <legend className="mb-2 font-medium text-ink">{t.contractType}</legend>
        <div
          className={`divide-y divide-line overflow-hidden rounded-md border bg-surface ${
            errors.contract_type ? 'border-danger' : 'border-line-strong'
          }`}
        >
          {CONTRACT_TYPES.map((c) => (
            <label
              key={c}
              className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-accent ${
                value.contract_type === c ? 'bg-accent-soft' : 'hover:bg-sunken'
              }`}
            >
              <input
                type="radio"
                name="contract_type"
                value={c}
                checked={value.contract_type === c}
                onChange={() => update('contract_type', c)}
                className="size-4 accent-accent focus-visible:outline-none"
              />
              <span className="text-ink">{texts.contractType[c]}</span>
            </label>
          ))}
        </div>
        {errors.contract_type && <FieldError id={`${ids.contract_type}-blad`}>{errors.contract_type}</FieldError>}
      </fieldset>

      {needsContractEnd(value.contract_type) && (
        <div className="max-w-xs animate-panel-in">
          <label htmlFor={ids.contract_end_date} className="mb-1.5 block font-medium text-ink">
            {t.contractEndDate}
          </label>
          <input
            id={ids.contract_end_date}
            type="date"
            min={value.hire_date || undefined}
            value={value.contract_end_date}
            onChange={(e) => update('contract_end_date', e.target.value)}
            aria-required
            aria-invalid={!!errors.contract_end_date}
            aria-describedby={[`${ids.contract_end_date}-hint`, errors.contract_end_date ? `${ids.contract_end_date}-blad` : ''].filter(Boolean).join(' ')}
            className={inputClass(!!errors.contract_end_date)}
          />
          <p id={`${ids.contract_end_date}-hint`} className="mt-1.5 text-sm text-ink-muted">
            {value.contract_type === 'replacement' ? t.contractEndHintReplacement : t.contractEndHint}
          </p>
          {errors.contract_end_date && <FieldError id={`${ids.contract_end_date}-blad`}>{errors.contract_end_date}</FieldError>}
        </div>
      )}

      {value.contract_type === 'replacement' && (
        <div className="space-y-4 rounded-md border border-line bg-sunken px-5 py-4">
          <p className="text-sm leading-relaxed text-ink">{t.replacementInfo}</p>
          <div className="max-w-xs">
            <label htmlFor={ids.first_eval_agreement_date} className="mb-1.5 block font-medium text-ink">
              {t.agreementDate}
            </label>
            <input
              id={ids.first_eval_agreement_date}
              type="date"
              min={value.hire_date || undefined}
              max={todayIso()}
              value={value.first_eval_agreement_date}
              onChange={(e) => update('first_eval_agreement_date', e.target.value)}
              aria-required
              aria-invalid={!!errors.first_eval_agreement_date}
              aria-describedby={[
                `${ids.first_eval_agreement_date}-hint`,
                errors.first_eval_agreement_date ? `${ids.first_eval_agreement_date}-blad` : '',
              ]
                .filter(Boolean)
                .join(' ')}
              className={inputClass(!!errors.first_eval_agreement_date)}
            />
            <p id={`${ids.first_eval_agreement_date}-hint`} className="mt-1.5 text-sm text-ink-muted">
              {t.agreementHint}
            </p>
            {errors.first_eval_agreement_date && (
              <FieldError id={`${ids.first_eval_agreement_date}-blad`}>{errors.first_eval_agreement_date}</FieldError>
            )}
          </div>
        </div>
      )}

      <fieldset aria-describedby={describe('assessment_kind')} aria-required>
        <legend className="mb-2 font-medium text-ink">{t.path}</legend>
        <div className="grid grid-cols-2 gap-3">
          {PATHS.map((k) => {
            const checked = value.assessment_kind === k
            const disabled = !allowedPaths(value.contract_type).includes(k)
            return (
              <label
                key={k}
                className={`flex items-start gap-3 rounded-md border px-4 py-3 transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                  disabled ? 'cursor-not-allowed border-line bg-surface opacity-60' : 'cursor-pointer'
                } ${
                  disabled
                    ? ''
                    : checked
                    ? 'border-accent bg-accent-soft'
                    : errors.assessment_kind
                      ? 'border-danger bg-surface hover:bg-sunken'
                      : 'border-line-strong bg-surface hover:bg-sunken'
                }`}
              >
                <input
                  type="radio"
                  name="assessment_kind"
                  value={k}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => update('assessment_kind', k)}
                  className="mt-1 size-4 accent-accent focus-visible:outline-none"
                />
                <span>
                  <span className="block font-medium text-ink">{t.pathOptions[k].label}</span>
                  <span className="mt-0.5 block text-sm text-ink-muted">
                    {disabled ? t.pathUnavailable[k] : t.pathOptions[k].hint}
                  </span>
                </span>
              </label>
            )
          })}
        </div>
        {errors.assessment_kind && <FieldError id={`${ids.assessment_kind}-blad`}>{errors.assessment_kind}</FieldError>}
      </fieldset>

      <div className="flex justify-end border-t border-line pt-6">
        <Button type="submit">
          {texts.wizard.next}
          <ArrowRight aria-hidden className="size-4" />
        </Button>
      </div>
    </form>
  )
}

function TextField({
  id,
  label,
  value,
  error,
  autoComplete,
  onChange,
}: {
  id: string
  label: string
  value: string
  error?: string
  autoComplete?: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        aria-required
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-blad` : undefined}
        className={inputClass(!!error)}
      />
      {error && <FieldError id={`${id}-blad`}>{error}</FieldError>}
    </div>
  )
}
