import { texts } from '../lib/texts'
import type { EmployeeStatus } from '../types'

type Tone = 'neutral' | 'accent' | 'warning' | 'danger' | 'positive'

const TONE: Record<EmployeeStatus, Tone> = {
  awaiting_first_assessment: 'accent',
  assessment_in_progress: 'neutral',
  assessment_due_soon: 'warning',
  assessment_overdue: 'danger',
  up_to_date: 'positive',
}

const TONE_CLASSES: Record<Tone, { box: string; dot: string }> = {
  neutral: { box: 'bg-sunken text-ink', dot: 'bg-ink-muted' },
  accent: { box: 'bg-accent-soft text-accent', dot: 'bg-accent' },
  warning: { box: 'bg-warning-soft text-warning', dot: 'bg-warning' },
  danger: { box: 'bg-danger-soft text-danger', dot: 'bg-danger' },
  positive: { box: 'bg-positive-soft text-positive', dot: 'bg-positive' },
}

/** Status zawsze jako tekst; kolor tylko go wzmacnia. */
export function EmployeeStatusBadge({ status }: { status: EmployeeStatus }) {
  const tone = TONE_CLASSES[TONE[status]]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-sm font-medium whitespace-nowrap ${tone.box}`}>
      <span aria-hidden className={`size-1.5 rounded-full ${tone.dot}`} />
      {texts.status.employee[status]}
    </span>
  )
}
