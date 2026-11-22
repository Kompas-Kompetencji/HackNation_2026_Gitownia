import { forwardRef, useId, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, CircleAlert, CircleSlash, LoaderCircle, NotebookText, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui'
import { formatDate } from '../../lib/format'
import { texts } from '../../lib/texts'
import type { BehavioralIndicator, Level, Note, StarNote } from '../../types'
import type { SectionState } from '../employee/sectionState'
import {
  emptyStar,
  FIRST_LEVELS,
  formatOneDecimal,
  hasStarContent,
  LEVELS,
  toFirstScaleHint,
  type Criterion,
  type AnyFormState,
  type LocalAnswer,
} from './model'
import type { ScoreHint } from './useScoreHint'

const t = texts.assessment.criterion
const tf = texts.firstAssessment.criterion

/** periodic = ocena okresowa (skala 1–9); first = pierwsza ocena (elementy, decyzja 3/5/7). */
export type CriterionVariant = 'periodic' | 'first'

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
  variant = 'periodic',
}: {
  variant?: CriterionVariant
  criterion: Criterion
  position: number
  total: number
  state: AnyFormState
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
  const first = variant === 'first'
  const rawSuggested = hint.kind === 'ready' ? hint.result.suggested_level : null
  // Pierwsza ocena: wskazówka 1–9 z backendu przeliczona na skalę 3/5/7 (tylko podpowiedź).
  const suggested = first ? toFirstScaleHint(rawSuggested) : rawSuggested

  return (
    <div>
      <p className="text-sm font-medium text-ink-muted">
        <span className="sr-only">{texts.assessment.progress.criterion(position, total)}, </span>
        {first ? tf.label : mandatory ? t.mandatory : t.additional}
      </p>
      <h2 tabIndex={-1} data-step-heading className="mt-1 font-serif text-display font-semibold text-ink focus:outline-none">
        {competency.name}
      </h2>
      {competency.definition && <p className="mt-2 text-ink">{competency.definition}</p>}
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-muted">{first ? tf.lead : t.lead}</p>
      <p className="mt-2 text-sm text-ink-muted tabular-nums">{t.answered(answered, competency.indicators.length)}</p>

      <ol className="mt-6 space-y-5">
        {competency.indicators.map((indicator, i) => (
          <li key={indicator.indicator_id}>
            <IndicatorCard
              indicator={indicator}
              position={i + 1}
              total={competency.indicators.length}
              answer={state.answers[indicator.indicator_id]}
              noBasisLocked={isLastAssessable(state, competency.indicators, indicator)}
              notes={notes}
              onAnswer={(patch) => onAnswer(indicator, patch)}
              onFocus={() => onActiveIndicator(indicator)}
              variant={variant}
            />
          </li>
        ))}
      </ol>

      {blocked && <BlockedAlert mandatory={mandatory} onRemove={onRemove} message={first ? tf.blocked : undefined} />}

      <section aria-labelledby="wskazowka" className="mt-8 border-t border-line pt-6">
        <ScoreHintView
          hint={hint}
          onRetry={onRetryHint}
          total={competency.indicators.length}
          state={state}
          criterion={criterion}
          variant={variant}
        />
      </section>

      <DecisionField
        competencyId={competency.competency_id}
        value={decision?.selected_level ?? null}
        note={decision?.decision_note ?? ''}
        suggested={suggested}
        hasEvidence={competency.indicators.some((i) => state.answers[i.indicator_id]?.selected_level != null)}
        onChange={onDecision}
        levels={first ? FIRST_LEVELS : LEVELS}
        legend={first ? tf.decisionLegend : undefined}
      />
    </div>
  )
}

