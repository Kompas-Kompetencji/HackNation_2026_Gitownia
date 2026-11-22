import type { AdditionalCriterion, AssessmentForm, AssessmentKind, ContractType, OspAnalysis } from '../../types'

export interface PersonalData {
  first_name: string
  last_name: string
  hire_date: string
  contract_type: ContractType | ''
  /** Wymagana tylko dla umowy na czas określony. */
  contract_end_date: string
  /** Tylko zastępstwo: dzień porozumienia o pierwszej ocenie. */
  first_eval_agreement_date: string
  assessment_kind: AssessmentKind | ''
}

/** Krok 2 ścieżki pierwszej oceny: opcjonalny plik do archiwum, bez analizy. */
export interface FirstDocumentData {
  file: File | null
  position_title: string
}

export const emptyFirstDocument: FirstDocumentData = { file: null, position_title: '' }

export function needsContractEnd(contract: ContractType | ''): boolean {
  return contract === 'fixed_term_first' || contract === 'replacement'
}

/**
 * Rodzaje oceny dopuszczalne dla umowy (ustawa o służbie cywilnej): pierwsza ocena – pierwsza umowa
 * na czas określony (art. 35 ust. 3) albo zastępstwo za porozumieniem (art. 37 ust. 2); ocena okresowa –
 * tylko czas nieokreślony i mianowanie (art. 81 ust. 1).
 */
export function allowedPaths(contract: ContractType | ''): AssessmentKind[] {
  if (contract === 'fixed_term_first' || contract === 'replacement') return ['first']
  if (contract === 'indefinite' || contract === 'appointment') return ['periodic']
  return ['first', 'periodic']
}

/** Najwcześniejszy dopuszczalny koniec umowy przy zastępstwie: porozumienie + 9 miesięcy (8 + miesiąc zapasu). */
export function minReplacementEnd(agreementIso: string): string {
  const [y, m, d] = agreementIso.split('-').map(Number)
  const target = new Date(Date.UTC(y, m - 1 + 9, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d, lastDay))
  return target.toISOString().slice(0, 10)
}

/** Wynik analizy w postaci edytowalnej przez przełożonego. */
export interface EditableAnalysis {
  position_title: string
  organizational_unit: string
  subordinates_count: string
  form: AssessmentForm
  /**
   * Wybrane kryteria dodatkowe: od 0 do 3 z wykazu 14 kompetencji, bez obowiązkowych dla arkusza
   * (§ 5 ust. 2 rozporządzenia z 2016 r.). Na start podpowiedź z analizy opisu stanowiska.
   */
  criteria: AdditionalCriterion[]
}

/** Najwięcej kryteriów dodatkowych w ocenie okresowej (§ 5 ust. 2 rozporządzenia z 2016 r.). */
export const MAX_ADDITIONAL_CRITERIA = 3

export interface DocumentData {
  file: File | null
  /** Oryginalny wynik analyzeOsp (do uzasadnień i propozycji arkusza). */
  analysis: OspAnalysis | null
  edited: EditableAnalysis | null
}

export const emptyPersonal: PersonalData = {
  first_name: '',
  last_name: '',
  hire_date: '',
  contract_type: '',
  contract_end_date: '',
  first_eval_agreement_date: '',
  assessment_kind: '',
}
export const emptyDocument: DocumentData = { file: null, analysis: null, edited: null }

export function toEditable(a: OspAnalysis): EditableAnalysis {
  return {
    position_title: a.position_title,
    organizational_unit: a.organizational_unit ?? '',
    subordinates_count: a.subordinates_count === null ? '' : String(a.subordinates_count),
    form: a.suggested_form,
    criteria: a.additional_criteria.slice(0, MAX_ADDITIONAL_CRITERIA),
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
    additional_criteria: edited.criteria,
  }
}
