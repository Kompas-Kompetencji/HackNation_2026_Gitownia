import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import { AppLayout } from '../../layout/AppLayout'
import { PageHeader } from '../../components/PageHeader'
import { attachJobDescription, createEmployee } from '../../lib/api'
import { fullName } from '../../lib/format'
import { texts } from '../../lib/texts'
import {
  emptyDocument,
  emptyFirstDocument,
  emptyPersonal,
  needsContractEnd,
  toConfirmed,
  type DocumentData,
  type FirstDocumentData,
  type PersonalData,
} from './model'
import { StepPersonal } from './StepPersonal'
import { StepDocument } from './StepDocument'
import { StepFirstDocument } from './StepFirstDocument'
import { StepSummary } from './StepSummary'

type Step = 0 | 1 | 2

/**
 * Kreator dodania pracownika: dane → opis stanowiska → potwierdzenie.
 * Ścieżka "first" (nowo zatrudniony): opcjonalny opis do archiwum, arkusz pierwszej oceny, terminy z backendu.
 * Ścieżka "periodic" (pracownik dotychczasowy): analiza opisu stanowiska, arkusz B lub C i kryteria dodatkowe.
 */
export function NewEmployeePage() {
  const t = texts.wizard
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(0)
  const [personal, setPersonal] = useState<PersonalData>(emptyPersonal)
  const [doc, setDoc] = useState<DocumentData>(emptyDocument)
  const [firstDoc, setFirstDoc] = useState<FirstDocumentData>(emptyFirstDocument)
  const isFirst = personal.assessment_kind === 'first'
  const steps = t.steps[isFirst ? 'first' : 'periodic']
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Po wejściu i po każdej zmianie kroku fokus na nagłówek kroku,
  // żeby czytnik ekranu i klawiatura zaczynały od jego początku.
  useEffect(() => {
    headingRef.current?.focus()
  }, [step])

  async function create() {
    if (!personal.contract_type || !personal.assessment_kind) throw new Error('Niepełne dane')
    const base = {
      first_name: personal.first_name.trim(),
      last_name: personal.last_name.trim(),
      hire_date: personal.hire_date,
      contract_type: personal.contract_type,
      contract_end_date: needsContractEnd(personal.contract_type) ? personal.contract_end_date : null,
      assessment_kind: personal.assessment_kind,
    }

    let employee
    if (isFirst) {
      employee = await createEmployee({
        ...base,
        form: 'first',
        position_title: firstDoc.position_title.trim(),
        organizational_unit: null,
      })
      // Opis stanowiska na tej ścieżce trafia tylko do archiwum, bez analizy.
      if (firstDoc.file) await attachJobDescription(employee.id, firstDoc.file)
    } else {
      if (!doc.file || !doc.analysis || !doc.edited) throw new Error('Niepełne dane')
      const confirmed = toConfirmed(doc.analysis, doc.edited)
      employee = await createEmployee({
        ...base,
        form: confirmed.suggested_form,
        position_title: confirmed.position_title,
        organizational_unit: confirmed.organizational_unit,
      })
      await attachJobDescription(employee.id, doc.file, confirmed)
    }
    navigate(`/przelozony/pracownicy/${employee.id}`, { state: { created: fullName(employee), withDocument: isFirst ? !!firstDoc.file : true } })
  }

  return (
    <AppLayout>
      <Link
        to="/przelozony"
        className="mb-4 inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-ink-muted underline-offset-2 hover:text-ink hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t.backToList}
      </Link>
      <PageHeader title={t.title} />

      <div className="grid grid-cols-[13rem_minmax(0,42rem)] gap-14">
        <div className="self-start">
          <ol aria-label={t.progressLabel} className="space-y-1">
            {steps.map((name, i) => {
              const done = i < step
              const current = i === step
              return (
                <li
                  key={name}
                  aria-current={current ? 'step' : undefined}
                  className={`flex items-center gap-3 rounded-md px-2 py-2 ${current ? 'bg-surface shadow-raised' : ''}`}
                >
                  <span
                    aria-hidden
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums transition-colors duration-150 ${
                      done
                        ? 'border-accent bg-accent text-accent-ink'
                        : current
                          ? 'border-accent text-accent'
                          : 'border-line-strong text-ink-muted'
                    }`}
                  >
                    {done ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  <span className={current ? 'font-medium text-ink' : done ? 'text-ink' : 'text-ink-muted'}>{name}</span>
                </li>
              )
            })}
          </ol>
        </div>

        <section aria-labelledby="krok-tytul">
          <p className="text-sm font-medium text-accent" aria-hidden>
            {t.stepOf(step + 1, steps.length)}
          </p>
          <h2 id="krok-tytul" ref={headingRef} tabIndex={-1} className="mt-1 mb-4 text-title font-semibold text-ink focus:outline-none">
            <span className="sr-only">{t.stepOf(step + 1, steps.length)}: </span>
            {steps[step]}
          </h2>

          {step === 0 && <StepPersonal value={personal} onChange={setPersonal} onNext={() => setStep(1)} />}
          {step === 1 && isFirst && (
            <StepFirstDocument value={firstDoc} onChange={setFirstDoc} onBack={() => setStep(0)} onNext={() => setStep(2)} />
          )}
          {step === 1 && !isFirst && (
            <StepDocument value={doc} onChange={setDoc} onBack={() => setStep(0)} onNext={() => setStep(2)} />
          )}
          {step === 2 && (
            <StepSummary
              personal={personal}
              document={doc}
              firstDocument={firstDoc}
              onEdit={(s) => setStep(s)}
              onBack={() => setStep(1)}
              onCreate={create}
            />
          )}
        </section>
      </div>
    </AppLayout>
  )
}
