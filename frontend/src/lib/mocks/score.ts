import { ApiError } from '../apiError'
import type { AssessmentEvaluation, EvaluationInput, IndicatorAnswer, Level, ScoreResult } from '../../types'

/**
 * MAKIETY odpowiedzi backendu. Prawdziwe zasady punktacji (średnie, zaokrąglanie, wynik)
 * są wyłącznie w backendzie; te funkcje naśladują je tylko po to, żeby dało się zbudować ekrany.
 * Reguły wyniku przepisane z backend/app/core/scoring_engine.py (evaluate_periodic).
 */
const LEVELS: Level[] = [1, 3, 5, 7, 9]

/** Tekst w polu przykładu, który w makiecie wywołuje błąd obliczeń (do sprawdzenia stanu błędu). */
export const MOCK_SCORE_FAILURE_TRIGGER = '#błąd'

function nearestLevel(value: number): Level {
  // Remis rozstrzygany w górę (4 → 5, 6 → 7), jak ROUND_HALF_UP w backendzie.
  return LEVELS.reduce((best, l) => (Math.abs(l - value) <= Math.abs(best - value) ? l : best))
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function mockCalculateScore(answers: IndicatorAnswer[]): ScoreResult {
  if (answers.length === 0) throw new ApiError(422, 'Brak odpowiedzi do obliczenia średniej.')
  if (answers.some((a) => a.selected_level !== null && !LEVELS.includes(a.selected_level))) {
    throw new ApiError(422, 'Niedozwolony poziom wskaźnika. Dozwolone poziomy: 1, 3, 5, 7, 9.')
  }
  if (answers.some((a) => a.star_note && Object.values(a.star_note).some((v) => v.includes(MOCK_SCORE_FAILURE_TRIGGER)))) {
    throw new Error('Makieta: błąd połączenia z usługą obliczeń')
  }
  const levels = answers.flatMap((a) => (a.selected_level === null ? [] : [a.selected_level]))
  if (levels.length === 0) return { mean: null, suggested_level: null, counted_indicators: 0 }
  const mean = round2(levels.reduce((s, l) => s + l, 0) / levels.length)
  return { mean, suggested_level: nearestLevel(mean), counted_indicators: levels.length }
}

const OVERALL: Array<[number, string]> = [
  [2, 'znacznie poniżej oczekiwań'],
  [4, 'poniżej oczekiwań'],
  [6, 'na poziomie oczekiwań'],
  [8, 'powyżej oczekiwań'],
  [9, 'znacznie powyżej oczekiwań'],
]

const fmt = (n: number) => n.toFixed(2).replace('.', ',')

/** names: nazwy kryteriów po competency_id (backend zna je z modelu). */
export function mockEvaluate(input: EvaluationInput, names: Record<string, string>): AssessmentEvaluation {
  const errors: string[] = []
  if (input.decisions.length === 0) errors.push('Lista ocen cząstkowych jest pusta – nie można obliczyć wyniku oceny okresowej.')
  const scores = input.decisions.map((d) => d.selected_level)
  const mean = scores.length ? round2(scores.reduce((s, l) => s + l, 0) / scores.length) : 0
  const overall_level = scores.length ? (OVERALL.find(([max]) => mean <= max)?.[1] ?? null) : null
  const critical = input.decisions.filter((d) => d.selected_level === 1).map((d) => names[d.competency_id] ?? d.competency_id)
  const positive = scores.length > 0 && mean > 4 && critical.length === 0

  const reasons: string[] = []
  if (positive) {
    reasons.push(
      `Średnia ${fmt(mean)} pkt (ogólny poziom: ${overall_level}) przekracza 4,00 pkt i żadne kryterium nie ma oceny 1 pkt (§ 11 ust. 1 pkt 3 rozporządzenia z 2016 r.).`,
    )
  } else {
    if (mean <= 4) reasons.push(`Średnia ${fmt(mean)} pkt nie przekracza progu 4,00 pkt (§ 11 ust. 1 pkt 4 rozporządzenia z 2016 r.).`)
    if (critical.length)
      reasons.push(
        `Ocena 1 pkt (znacznie poniżej oczekiwań) w kryteriach: ${critical.join(', ')} (§ 11 ust. 1 pkt 4 rozporządzenia z 2016 r.).`,
      )
  }

  const development_criteria = input.decisions
    .filter((d) => d.selected_level <= 3)
    .map((d) => names[d.competency_id] ?? d.competency_id)

  return {
    mean,
    overall_level,
    result: positive ? 'positive' : 'negative',
    reasons,
    justification_required: !positive,
    development_criteria,
    errors,
    warnings: development_criteria.length
      ? [`We wnioskach rozwojowych uwzględnij kryteria ocenione poniżej oczekiwań: ${development_criteria.join(', ')}.`]
      : [],
  }
}
