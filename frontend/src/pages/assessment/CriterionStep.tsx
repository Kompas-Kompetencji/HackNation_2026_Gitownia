import { forwardRef, useId, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, CircleAlert, CircleSlash, LoaderCircle, NotebookText, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui'
import { formatDate } from '../../lib/format'
import { texts } from '../../lib/texts'
import type { BehavioralIndicator, Level, Note, StarNote } from '../../types'
import type { SectionState } from '../employee/sectionState'
import {
  emptyStar,
  formatOneDecimal,
  hasStarContent,
  LEVELS,
  type Criterion,
  type FormState,
  type LocalAnswer,
} from './model'
import type { ScoreHint } from './useScoreHint'

const t = texts.assessment.criterion

/** Wspólny wygląd opcji wyboru: natywny radio (klawiatura: strzałki) ukryty pod etykietą. */
const optionClass =
  'flex h-full cursor-pointer flex-col items-center justify-start gap-0.5 rounded-md border px-1.5 py-2 text-center transition-[background-color,border-color,color,transform] duration-150 ease-out select-none active:scale-[0.97] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent'

export function CriterionStep({
  criterion,
  position,
  total,
  state,
  hint,
  onRetryHint,
  notes,
  blocked,
  onAnswer,
  onDecision,
  onRemove,
  onActiveIndicator,
}: {
  criterion: Criterion
  position: number
  total: number
  state: FormState
  hint: ScoreHint
  onRetryHint: () => void
  notes: SectionState<Note[]>
  blocked: boolean
  onAnswer: (indicator: BehavioralIndicator, patch: Partial<Pick<LocalAnswer, 'selected_level' | 'star_note'>>) => void
  onDecision: (patch: { selected_level?: Level; decision_note?: string }) => void
  onRemove: () => void
  onActiveIndicator: (indicator: BehavioralIndicator) => void
}) {
  const { competency, mandatory } = criterion
  const answered = competency.indicators.filter((i) => state.answers[i.indicator_id]?.selected_level !== undefined).length
  const decision = state.decisions[competency.competency_id]
  const suggested = hint.kind === 'ready' ? hint.result.suggested_level : null

  return (
    <div>
      <p className="text-sm font-medium text-ink-muted">
        <span className="sr-only">{texts.assessment.progress.criterion(position, total)}, </span>
        {mandatory ? t.mandatory : t.additional}
      </p>
      <h2 tabIndex={-1} data-step-heading className="mt-1 font-serif text-display font-semibold text-ink focus:outline-none">
        {competency.name}
      </h2>
      {competency.definition && <p className="mt-2 text-ink">{competency.definition}</p>}
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-muted">{t.lead}</p>
      <p className="mt-2 text-sm text-ink-muted tabular-nums">{t.answered(answered, competency.indicators.length)}</p>

      <ol className="mt-6 space-y-5">
        {competency.indicators.map((indicator, i) => (
          <li key={indicator.indicator_id}>
            <IndicatorCard
              indicator={indicator}
              position={i + 1}
              total={competency.indicators.length}
              answer={state.answers[indicator.indicator_id]}
              notes={notes}
              onAnswer={(patch) => onAnswer(indicator, patch)}
              onFocus={() => onActiveIndicator(indicator)}
            />
          </li>
        ))}
      </ol>

      {blocked && <BlockedAlert mandatory={mandatory} onRemove={onRemove} />}

      <section aria-labelledby="wskazowka" className="mt-8 border-t border-line pt-6">
        <ScoreHintView hint={hint} onRetry={onRetryHint} total={competency.indicators.length} state={state} criterion={criterion} />
      </section>

      <DecisionField
        competencyId={competency.competency_id}
        value={decision?.selected_level ?? null}
        note={decision?.decision_note ?? ''}
        suggested={suggested}
        onChange={onDecision}
      />
    </div>
  )
}

export const BlockedAlert = forwardRef<HTMLDivElement, { mandatory: boolean; onRemove: () => void }>(function BlockedAlert(
  { mandatory, onRemove },
  ref,
) {
  return (
    <div
      ref={ref}
      id="blokada-kryterium"
      role="alert"
      tabIndex={-1}
      className="mt-6 flex items-start gap-3 rounded-md border border-danger/40 bg-danger-soft px-4 py-3 text-danger focus:outline-2 focus:outline-offset-2 focus:outline-danger"
    >
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1">
        <p className="font-medium">{mandatory ? t.blocked.mandatory : t.blocked.additional}</p>
        {!mandatory && (
          <Button variant="secondary" onClick={onRemove} className="mt-3 border-danger/40 py-1.5 text-sm text-danger">
            <Trash2 aria-hidden className="size-4" />
            {t.blocked.remove}
          </Button>
        )}
      </div>
    </div>
  )
})

function IndicatorCard({
  indicator,
  position,
  total,
  answer,
  notes,
  onAnswer,
  onFocus,
}: {
  indicator: BehavioralIndicator
  position: number
  total: number
  answer: LocalAnswer | undefined
  notes: SectionState<Note[]>
  onAnswer: (patch: Partial<Pick<LocalAnswer, 'selected_level' | 'star_note'>>) => void
  onFocus: () => void
}) {
  const uid = useId()
  const level = answer?.selected_level
  const star = answer?.star_note ?? null
  const [exampleOpen, setExampleOpen] = useState(hasStarContent(star))
  const [notesOpen, setNotesOpen] = useState(false)
  const [insertedId, setInsertedId] = useState<string | null>(null)
  const situationRef = useRef<HTMLTextAreaElement>(null)
  const name = `poziom-${indicator.indicator_id}`

  function setStar(patch: Partial<StarNote>) {
    onAnswer({ star_note: { ...(star ?? emptyStar()), ...patch } })
  }

  function insertNote(note: Note) {
    const current = star?.situation.trim() ?? ''
    setStar({ situation: current ? `${current}\n${note.text}` : note.text })
    setExampleOpen(true)
    setInsertedId(note.id)
    requestAnimationFrame(() => situationRef.current?.focus())
  }

  const noteCount = notes.kind === 'ready' ? notes.data.length : 0

  return (
    <fieldset
      onFocus={onFocus}
      className="rounded-md border border-line bg-surface px-5 pt-4 pb-5"
      aria-describedby={`${uid}-tresc`}
    >
      <legend className="sr-only">
        {t.indicatorOf(position, total)}: {indicator.description}
      </legend>
      <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">{t.indicatorOf(position, total)}</p>
      <p id={`${uid}-tresc`} className="mt-1 text-ink">
        {indicator.description}
      </p>

      <div role="radiogroup" aria-label={t.levelLegend} className="mt-4">
        <div className="grid grid-cols-5 gap-1.5">
          {LEVELS.map((l) => {
            const checked = level === l
            return (
              <label key={l} className="block">
                <input
                  type="radio"
                  name={name}
                  value={l}
                  checked={checked}
                  onChange={() => onAnswer({ selected_level: l })}
                  aria-describedby={indicator.level_descriptions?.[l] ? `${uid}-opis-${l}` : undefined}
                  className="peer sr-only"
                />
                <span
                  className={`${optionClass} ${
                    checked
                      ? 'border-accent bg-accent text-accent-ink'
                      : 'border-line-strong bg-surface text-ink hover:border-accent hover:bg-accent-soft'
                  }`}
                >
                  <span className="text-base font-semibold tabular-nums">{t.levelPoints(l)}</span>
                  <span className={`text-xs leading-tight ${checked ? 'text-accent-ink' : 'text-ink-muted'}`}>
                    {texts.assessment.levels[l]}
                  </span>
                </span>
                {indicator.level_descriptions?.[l] && (
                  <span id={`${uid}-opis-${l}`} hidden>
                    {indicator.level_descriptions[l]}
                  </span>
                )}
              </label>
            )
          })}
        </div>
        <label className="mt-1.5 inline-block">
          <input
            type="radio"
            name={name}
            value="brak"
            checked={level === null}
            onChange={() => onAnswer({ selected_level: null })}
            className="peer sr-only"
          />
          <span
            className={`${optionClass} flex-row gap-2 px-3 ${
              level === null
                ? 'border-ink bg-sunken text-ink'
                : 'border-dashed border-line-strong bg-surface text-ink-muted hover:border-ink hover:text-ink'
            }`}
          >
            <CircleSlash aria-hidden className="size-4" />
            <span className="text-sm font-medium">{t.noBasis}</span>
            <span className="text-xs">({t.noBasisHint})</span>
          </span>
        </label>
      </div>

      <p className="mt-3 min-h-10 text-sm leading-snug text-ink-muted">
        {level === undefined && t.pickLevelHint}
        {level === null && t.noBasisSelected}
        {level != null && indicator.level_descriptions?.[level] && (
          <>
            <span className="font-medium text-ink">{t.levelDescription(level)}: </span>
            {indicator.level_descriptions[level]}
          </>
        )}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <DisclosureButton open={exampleOpen} controls={`${uid}-przyklad`} onClick={() => setExampleOpen((v) => !v)}>
          {exampleOpen || hasStarContent(star) ? t.example.toggleShow : t.example.toggleAdd}
          {!exampleOpen && hasStarContent(star) && <span className="font-normal text-ink-muted">({t.example.filled})</span>}
        </DisclosureButton>
        <DisclosureButton open={notesOpen} controls={`${uid}-notatki`} onClick={() => setNotesOpen((v) => !v)}>
          <NotebookText aria-hidden className="size-4" />
          {t.notes.toggle(noteCount)}
        </DisclosureButton>
      </div>

      {notesOpen && (
        <div id={`${uid}-notatki`} className="mt-3 rounded-md bg-sunken px-4 py-3">
          <p className="text-sm font-medium text-ink">{t.notes.title}</p>
          {notes.kind === 'loading' && (
            <p role="status" className="mt-2 flex items-center gap-2 text-sm text-ink-muted">
              <LoaderCircle aria-hidden className="size-4 animate-spin" />
              {t.notes.loading}
            </p>
          )}
          {notes.kind === 'error' && <p className="mt-2 text-sm text-danger">{t.notes.error}</p>}
          {notes.kind === 'ready' && notes.data.length === 0 && <p className="mt-2 text-sm text-ink-muted">{t.notes.empty}</p>}
          {notes.kind === 'ready' && notes.data.length > 0 && (
            <ul className="mt-2 divide-y divide-line">
              {notes.data.map((note) => (
                <li key={note.id} className="flex items-start gap-4 py-2.5">
                  <div className="flex-1">
                    <p className="text-xs text-ink-muted tabular-nums">{formatDate(note.created_at)}</p>
                    <p className="mt-0.5 text-sm text-ink">{note.text}</p>
                  </div>
                  {insertedId === note.id ? (
                    <p role="status" className="shrink-0 pt-4 text-xs font-medium text-positive">
                      {t.notes.inserted}
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => insertNote(note)}
                      aria-label={`${t.notes.insert}: notatka z ${formatDate(note.created_at)}`}
                      className="mt-3 shrink-0 rounded-md border border-line-strong bg-surface px-2.5 py-1 text-sm font-medium text-ink transition-[background-color,transform] duration-150 ease-out hover:bg-accent-soft active:scale-[0.97]"
                    >
                      {t.notes.insert}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {exampleOpen && (
        <fieldset id={`${uid}-przyklad`} className="mt-3 space-y-3">
          <legend className="mb-2 text-sm font-medium text-ink">{t.example.legend}</legend>
          {(['situation', 'action', 'result'] as const).map((field) => (
            <div key={field}>
              <label htmlFor={`${uid}-${field}`} className="mb-1 block text-sm text-ink-muted">
                {t.example[field]}
              </label>
              <textarea
                ref={field === 'situation' ? situationRef : undefined}
                id={`${uid}-${field}`}
                rows={2}
                value={star?.[field] ?? ''}
                onChange={(e) => setStar({ [field]: e.target.value })}
                className="block w-full resize-y rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-0"
              />
            </div>
          ))}
        </fieldset>
      )}
    </fieldset>
  )
}

function DisclosureButton({
  open,
  controls,
  onClick,
  children,
}: {
  open: boolean
  controls: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-accent transition-colors duration-150 hover:bg-accent-soft"
    >
      <ChevronDown aria-hidden className={`size-4 transition-transform duration-150 ease-out ${open ? 'rotate-180' : ''}`} />
      {children}
    </button>
  )
}

function ScoreHintView({
  hint,
  onRetry,
  total,
  state,
  criterion,
}: {
  hint: ScoreHint
  onRetry: () => void
  total: number
  state: FormState
  criterion: Criterion
}) {
  const h = t.hint
  const noBasis = criterion.competency.indicators.filter((i) => state.answers[i.indicator_id]?.selected_level === null).length
  const result = hint.kind === 'ready' ? hint.result : hint.kind === 'error' ? hint.result : null
  const calculating = hint.kind === 'loading' || (hint.kind === 'ready' && hint.calculating)

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h3 id="wskazowka" className="font-semibold text-ink">
          {h.title}
        </h3>
        {/* Stała wysokość wiersza: wskaźnik przeliczania nie przesuwa układu. */}
        <p className="flex h-5 items-center gap-1.5 text-sm text-ink-muted" aria-hidden={!calculating}>
          {calculating && (
            <>
              <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
              {h.calculating}
            </>
          )}
        </p>
      </div>

      <div aria-live="polite" className={`mt-2 transition-opacity duration-150 ${calculating && result ? 'opacity-60' : ''}`}>
        {hint.kind === 'empty' && <p className="text-sm text-ink-muted">{h.noAnswers}</p>}
        {hint.kind === 'loading' && <p className="text-sm text-ink-muted">{h.calculating}</p>}
        {hint.kind === 'invalid' && (
          <p className="flex items-start gap-2 text-sm text-danger">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {h.invalid(hint.message)}
          </p>
        )}
        {result && (
          <div className="flex items-baseline gap-8">
            {result.mean === null ? (
              <p className="text-sm text-ink-muted">{h.noMean}</p>
            ) : (
              <>
                <p className="text-ink">
                  <span className="font-semibold tabular-nums">{h.mean(formatOneDecimal(result.mean))}</span>
                </p>
                {result.suggested_level && (
                  <p className="text-ink">
                    {h.suggested}:{' '}
                    <span className="font-semibold tabular-nums">{t.levelPoints(result.suggested_level)}</span>{' '}
                    <span className="text-ink-muted">({texts.assessment.levels[result.suggested_level]})</span>
                  </p>
                )}
              </>
            )}
          </div>
        )}
        {result && <p className="mt-1 text-sm text-ink-muted">{h.counted(result.counted_indicators, total, noBasis)}</p>}
        {hint.kind === 'error' && (
          <div role="alert" className="mt-2 flex items-center gap-3 text-sm text-danger">
            <CircleAlert aria-hidden className="size-4 shrink-0" />
            <span>{h.error}</span>
            <Button variant="secondary" onClick={onRetry} className="py-1 text-sm">
              <RotateCcw aria-hidden className="size-3.5" />
              {texts.common.retry}
            </Button>
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-ink-muted">{h.disclaimer}</p>
    </div>
  )
}

function DecisionField({
  competencyId,
  value,
  note,
  suggested,
  onChange,
}: {
  competencyId: string
  value: Level | null
  note: string
  suggested: Level | null
  onChange: (patch: { selected_level?: Level; decision_note?: string }) => void
}) {
  const d = t.decision
  const uid = useId()
  const differs = value !== null && suggested !== null && value !== suggested

  return (
    <fieldset className="mt-6 rounded-md border-2 border-ink/80 bg-surface px-5 pt-4 pb-5" aria-describedby={`${uid}-wymagane`}>
      <legend className="px-1 font-semibold text-ink">{d.legend}</legend>
      <p id={`${uid}-wymagane`} className="-mt-1 text-sm text-ink-muted">
        {d.required}
      </p>
      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {LEVELS.map((l) => {
          const checked = value === l
          return (
            <label key={l} className="block">
              <input
                type="radio"
                name={`decyzja-${competencyId}`}
                value={l}
                checked={checked}
                onChange={() => onChange({ selected_level: l })}
                className="peer sr-only"
              />
              <span
                className={`${optionClass} py-3 ${
                  checked
                    ? 'border-ink bg-ink text-surface'
                    : 'border-line-strong bg-surface text-ink hover:border-ink hover:bg-sunken'
                }`}
              >
                <span className="text-lg font-semibold tabular-nums">{t.levelPoints(l)}</span>
                <span className={`text-xs leading-tight ${checked ? 'text-surface/85' : 'text-ink-muted'}`}>
                  {texts.assessment.levels[l]}
                </span>
                {suggested === l && (
                  <span className={`mt-1 text-[0.6875rem] font-medium ${checked ? 'text-surface' : 'text-accent'}`}>
                    {t.hint.suggested.toLowerCase()}
                  </span>
                )}
              </span>
            </label>
          )
        })}
      </div>

      {differs && (
        <div className="mt-4">
          <p className="text-sm text-ink">{d.differs(value, suggested)}</p>
          <label htmlFor={`${uid}-uwaga`} className="mt-3 mb-1 block text-sm font-medium text-ink">
            {d.note}
          </label>
          <textarea
            id={`${uid}-uwaga`}
            rows={2}
            value={note}
            placeholder={d.notePlaceholder}
            onChange={(e) => onChange({ decision_note: e.target.value })}
            className="block w-full resize-y rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-0"
          />
        </div>
      )}
    </fieldset>
  )
}
