import { useState, type ReactNode } from 'react'
import { ArrowLeft, Check, LoaderCircle } from 'lucide-react'
import { Alert, Button } from '../../components/ui'
import { formatDate } from '../../lib/format'
import { texts } from '../../lib/texts'
import type { DocumentData, PersonalData } from './model'

export function StepSummary({
  personal,
  document: doc,
  onEdit,
  onBack,
  onCreate,
}: {
  personal: PersonalData
  document: DocumentData
  onEdit: (step: 0 | 1) => void
  onBack: () => void
  /** Zwraca obietnicę; odrzucenie pokazuje błąd, a dane w kreatorze zostają. */
  onCreate: () => Promise<void>
}) {
  const t = texts.wizard.summary
  const d = texts.wizard.document
  const p = texts.wizard.personal
  const [state, setState] = useState<'idle' | 'creating' | 'error'>('idle')
  const edited = doc.edited

  async function handleCreate() {
    setState('creating')
    try {
      await onCreate()
    } catch {
      setState('error')
    }
  }

  return (
    <div className="space-y-8">
      <p className="text-ink-muted">{t.lead}</p>

      <SummarySection title={t.personalTitle} onEdit={() => onEdit(0)}>
        <Row label={p.firstName}>{personal.first_name}</Row>
        <Row label={p.lastName}>{personal.last_name}</Row>
        <Row label={p.hireDate}>{personal.hire_date && formatDate(personal.hire_date)}</Row>
        <Row label={p.contractType}>{personal.contract_type && texts.contractType[personal.contract_type]}</Row>
      </SummarySection>

      {edited && (
        <SummarySection title={t.documentTitle} onEdit={() => onEdit(1)}>
          <Row label={t.file}>{doc.file?.name}</Row>
          <Row label={d.positionTitle}>{edited.position_title}</Row>
          {edited.organizational_unit && <Row label={texts.employee.unit}>{edited.organizational_unit}</Row>}
          <Row label={d.subordinates}>{edited.subordinates_count}</Row>
          <Row label={d.form}>{d.formOptions[edited.form].label}</Row>
          <Row label={d.criteria}>
            <ol className="list-decimal space-y-0.5 pl-5">
              {edited.criteria.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ol>
          </Row>
        </SummarySection>
      )}

      {state === 'error' && <Alert>{t.createError}</Alert>}

      <div className="flex items-center justify-between border-t border-line pt-6">
        <Button variant="secondary" onClick={onBack} disabled={state === 'creating'}>
          <ArrowLeft aria-hidden className="size-4" />
          {texts.wizard.back}
        </Button>
        <Button onClick={handleCreate} disabled={state === 'creating'}>
          {state === 'creating' ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Check aria-hidden className="size-4" />}
          {state === 'creating' ? t.creating : t.create}
        </Button>
      </div>
    </div>
  )
}

function SummarySection({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <section className="rounded-md border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h3 className="font-semibold text-ink">{title}</h3>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-sm px-2 py-1 text-sm font-medium text-accent underline-offset-2 hover:underline"
          aria-label={`${texts.wizard.summary.edit}: ${title}`}
        >
          {texts.wizard.summary.edit}
        </button>
      </div>
      <dl className="divide-y divide-line">{children}</dl>
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 px-5 py-2.5">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  )
}
