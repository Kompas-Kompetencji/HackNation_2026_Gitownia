import { Circle, CircleAlert, CircleCheck, CircleDot, ClipboardList, Settings2 } from 'lucide-react'
import { texts } from '../../lib/texts'
import { criterionStep, SETUP_STEP, SUMMARY_STEP, type Criterion, type CriterionStatus } from './model'

const t = texts.assessment.stepper

const STATUS_ICON = {
  todo: Circle,
  progress: CircleDot,
  blocked: CircleAlert,
  decided: CircleCheck,
} satisfies Record<CriterionStatus, typeof Circle>

/**
 * Pionowy pasek kroków. Każdy krok to przycisk (można wracać i przeskakiwać),
 * stan kryterium zawsze jako tekst, ikona i kolor tylko go wzmacniają.
 */
export function Stepper({
  criteria,
  current,
  statuses,
  decisions,
  onSelect,
  setupStep = SETUP_STEP,
  setupLabel = t.setup,
  mandatoryTitle = t.mandatory,
}: {
  criteria: Criterion[]
  current: string
  statuses: Record<string, CriterionStatus>
  decisions: Record<string, number | null>
  onSelect: (step: string) => void
  /** Pierwszy krok: konfiguracja (ocena okresowa) albo dane pierwszej oceny. */
  setupStep?: string
  setupLabel?: string
  mandatoryTitle?: string
}) {
  const mandatory = criteria.filter((c) => c.mandatory)
  const additional = criteria.filter((c) => !c.mandatory)

  return (
    <nav aria-label={t.label} className="sticky top-32 max-h-[calc(100vh-9rem)] self-start overflow-y-auto text-sm">
      <ol className="space-y-5">
        <li>
          <StepButton id={setupStep} current={current} onSelect={onSelect} icon={Settings2} label={setupLabel} />
        </li>
        <Group title={mandatoryTitle} items={mandatory} current={current} statuses={statuses} decisions={decisions} onSelect={onSelect} offset={0} />
        {additional.length > 0 && (
          <Group
            title={t.additional}
            items={additional}
            current={current}
            statuses={statuses}
            decisions={decisions}
            onSelect={onSelect}
            offset={mandatory.length}
          />
        )}
        <li>
          <StepButton id={SUMMARY_STEP} current={current} onSelect={onSelect} icon={ClipboardList} label={t.summary} />
        </li>
      </ol>
    </nav>
  )
}

function Group({
  title,
  items,
  current,
  statuses,
  decisions,
  onSelect,
  offset,
}: {
  title: string
  items: Criterion[]
  current: string
  statuses: Record<string, CriterionStatus>
  decisions: Record<string, number | null>
  onSelect: (step: string) => void
  offset: number
}) {
  return (
    <li>
      <p className="mb-1.5 pl-2 text-xs font-medium tracking-wide text-ink-muted uppercase">{title}</p>
      <ol className="space-y-0.5">
        {items.map((c, i) => {
          const id = c.competency.competency_id
          const status = statuses[id] ?? 'todo'
          const decision = decisions[id]
          return (
            <li key={id}>
              <StepButton
                id={criterionStep(id)}
                current={current}
                onSelect={onSelect}
                icon={STATUS_ICON[status]}
                label={`${offset + i + 1}. ${c.competency.name}`}
                state={status === 'decided' && decision ? t.state.decided(decision) : t.state[status === 'decided' ? 'todo' : status]}
                tone={status}
              />
            </li>
          )
        })}
      </ol>
    </li>
  )
}

function StepButton({
  id,
  current,
  onSelect,
  icon: Icon,
  label,
  state,
  tone,
}: {
  id: string
  current: string
  onSelect: (step: string) => void
  icon: typeof Circle
  label: string
  state?: string
  tone?: CriterionStatus
}) {
  const active = id === current
  const iconColor =
    tone === 'blocked' ? 'text-danger' : tone === 'decided' ? 'text-positive' : active ? 'text-accent' : 'text-ink-muted'
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-current={active ? 'step' : undefined}
      className={`relative flex w-full items-start gap-2 rounded-md py-1.5 pr-2 pl-2 text-left transition-colors duration-150 ${
        active ? 'bg-accent-soft' : 'hover:bg-sunken'
      }`}
    >
      {active && <span aria-hidden className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-accent" />}
      <Icon aria-hidden className={`mt-0.5 size-4 shrink-0 ${iconColor}`} />
      <span className="min-w-0">
        <span className={`block leading-snug ${active ? 'font-semibold text-ink' : 'text-ink'}`}>{label}</span>
        {state && (
          <span className={`block text-xs ${tone === 'blocked' ? 'font-medium text-danger' : 'text-ink-muted'}`}>{state}</span>
        )}
      </span>
    </button>
  )
}
