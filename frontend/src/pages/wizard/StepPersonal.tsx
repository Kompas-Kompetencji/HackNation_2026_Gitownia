import { useId, useRef, useState, type FormEvent } from 'react'
import { ArrowRight } from 'lucide-react'
import { Alert, Button, FieldError } from '../../components/ui'
import { inputClass } from '../../components/styles'
import { todayIso } from '../../lib/format'
import { texts } from '../../lib/texts'
import type { ContractType } from '../../types'
import type { PersonalData } from './model'

type Errors = Partial<Record<keyof PersonalData, string>>
const CONTRACT_TYPES: ContractType[] = ['fixed_term_first', 'indefinite', 'appointment']

function validate(d: PersonalData): Errors {
  const e = texts.wizard.personal.errors
  const errors: Errors = {}
  if (!d.first_name.trim()) errors.first_name = e.firstName
  if (!d.last_name.trim()) errors.last_name = e.lastName
  if (!d.hire_date) errors.hire_date = e.hireDate
  else if (d.hire_date > todayIso()) errors.hire_date = e.hireDateFuture
  if (!d.contract_type) errors.contract_type = e.contractType
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
  const ids = { first_name: useId(), last_name: useId(), hire_date: useId(), contract_type: useId() }

  function update<K extends keyof PersonalData>(key: K, v: PersonalData[K]) {
    const next = { ...value, [key]: v }
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
    const target =
      first === 'contract_type'
        ? formRef.current?.querySelector<HTMLInputElement>('input[name="contract_type"]')
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
