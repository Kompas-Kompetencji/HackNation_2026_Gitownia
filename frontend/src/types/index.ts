/**
 * Kontrakt danych frontendu (Kompas Kompetencji).
 *
 * Nazwy pól w snake_case, zgodnie z backendem (Python, FastAPI + Pydantic).
 *
 * ZAŁOŻENIA (backend w repozytorium nie zawiera jeszcze kodu, gałąź main ma tylko
 * puste wskaźniki katalogów backend/ i frontend/; do potwierdzenia z zespołem):
 *  1. Poziomy oceny to liczby 1 | 3 | 5 | 7 | 9. „Brak podstaw do oceny" = selected_level: null.
 *  2. Identyfikatory są tekstowe (string), np. "K01", "K01-W2", "emp-001".
 *  3. Daty przesyłane jako tekst ISO 8601: "2026-11-21" (data) lub "2026-11-21T10:15:00Z" (data i czas).
 *  4. star_note to obiekt z trzema polami (sytuacja, działanie, rezultat). Jeśli backend
 *     przechowuje go jako jeden tekst, wystarczy zmienić typ StarNote na string.
 *  5. analyzeOsp zwraca dokładnie trzy kryteria dodatkowe; formularz to "B" albo "C".
 *  6. askAiAssistant zwraca status "answered" albo "no_data"; przy "no_data" lista źródeł jest pusta.
 *  7. calculateScore zwraca średnią i sugerowany poziom; wynik (pozytywny/negatywny)
 *     wylicza backend. Frontend nie liczy niczego sam.
 *  8. Typy z sekcji „TYLKO FRONTEND" (pracownicy, notatki, opisy stanowiska, lista ocen,
 *     użytkownicy) to propozycja: backend ich jeszcze nie ma.
 */

/* ------------------------------------------------------------------ */
/* Uzgodnione z backendem                                              */
/* ------------------------------------------------------------------ */

/** Poziom w skali oceny. */
export type Level = 1 | 3 | 5 | 7 | 9

/** Wybrany poziom; null = brak podstaw do oceny (do potwierdzenia z backendem). */
export type SelectedLevel = Level | null

/** Arkusz oceny okresowej sugerowany na podstawie opisu stanowiska pracy. */
export type AssessmentForm = 'B' | 'C'

export interface BehavioralIndicator {
  indicator_id: string
  competency_id: string
  /** Treść wskaźnika behawioralnego. */
  description: string
  /** Opisy zachowań dla poziomów skali (jeśli backend je udostępnia). */
  level_descriptions?: Partial<Record<Level, string>>
}

export interface Competency {
  competency_id: string
  name: string
  definition: string
  /** Na których arkuszach występuje kompetencja. */
  forms: AssessmentForm[]
  indicators: BehavioralIndicator[]
}

/** Odpowiedź getCompetencies(): model czternastu kompetencji. */
export interface CompetencyModel {
  version: string
  competencies: Competency[]
}

export interface AdditionalCriterion {
  criterion_id: string
  name: string
  /** Dlaczego kryterium zostało zasugerowane (fragment opisu stanowiska). */
  rationale: string
}

/** Odpowiedź analyzeOsp(file). OSP = opis stanowiska pracy. */
export interface OspAnalysis {
  filename: string
  position_title: string
  organizational_unit: string | null
  /** Czy stanowisko obejmuje kierowanie zespołem (wpływa na wybór arkusza). */
  has_management_duties: boolean
  suggested_form: AssessmentForm
  additional_criteria: AdditionalCriterion[]
}

/** Przykład zachowania: sytuacja, działanie, rezultat. */
export interface StarNote {
  situation: string
  action: string
  result: string
}

/** Odpowiedź przełożonego dla jednego wskaźnika. Wejście calculateScore(answers). */
export interface IndicatorAnswer {
  competency_id: string
  indicator_id: string
  selected_level: SelectedLevel
  star_note: StarNote | null
}

export type AssessmentResult = 'positive' | 'negative'

export interface CompetencyScore {
  competency_id: string
  average: number | null
  suggested_level: Level | null
}

/** Odpowiedź calculateScore(answers). */
export interface ScoreResult {
  average: number | null
  suggested_level: Level | null
  result: AssessmentResult | null
  competency_scores: CompetencyScore[]
  justification_draft: string | null
}

/** "formal" = asystent formalny, "interview" = asystent rozmowy. */
export type AssistantMode = 'formal' | 'interview'

export interface AssistantSource {
  document_title: string
  /** Wskazanie miejsca w dokumencie, np. "§ 4 ust. 2". */
  location: string
  excerpt: string
}

/** Odpowiedź askAiAssistant(question, mode). */
export interface AssistantAnswer {
  mode: AssistantMode
  status: 'answered' | 'no_data'
  answer: string
  sources: AssistantSource[]
}

/* ------------------------------------------------------------------ */
/* TYLKO FRONTEND, DO USTALENIA Z BACKENDEM                            */
/* ------------------------------------------------------------------ */

export type UserRole = 'supervisor' | 'hr'

export interface User {
  id: string
  role: UserRole
  first_name: string
  last_name: string
  job_title: string
  organizational_unit: string
}

/** Rodzaj umowy (założenie: trzy warianty istotne dla terminów ocen). */
export type ContractType = 'fixed_term_first' | 'indefinite' | 'appointment'

export type EmployeeStatus =
  | 'awaiting_first_assessment'
  | 'assessment_in_progress'
  | 'assessment_due_soon'
  | 'assessment_overdue'
  | 'up_to_date'

export interface Employee {
  id: string
  supervisor_id: string
  first_name: string
  last_name: string
  position_title: string
  organizational_unit: string
  hire_date: string
  contract_type: ContractType
  last_assessment_date: string | null
  last_assessment_result: AssessmentResult | null
  /** Termin wyliczony przez backend. */
  next_assessment_due: string | null
  status: EmployeeStatus
}

export interface CreateEmployeeInput {
  first_name: string
  last_name: string
  hire_date: string
  contract_type: ContractType
  position_title?: string
}

export interface JobDescriptionDocument {
  id: string
  employee_id: string
  filename: string
  uploaded_at: string
  version: number
  analysis: OspAnalysis | null
}

export interface Note {
  id: string
  employee_id: string
  created_at: string
  text: string
}

export type AssessmentKind = 'first' | 'periodic'

export type AssessmentStatus =
  | 'not_started'
  | 'draft'
  | 'awaiting_interview'
  | 'completed'
  | 'overdue'

export interface AssessmentSummary {
  id: string
  employee_id: string
  /** Dane do tabeli kadr (bez szczegółów oceny). */
  employee_name: string
  supervisor_name: string
  kind: AssessmentKind
  form: AssessmentForm | 'first'
  status: AssessmentStatus
  started_at: string | null
  due_date: string
  result: AssessmentResult | null
}

export interface AssessmentFilters {
  employee_id?: string
  supervisor_id?: string
  status?: AssessmentStatus
}
