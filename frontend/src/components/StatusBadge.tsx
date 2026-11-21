import { texts } from '../lib/texts'
import type { AssessmentResult, EmployeeStatus } from '../types'
import { employeeStatusTone, toneClasses, type Tone } from './styles'

function Badge({ tone, children }: { tone: Tone; children: string }) {
  const c = toneClasses[tone]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-sm font-medium whitespace-nowrap ${c.box}`}>
      <span aria-hidden className={`size-1.5 rounded-full ${c.dot}`} />
      {children}
    </span>
  )
}

/** Status zawsze jako tekst; kolor tylko go wzmacnia. */
export function EmployeeStatusBadge({ status }: { status: EmployeeStatus }) {
  return <Badge tone={employeeStatusTone[status]}>{texts.status.employee[status]}</Badge>
}

export function ResultBadge({ result }: { result: AssessmentResult }) {
  return <Badge tone={result === 'positive' ? 'positive' : 'danger'}>{texts.employee.history.result[result]}</Badge>
}
