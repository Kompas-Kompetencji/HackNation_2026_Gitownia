/**
 * Kontrakt danych frontendu (Kompas Kompetencji).
 *
 * Nazwy pól w snake_case, zgodnie z backendem (Python, FastAPI + Pydantic).
 *
 * Spięcie z backendem (gałąź feature/wspolne-klejenie): docs/spiecie-z-backendem.md.
 *
 * ZAŁOŻENIA (backend w repozytorium nie zawiera jeszcze kodu, gałąź main ma tylko
 * puste wskaźniki katalogów backend/ i frontend/; do potwierdzenia z zespołem):
 *  1. Poziomy oceny to liczby 1 | 3 | 5 | 7 | 9. „Brak podstaw do oceny" = selected_level: null.
 *  2. Identyfikatory są tekstowe (string), np. "K01", "K01-W2", "emp-001".
 *  3. Daty przesyłane jako tekst ISO 8601: "2026-11-21" (data) lub "2026-11-21T10:15:00Z" (data i czas).
 *  4. star_note to obiekt z trzema polami (sytuacja, działanie, rezultat). Jeśli backend
 *     przechowuje go jako jeden tekst, wystarczy zmienić typ StarNote na string.
 *  5. analyzeOsp zwraca do trzech kryteriów dodatkowych (z backendu zwykle 0–1, patrz
 *     docs/prosby-dla-kolegi.md); formularz to "B" albo "C".
 *  6. askAiAssistant zwraca status "answered" albo "no_data"; przy "no_data" lista źródeł jest pusta.
 *  7. calculateScore zwraca średnią i sugerowany poziom; wynik (pozytywny/negatywny)
 *     wylicza backend. Frontend nie liczy niczego sam.
 *  8. analyzeOsp zwraca też liczbę podległych pracowników (subordinates_count, null gdy brak w dokumencie).
 *     Przełożony może poprawić wynik; poprawiona wersja trafia do attachJobDescription.
 *  9. Dwie ścieżki dodania pracownika: "first" (nowo zatrudniony, arkusz pierwszej oceny, bez analizy B/C)
 *     i "periodic" (pracownik dotychczasowy, arkusz B lub C z analizy opisu stanowiska).
 *     Terminy pierwszej oceny zwraca backend (getFirstAssessmentSchedule).
 * 10. getEmployee: pracownik innego przełożonego → błąd 403 (ApiError), nieistniejący → null.
 * 11. createAssessmentDraft zwraca szkic oceny (status "draft"); jeśli dla pracownika istnieje już
 *     nierozpoczęta ocena tego rodzaju, backend zamienia ją w szkic zamiast tworzyć nową.
 * 12. Typy z sekcji „TYLKO FRONTEND" (pracownicy, notatki, opisy stanowiska, lista ocen,
 *     użytkownicy) to propozycja: backend ich jeszcze nie ma.
 *
 * ZAŁOŻENIA ETAPU 4 (formularz oceny okresowej; backend: gałąź feature/backend-m1-rules-engine):
 * 13. Model kompetencji pochodzi z backendu (competency_model.json z Model_kompetencji.xlsx).
 *     Backend zwraca id jako liczbę 1–14 i wskaźniki "C01_I01"; api.ts mapuje je na competency_id "C01".
 * 14. calculateScore liczy JEDNO kryterium: przyjmuje odpowiedzi jego wskaźników i zwraca
 *     { mean, suggested_level, counted_indicators }. Backend nie ma jeszcze tej trasy (do dodania).
 *     Błąd walidacji = HTTP 422 z komunikatem w treści odpowiedzi.
 * 15. „Brak podstaw do oceny" = selected_level: null; wskaźnik bez odpowiedzi nie ma wpisu w answers.
 * 16. Wynik całej oceny (średnia, ogólny poziom, pozytywna/negatywna, powody) liczy backend
 *     (POST /evaluations/evaluate); api.ts mapuje nazwy pól z polskich na angielskie.
 * 17. Kryteria obowiązkowe arkuszy B i C zwraca getAssessmentTemplate (frontend ich nie zna).
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

/**
 * Arkusz przypisany pracownikowi: "B" lub "C" (ocena okresowa)
 * albo "first" (pierwsza ocena nowo zatrudnionego: pięć elementów, skala 3/5/7, bez kryteriów dodatkowych).
 */
