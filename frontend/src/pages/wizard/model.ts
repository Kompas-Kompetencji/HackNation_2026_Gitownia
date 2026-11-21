import type { AssessmentForm, ContractType, OspAnalysis } from '../../types'

export interface PersonalData {
  first_name: string
  last_name: string
  hire_date: string
  contract_type: ContractType | ''
}

/** Wynik analizy w postaci edytowalnej przez przełożonego. */
export interface EditableAnalysis {
  position_title: string
  organizational_unit: string
  subordinates_count: string
  form: AssessmentForm
  criteria: string[]
}

export interface DocumentData {
  file: File | null
  /** Oryginalny wynik analyzeOsp (do uzasadnień i propozycji arkusza). */
  analysis: OspAnalysis | null
  edited: EditableAnalysis | null
}

export const emptyPersonal: PersonalData = { first_name: '', last_name: '', hire_date: '', contract_type: '' }
export const emptyDocument: DocumentData = { file: null, analysis: null, edited: null }

export function toEditable(a: OspAnalysis): EditableAnalysis {
  return {
    position_title: a.position_title,
    organizational_unit: a.organizational_unit ?? '',
    subordinates_count: a.subordinates_count === null ? '' : String(a.subordinates_count),
    form: a.suggested_form,
    criteria: a.additional_criteria.map((c) => c.name),
  }
}

/** Analiza po poprawkach przełożonego, w kształcie kontraktu OspAnalysis. */
export function toConfirmed(original: OspAnalysis, edited: EditableAnalysis): OspAnalysis {
  const subordinates = Number(edited.subordinates_count)
  return {
    ...original,
    position_title: edited.position_title.trim(),
    organizational_unit: edited.organizational_unit.trim() || null,
    subordinates_count: subordinates,
    has_management_duties: subordinates > 0,
    suggested_form: edited.form,
    additional_criteria: original.additional_criteria.map((c, i) => ({ ...c, name: edited.criteria[i].trim() })),
  }
}