export const BlockedAlert = forwardRef<HTMLDivElement, { mandatory: boolean; onRemove: () => void; message?: string }>(function BlockedAlert(
  { mandatory, onRemove, message },
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
        <p className="font-medium">{message ?? (mandatory ? t.blocked.mandatory : t.blocked.additional)}</p>
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

/**
 * Model kompetencji: "brak podstaw do oceny" odnotowuje się dla pojedynczego wskaźnika, ale kryterium
 * otrzymuje ocenę cząstkową, więc co najmniej jeden jego wskaźnik musi zostać oceniony.
 * true = to ostatni wskaźnik kryterium, który nie ma "brak podstaw" – opcja jest dla niego niedostępna.
 */
function isLastAssessable(state: AnyFormState, indicators: BehavioralIndicator[], indicator: BehavioralIndicator): boolean {
  if (state.answers[indicator.indicator_id]?.selected_level === null) return false
  const others = indicators.filter((i) => i.indicator_id !== indicator.indicator_id)
  return others.length === 0 || others.every((i) => state.answers[i.indicator_id]?.selected_level === null)
}

/**
 * Pierwsza ocena: pięć opisów zachowań z modelu kompetencji pogrupowanych pod trzema poziomami arkusza
 * (3, 5, 7 punktów), bez liczb przy opisach. Zapisywane wartości odpowiedzi pozostają bez zmian (1–9).
 */
function FirstScaleOptions({
  indicator,
  name,
  uid,
  level,
  onPick,
}: {
  indicator: BehavioralIndicator
  name: string
  uid: string
  level: Level | null | undefined
  onPick: (l: Level) => void
}) {
  return (
    <div className="grid grid-cols-[2fr_1.15fr_2fr] gap-3">
      {FIRST_SCALE_GROUPS.map((group) => (
        <div key={group.points} role="group" aria-labelledby={`${uid}-grupa-${group.points}`}>
          <p id={`${uid}-grupa-${group.points}`} className="mb-1.5 flex min-h-8 items-end text-xs leading-tight font-semibold text-ink-muted">
            {tf.scaleGroups[group.points]}
          </p>
          <div className={`grid gap-1.5 ${group.levels.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {group.levels.map((l) => {
              const checked = level === l
              return (
                <label key={l} className="block h-full">
                  <input
                    type="radio"
                    name={name}
                    value={l}
                    checked={checked}
                    onChange={() => onPick(l)}
                    aria-describedby={indicator.level_descriptions?.[l] ? `${uid}-opis-${l}` : undefined}
                    className="peer sr-only"
                  />
                  <span
                    className={`${optionClass} justify-center py-2.5 ${
                      checked
                        ? 'border-accent bg-accent text-accent-ink'
                        : 'border-line-strong bg-surface text-ink hover:border-accent hover:bg-accent-soft'
                    }`}
                  >
                    <span className="text-sm leading-tight font-medium first-letter:uppercase">{texts.assessment.levels[l]}</span>
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
        </div>
      ))}
    </div>
  )
}

/** Grupy opisów zachowań zgodne z arkuszem pierwszej oceny. */
const FIRST_SCALE_GROUPS: { points: 3 | 5 | 7; levels: Level[] }[] = [
  { points: 3, levels: [1, 3] },
  { points: 5, levels: [5] },
  { points: 7, levels: [7, 9] },
]

function IndicatorCard({
  indicator,
  position,
  total,
  answer,
  noBasisLocked,
  notes,
  onAnswer,
  onFocus,
  variant,
}: {
  indicator: BehavioralIndicator
  position: number
  total: number
  answer: LocalAnswer | undefined
  noBasisLocked: boolean
  notes: SectionState<Note[]>
  onAnswer: (patch: Partial<Pick<LocalAnswer, 'selected_level' | 'star_note'>>) => void
  onFocus: () => void
  variant: CriterionVariant
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
        {variant === 'first' ? (
          <FirstScaleOptions indicator={indicator} name={name} uid={uid} level={level} onPick={(l) => onAnswer({ selected_level: l })} />
        ) : (
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
        )}
        <label className={`mt-1.5 inline-block ${noBasisLocked ? 'cursor-not-allowed' : ''}`}>
          <input
            type="radio"
            name={name}
            value="brak"
            checked={level === null}
            disabled={noBasisLocked}
            aria-describedby={noBasisLocked ? `${uid}-brak-blokada` : undefined}
            onChange={() => onAnswer({ selected_level: null })}
            className="peer sr-only"
          />
          <span
            className={`${optionClass} flex-row gap-2 px-3 ${
              level === null
                ? 'border-ink bg-sunken text-ink'
                : noBasisLocked
                  ? 'pointer-events-none border-dashed border-line bg-surface text-ink-muted opacity-50'
                  : 'border-dashed border-line-strong bg-surface text-ink-muted hover:border-ink hover:text-ink'
            }`}
          >
            <CircleSlash aria-hidden className="size-4" />
            <span className="text-sm font-medium">{t.noBasis}</span>
            <span className="text-xs">({t.noBasisHint})</span>
          </span>
        </label>
      </div>

      {noBasisLocked && (
        <p id={`${uid}-brak-blokada`} className="mt-1.5 text-xs text-ink-muted">
          {t.noBasisLocked}
        </p>
      )}

      <p className="mt-3 min-h-10 text-sm leading-snug text-ink-muted">
        {level === undefined && t.pickLevelHint}
        {level === null && t.noBasisSelected}
        {level != null && indicator.level_descriptions?.[level] && (
          <>
            <span className="font-medium text-ink">
              {variant === 'first' ? tf.levelDescription(texts.assessment.levels[level as Level]) : t.levelDescription(level)}:{' '}
            </span>
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
  variant,
}: {
  hint: ScoreHint
  onRetry: () => void
  total: number
  state: AnyFormState
  criterion: Criterion
  variant: CriterionVariant
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
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-1">
            {result.mean === null ? (
              <p className="text-sm text-ink-muted">{h.noMean}</p>
            ) : (
              <>
                {/* Pierwsza ocena: bez średniej w skali 1–9, przy wskaźnikach nie pokazujemy liczb. */}
                {variant !== 'first' && (
                  <p className="shrink-0 text-ink">
                    <span className="font-semibold tabular-nums">{h.mean(formatOneDecimal(result.mean))}</span>
                  </p>
                )}
                {variant === 'first' && result.suggested_level && (
                  <p className="text-ink">
                    {h.suggested}:{' '}
                    <span className="font-semibold tabular-nums">{tf.hintScale(toFirstScaleHint(result.suggested_level)!)}</span>
                  </p>
                )}
                {variant !== 'first' && result.suggested_level && (
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
      <p className="mt-2 text-xs text-ink-muted">{variant === 'first' ? tf.hintDisclaimer : h.disclaimer}</p>
    </div>
  )
}

function DecisionField({
  competencyId,
  value,
  note,
  suggested,
  hasEvidence,
  onChange,
  levels,
  legend,
}: {
  levels: Level[]
  legend?: string
  competencyId: string
  value: Level | null
  note: string
  suggested: Level | null
  hasEvidence: boolean
  onChange: (patch: { selected_level?: Level; decision_note?: string }) => void
}) {
  const d = t.decision
  const uid = useId()
  const differs = value !== null && suggested !== null && value !== suggested

  return (
    <fieldset className="mt-6 rounded-md border-2 border-ink/80 bg-surface px-5 pt-4 pb-5" aria-describedby={`${uid}-wymagane`}>
      <legend className="px-1 font-semibold text-ink">{legend ?? d.legend}</legend>
      <p id={`${uid}-wymagane`} className="-mt-1 text-sm text-ink-muted">
        {d.required}
      </p>
      <div className={`mt-3 grid gap-1.5 ${levels.length === 3 ? 'grid-cols-3' : 'grid-cols-5'}`}>
        {levels.map((l) => {
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

      {value !== null && !hasEvidence && (
        <p role="status" className="mt-4 flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {d.noEvidence}
        </p>
      )}

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
