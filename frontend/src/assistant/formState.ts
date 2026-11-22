import type { AssessmentDetail, Competency, CompetencyModel, EmployeeForm, StarNote } from '../types'
import type { AnyFormState, Criterion } from '../pages/assessment/model'

/**
 * Stan arkusza przekazywany asystentowi rozmowy (kontrakt FormSchemaState backendu).
 * Minimalizacja danych: bez imienia, nazwiska i identyfikatorów pracownika – tylko stanowisko,
 * poziomy kryteriów i opisy zachowań (przykłady STAR backend dodatkowo czyści z danych osobowych).
 */
export interface AssistantFormState {
  form_type: 'pierwsza_ocena' | 'okresowa_B' | 'okresowa_C'
  employee_context: { stanowisko: string; komorka_organizacyjna: string }
  scores: Record<string, number | null>
  additional_criteria: string[]
  star_notes: Record<string, string>
  egzamin_sluzba_przygotowawcza?: 'TAK' | 'NIE' | 'NIE_DOTYCZY' | null
  sprawozdanie_w_terminie?: boolean | null
}

const FORM_TYPE: Record<EmployeeForm, AssistantFormState['form_type']> = {
  first: 'pierwsza_ocena',
  B: 'okresowa_B',
  C: 'okresowa_C',
}

const star = (n: StarNote | null) =>
  n ? [n.situation && `S: ${n.situation}`, n.action && `D: ${n.action}`, n.result && `R: ${n.result}`].filter(Boolean).join(' ') : ''

/** Opis zachowania wybranego przy wskaźniku (z modelu kompetencji), żeby asystent wiedział, co zaobserwowano. */
function chosenBehaviours(state: AnyFormState, c: Competency): string[] {
  const out: string[] = []
  for (const ind of c.indicators) {
    const a = state.answers[ind.indicator_id]
    if (!a || a.selected_level === undefined) continue
    if (a.selected_level === null) {
      out.push(`${ind.description}: brak podstaw do oceny`)
      continue
    }
    const desc = ind.level_descriptions?.[a.selected_level]
    out.push(`${ind.description}: poziom ${a.selected_level}${desc ? ` („${desc}”)` : ''}${star(a.star_note) ? ` – przykład: ${star(a.star_note)}` : ''}`)
  }
  return out
}

export function toAssistantFormState(
  state: AnyFormState,
  criteria: Criterion[],
  position: { title: string; unit: string },
): AssistantFormState {
  const scores: Record<string, number | null> = {}
  const notes: Record<string, string> = {}
  for (const { competency: c } of criteria) {
    const decision = state.decisions[c.competency_id]
    scores[c.name] = decision?.selected_level ?? null
    const parts = chosenBehaviours(state, c)
    if (decision?.decision_note) parts.push(`Uwaga przełożonego: ${decision.decision_note}`)
    if (parts.length) notes[c.name] = parts.join('; ').slice(0, 1500)
  }
  const first = state.first
  return {
    form_type: FORM_TYPE[state.form],
    employee_context: { stanowisko: position.title || 'specjalista', komorka_organizacyjna: position.unit || '' },
    scores,
    additional_criteria: criteria.filter((c) => !c.mandatory).map((c) => c.competency.name),
    star_notes: notes,
    ...(first
      ? {
          egzamin_sluzba_przygotowawcza:
            first.exam_status === 'passed' ? 'TAK' : first.exam_status === 'failed' ? 'NIE' : first.exam_status ? 'NIE_DOTYCZY' : null,
          sprawozdanie_w_terminie: first.report_on_time,
        }
      : {}),
  }
}

/** Stan arkusza z zapisanej oceny (ekran rozmowy oceniającej nie ma lokalnego stanu formularza). */
export function formStateFromDetail(
  detail: AssessmentDetail,
  model: CompetencyModel,
  position: { title: string; unit: string },
): { state: AnyFormState; criteria: Criterion[]; formState: AssistantFormState } {
  const byId = new Map(model.competencies.map((c) => [c.competency_id, c]))
  const criteria: Criterion[] = detail.decisions.flatMap((d) => {
    const competency = byId.get(d.competency_id)
    return competency ? [{ competency, mandatory: d.is_mandatory }] : []
  })
  const state: AnyFormState = {
    form: detail.form,
    additional: detail.additional_competency_ids ?? [],
    answers: Object.fromEntries(detail.answers.map((a) => [a.indicator_id, { ...a }])),
    decisions: Object.fromEntries(
      detail.decisions.map((d) => [d.competency_id, { selected_level: d.selected_level, decision_note: d.decision_note }]),
    ),
    justification: detail.justification_draft,
    conclusions: detail.development_conclusions ?? '',
    step: detail.last_step ?? '',
    ...(detail.form === 'first'
      ? {
          first: {
            exam_status: detail.exam_status ?? null,
            report_on_time: detail.report_on_time ?? null,
            initial_interview_date: detail.initial_interview_date ?? null,
            evaluation_interview_date: detail.evaluation_interview_date ?? null,
          },
        }
      : {}),
  }
  return { state, criteria, formState: toAssistantFormState(state, criteria, position) }
}