export type EmployeeForm = AssessmentForm | 'first'

export interface BehavioralIndicator {
  /** Identyfikator z modelu backendu, np. "C01_I02". */
  indicator_id: string
  competency_id: string
  /** Treść wskaźnika behawioralnego. */
  description: string
  /** Opisy zachowań dla poziomów skali (jeśli backend je udostępnia). */
  level_descriptions?: Partial<Record<Level, string>>
}

export interface Competency {
  /** Identyfikator tekstowy, np. "C01" (backend: liczba 1–14, mapowana w api.ts). */
  competency_id: string
  name: string
  /** Opis kompetencji; model z Model_kompetencji.xlsx go nie zawiera (null). */
  definition: string | null
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
  /** Liczba podległych pracowników wykryta w opisie; null = brak informacji w dokumencie. */
  subordinates_count: number | null
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

/**
 * Odpowiedź calculateScore(answers) dla wskaźników JEDNEGO kryterium.
 * Wskaźniki z „brak podstaw do oceny" (selected_level: null) nie wchodzą do średniej.
 * mean = null, gdy żaden wskaźnik nie ma poziomu. Zaokrąglenie do 1/3/5/7/9 robi backend.
 */
export interface ScoreResult {
  mean: number | null
  suggested_level: Level | null
  /** Liczba wskaźników, które weszły do średniej. */
  counted_indicators: number
}

/** Decyzja przełożonego dla jednego kryterium (to ona trafia do arkusza, nie sugestia). */
export interface CriterionDecision {
  competency_id: string
  is_mandatory: boolean
  /** Poziom wybrany przez przełożonego; null = jeszcze nie wybrano. Nigdy nie wypełnia się sam. */
  selected_level: Level | null
  /** Krótkie uzasadnienie, gdy decyzja różni się od sugestii (opcjonalne). */
  decision_note: string
}

/** Wejście evaluateAssessment: decyzje do wyliczenia wyniku oceny przez backend. */
export interface EvaluationInput {
  form: AssessmentForm
  decisions: Array<Pick<CriterionDecision, 'competency_id' | 'is_mandatory'> & { selected_level: Level }>
  justification_draft: string
}

/**
 * Wynik oceny wyliczony przez backend (POST /evaluations/evaluate, EvaluationResponse):
 * srednia_arytmetyczna → mean, ogolny_poziom → overall_level, werdykt → result,
 * powody_werdyktu → reasons, uzasadnienie_obowiazkowe → justification_required.
 */
export interface AssessmentEvaluation {
  mean: number
  /** Ogólny poziom spełniania kryteriów, np. "na poziomie oczekiwań". */
  overall_level: string | null
  result: AssessmentResult
  reasons: string[]
  justification_required: boolean
  /** Kryteria ocenione poniżej oczekiwań (do wniosków rozwojowych). */
  development_criteria: string[]
  errors: string[]
  warnings: string[]
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
/** replacement = umowa w celu zastępstwa nieobecnego członka korpusu (art. 37 ust. 2 ustawy o służbie cywilnej). */
export type ContractType = 'fixed_term_first' | 'indefinite' | 'appointment' | 'replacement'

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
  /** Data zakończenia umowy; tylko dla umowy na czas określony, w pozostałych przypadkach null. */
  contract_end_date: string | null
  /** Zastępstwo: dzień porozumienia pracownika i dyrektora generalnego o pierwszej ocenie (od niego biegną terminy). */
  first_eval_agreement_date?: string | null
  /** Ścieżka oceny: pierwsza ocena (nowo zatrudniony) albo ocena okresowa. */
  assessment_kind: AssessmentKind
  /** Przypisany arkusz; null, dopóki przełożony nie potwierdzi opisu stanowiska (ścieżka okresowa). */
  form: EmployeeForm | null
  last_assessment_date: string | null
  last_assessment_result: AssessmentResult | null
  /** Termin wyliczony przez backend. */
  next_assessment_due: string | null
  status: EmployeeStatus
}

/** Wejście createEmployee. Pracownik trafia do zalogowanego przełożonego (backend bierze go z sesji). */
export interface CreateEmployeeInput {
  first_name: string
  last_name: string
  hire_date: string
  contract_type: ContractType
  contract_end_date: string | null
  first_eval_agreement_date?: string | null
  assessment_kind: AssessmentKind
  /** "first" dla nowo zatrudnionego; "B" lub "C" po potwierdzeniu analizy opisu stanowiska. */
  form: EmployeeForm
  position_title: string
  organizational_unit: string | null
}

/** Wejście getFirstAssessmentSchedule: dane umowy nowo zatrudnionego. */
export interface FirstAssessmentScheduleInput {
  hire_date: string
  contract_type: ContractType
  contract_end_date: string | null
  first_eval_agreement_date?: string | null
}

/** Terminy pierwszej oceny wyliczone przez backend (frontend ich nie liczy). */
export interface FirstAssessmentSchedule {
  /** Termin rozmowy wstępnej z nowym pracownikiem. */
  introductory_interview_due: string
  /** Okres, w którym należy sporządzić pierwszą ocenę. */
  first_assessment_period_start: string
  first_assessment_period_end: string
}

export interface JobDescriptionDocument {
  id: string
  employee_id: string
  filename: string
  uploaded_at: string
  version: number
  /** Wynik analizy po poprawkach i potwierdzeniu przez przełożonego. */
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
  form: EmployeeForm
  status: AssessmentStatus
  started_at: string | null
  /** Data zakończenia (zatwierdzenia) oceny; null dla ocen w toku. */
  completed_at: string | null
  due_date: string
  result: AssessmentResult | null
}

/** Odpowiedź getAssessmentTemplate(form): które kryteria są obowiązkowe dla arkusza. */
export interface AssessmentTemplate {
  form: AssessmentForm
  mandatory_competency_ids: string[]
  max_additional: number
}

/**
 * Pełna ocena okresowa (szkic lub zakończona). Rozszerza wiersz listy o treść arkusza.
 * answers zawiera tylko wskaźniki, na które przełożony już odpowiedział
 * (brak wpisu = jeszcze bez odpowiedzi, selected_level: null = brak podstaw do oceny).
 */
export interface AssessmentDetail extends AssessmentSummary {
  /** Kryteria dodatkowe; null = konfiguracja jeszcze nie zatwierdzona (podpowiedź z opisu stanowiska). */
  additional_competency_ids: string[] | null
  answers: IndicatorAnswer[]
  decisions: CriterionDecision[]
  justification_draft: string
  /** Ostatni otwarty krok formularza, żeby powrót do szkicu wracał w to samo miejsce. */
  last_step: string | null
  updated_at: string | null
  /** Wynik zapisany przy zakończeniu oceny (widok tylko do odczytu). */
  evaluation: AssessmentEvaluation | null
}

/** Wejście saveAssessmentDraft: zmieniane pola szkicu. */
export type AssessmentDraftInput = Pick<
  AssessmentDetail,
  'additional_competency_ids' | 'answers' | 'decisions' | 'justification_draft' | 'last_step'
> & { form: AssessmentForm }

/** Wejście createAssessmentDraft. Arkusz backend bierze z pracownika (form). */
export interface CreateAssessmentInput {
  employee_id: string
  kind: AssessmentKind
}

export interface AssessmentFilters {
  employee_id?: string
  supervisor_id?: string
  status?: AssessmentStatus
}

/* --- Kalendarz terminów (GET /calendar) ------------------------------------------------- */

export type CalendarEventKind =
  | 'first_interview'
  | 'report_window'
  | 'first_due'
  | 'contract_end'
  | 'criteria_meeting'
  | 'periodic_due'
  | 'objection_deadline'

/** overdue = termin minął, a czynność nie jest zakończona; soon = do 14 dni; done = czynność wykonana. */
export type CalendarSeverity = 'overdue' | 'soon' | 'upcoming' | 'past' | 'done'

/** Termin procesu ocen wyliczony przez backend (kadry: wszyscy, przełożony: swoi podwładni). */
export interface CalendarEvent {
  id: string
  date: string
  kind: CalendarEventKind
  title: string
  description: string
  legal_basis: string
  employee_id: string
  employee_name: string
  supervisor_id: string
  supervisor_name: string
  severity: CalendarSeverity
}
