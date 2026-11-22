import type {
  AssessmentDraftInput,
  AssessmentForm,
  Competency,
  CriterionDecision,
  IndicatorAnswer,
  Level,
  StarNote,
} from '../../types'

export const LEVELS: Level[] = [1, 3, 5, 7, 9]

export const SETUP_STEP = 'konfiguracja'
export const SUMMARY_STEP = 'podsumowanie'
export const criterionStep = (competency_id: string) => `kryterium-${competency_id}`

/** Lokalny stan formularza; do backendu idzie jako AssessmentDraftInput. */
export interface FormState {
  form: AssessmentForm
  additional: string[]
  /**
   * Po indicator_id. selected_level: undefined = bez odpowiedzi (może już mieć przykład),
   * null = brak podstaw do oceny. Do backendu idą tylko wskaźniki z odpowiedzią.
   */
  answers: Record<string, LocalAnswer>
  /** Po competency_id. */
  decisions: Record<string, { selected_level: Level | null; decision_note: string }>
  justification: string
  step: string
}

export interface LocalAnswer {
  competency_id: string
  indicator_id: string
  selected_level: Level | null | undefined
  star_note: StarNote | null
}

export interface Criterion {
  competency: Competency
  mandatory: boolean
}

export function toDraftInput(state: FormState, criteria: Criterion[]): AssessmentDraftInput {
  const ids = new Set(criteria.map((c) => c.competency.competency_id))
  return {
    form: state.form,
    additional_competency_ids: state.additional,
    // Do zapisu trafiają tylko odpowiedzi kryteriów, które są w ocenie.
    answers: Object.values(state.answers).flatMap((a) =>
      ids.has(a.competency_id) && a.selected_level !== undefined
        ? [{ ...a, selected_level: a.selected_level, star_note: hasStarContent(a.star_note) ? a.star_note : null }]
        : [],
    ),
    decisions: criteria.map<CriterionDecision>((c) => ({
      competency_id: c.competency.competency_id,
      is_mandatory: c.mandatory,
      selected_level: state.decisions[c.competency.competency_id]?.selected_level ?? null,
      decision_note: state.decisions[c.competency.competency_id]?.decision_note ?? '',
    })),
    justification_draft: state.justification,
    last_step: state.step,
  }
}

/** Odpowiedzi wskaźników kryterium w kształcie kontraktu (bez wskaźników bez odpowiedzi). */
export function answersFor(state: FormState, competency: Competency): IndicatorAnswer[] {
  return competency.indicators.flatMap((i) => {
    const a = state.answers[i.indicator_id]
    return a && a.selected_level !== undefined ? [{ ...a, selected_level: a.selected_level }] : []
  })
}

/**
 * Walidacja formularza (nie punktacja): wszystkie wskaźniki mają odpowiedź
 * i każda to „brak podstaw do oceny" → nie ma podstawy do oceny kryterium.
 */
export function isBlocked(state: FormState, competency: Competency): boolean {
  const answers = answersFor(state, competency)
  return answers.length === competency.indicators.length && answers.every((a) => a.selected_level === null)
}

export type CriterionStatus = 'todo' | 'progress' | 'blocked' | 'decided'

export function criterionStatus(state: FormState, competency: Competency): CriterionStatus {
  if (isBlocked(state, competency)) return 'blocked'
  if (state.decisions[competency.competency_id]?.selected_level) return 'decided'
  return answersFor(state, competency).length > 0 ? 'progress' : 'todo'
}

export function hasStarContent(note: StarNote | null | undefined): boolean {
  return !!note && (note.situation.trim() || note.action.trim() || note.result.trim()) !== ''
}

export const emptyStar = (): StarNote => ({ situation: '', action: '', result: '' })

/** Liczba z jednym miejscem po przecinku, po polsku (formatowanie wyniku z backendu). */
export function formatOneDecimal(value: number): string {
  return value.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

export function formatTwoDecimals(value: number): string {
  return value.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
