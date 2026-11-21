import type { IndicatorAnswer, Level, ScoreResult } from '../../types'

/**
 * MAKIETA odpowiedzi backendu dla calculateScore. Prawdziwe zasady punktacji
 * (średnie, zaokrąglanie, wynik) są wyłącznie w backendzie; ta funkcja tylko
 * zwraca wiarygodnie wyglądające dane przykładowe do budowy ekranów.
 */
const LEVELS: Level[] = [1, 3, 5, 7, 9]

function nearestLevel(value: number): Level {
  return LEVELS.reduce((best, l) => (Math.abs(l - value) < Math.abs(best - value) ? l : best))
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  const sum = values.reduce((a, b) => a + b, 0)
  return Math.round((sum / values.length) * 100) / 100
}

export function mockCalculateScore(answers: IndicatorAnswer[]): ScoreResult {
  const byCompetency = new Map<string, number[]>()
  for (const a of answers) {
    const list = byCompetency.get(a.competency_id) ?? []
    if (a.selected_level !== null) list.push(a.selected_level)
    byCompetency.set(a.competency_id, list)
  }

  const competency_scores = [...byCompetency.entries()].map(([competency_id, levels]) => {
    const average = mean(levels)
    return { competency_id, average, suggested_level: average === null ? null : nearestLevel(average) }
  })

  const average = mean(competency_scores.flatMap((c) => (c.average === null ? [] : [c.average])))

  return {
    average,
    suggested_level: average === null ? null : nearestLevel(average),
    result: average === null ? null : average >= 3 ? 'positive' : 'negative',
    competency_scores,
    justification_draft: null,
  }
}
