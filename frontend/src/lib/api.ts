/**
 * JEDYNE miejsce z wywołaniami sieciowymi. Komponenty nie używają fetch() bezpośrednio.
 *
 * VITE_USE_MOCKS=true  → dane przykładowe z src/lib/mocks
 * VITE_USE_MOCKS=false → zapytania pod adres VITE_API_URL (domyślnie "/api", proxy Vite)
 *
 * Ścieżki zapytań to propozycja (backend nie ma jeszcze kodu w repozytorium);
 * przy spinaniu wystarczy poprawić ścieżki i ewentualnie kształt ciała zapytania.
 */
import type {
  AssessmentDetail,
  AssessmentDraftInput,
  AssessmentEvaluation,
  AssessmentFilters,
  AssessmentForm,
  AssessmentSummary,
  AssessmentTemplate,
  AssistantAnswer,
  AssistantMode,
  CreateAssessmentInput,
  CompetencyModel,
  CreateEmployeeInput,
  Employee,
  EvaluationInput,
  FirstAssessmentSchedule,
  FirstAssessmentScheduleInput,
  IndicatorAnswer,
  JobDescriptionDocument,
  Level,
  Note,
  OspAnalysis,
  ScoreResult,
  User,
} from '../types'
import {
  buildMockAssessmentContent,
  buildSimplePdf,
  emptyContent,
  mockAnalyzeOsp,
  mockAskAiAssistant,
  mockAssessments,
  mockAssessmentTemplates,
  mockCalculateScore,
  mockCompetencyModelRaw,
  mockEmployees,
  mockEvaluate,
  mockFirstAssessmentSchedule,
  mockJobDescriptions,
  mockNotes,
  mockUsers,
  type BackendCompetencyModel,
  type PdfBlock,
} from './mocks'
import { ApiError } from './apiError'
import { readSessionUserId } from './session'

export const USE_MOCKS = (import.meta.env.VITE_USE_MOCKS ?? 'true') !== 'false'
export const API_URL = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '')

export { ApiError }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const userId = readSessionUserId()
  const headers = new Headers(init?.headers)
  if (!(init?.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  // Założenie: do czasu prawdziwego logowania backend rozpoznaje użytkownika po nagłówku.
  if (userId) headers.set('X-User-Id', userId)

  const response = await fetch(`${API_URL}${path}`, { ...init, headers })
  if (!response.ok) {
    throw new ApiError(response.status, await response.text().catch(() => response.statusText))
  }
  return (await response.json()) as T
}

async function requestBlob(path: string, init?: RequestInit): Promise<Blob> {
  const userId = readSessionUserId()
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  if (userId) headers.set('X-User-Id', userId)
  const response = await fetch(`${API_URL}${path}`, { ...init, headers })
  if (!response.ok) throw new ApiError(response.status, await response.text().catch(() => response.statusText))
  return response.blob()
}

/** Opóźnienie makiet, żeby stany ładowania były widoczne podczas pracy nad ekranami. */
function mockDelay<T>(value: T, ms = 350): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), ms))
}

/** Jak mockDelay, ale błąd makiety zamienia na odrzuconą obietnicę po opóźnieniu. */
function mockCall<T>(produce: () => T, ms = 350): Promise<T> {
  return new Promise((resolve, reject) =>
    setTimeout(() => {
      try {
        resolve(structuredClone(produce()))
      } catch (error) {
        reject(error)
      }
    }, ms),
  )
}

/* ------------------------------------------------------------------ */
/* Uzgodnione z backendem                                              */
/* ------------------------------------------------------------------ */

const LEVEL_KEYS: Level[] = [1, 3, 5, 7, 9]

/** Odpowiedź backendu (GET /competencies) → kontrakt frontendu. Id 1–14 → "C01"–"C14". */
function mapCompetencyModel(raw: BackendCompetencyModel): CompetencyModel {
  return {
    version: raw.version,
    competencies: raw.competencies.map((c) => {
      const competency_id = `C${String(c.id).padStart(2, '0')}`
      return {
        competency_id,
        name: c.name,
        definition: null,
        indicators: c.indicators.map((i) => ({
          indicator_id: i.id,
          competency_id,
          description: i.indicator,
          level_descriptions: Object.fromEntries(
            LEVEL_KEYS.filter((l) => i.levels[String(l)]).map((l) => [l, i.levels[String(l)]]),
          ),
        })),
      }
    }),
  }
}

const mockModel = mapCompetencyModel(mockCompetencyModelRaw)
const mockNames = Object.fromEntries(mockModel.competencies.map((c) => [c.competency_id, c.name]))

export async function getCompetencies(): Promise<CompetencyModel> {
  if (USE_MOCKS) return mockDelay(mockModel)
  return mapCompetencyModel(await request<BackendCompetencyModel>('/competencies'))
}

/** Analiza pliku z opisem stanowiska pracy (OSP). */
export async function analyzeOsp(file: File): Promise<OspAnalysis> {
  if (USE_MOCKS) return mockCall(() => mockAnalyzeOsp(file.name), 900)
  const body = new FormData()
  body.append('file', file)
  return request<OspAnalysis>('/analyze-osp', { method: 'POST', body })
}

/**
 * Wskazówka poziomu dla JEDNEGO kryterium: średnia ze wskaźników i sugerowany poziom.
 * Wskaźniki z „brak podstaw do oceny" (null) nie wchodzą do średniej. ApiError 422 = błąd walidacji.
 * Trasa do dodania w backendzie (propozycja: POST /calculate-score).
 */
export async function calculateScore(answers: IndicatorAnswer[]): Promise<ScoreResult> {
  if (USE_MOCKS) return mockCall(() => mockCalculateScore(answers), 250)
  return request<ScoreResult>('/calculate-score', { method: 'POST', body: JSON.stringify({ answers }) })
}

interface BackendEvaluationResponse {
  srednia_arytmetyczna: number
  ogolny_poziom: string | null
  werdykt: 'POZYTYWNA' | 'NEGATYWNA'
  powody_werdyktu: string[]
  iprz_mandatory_criteria: string[]
  uzasadnienie_obowiazkowe: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Wynik całej oceny okresowej z backendu (POST /evaluations/evaluate):
 * średnia, ogólny poziom, ocena pozytywna lub negatywna z powodami. Frontend niczego nie liczy.
 */
export async function evaluateAssessment(input: EvaluationInput): Promise<AssessmentEvaluation> {
  if (USE_MOCKS) return mockCall(() => mockEvaluate(input, mockNames), 400)
  const names = Object.fromEntries((await getCompetencies()).competencies.map((c) => [c.competency_id, c.name]))
  const response = await request<BackendEvaluationResponse>('/evaluations/evaluate', {
    method: 'POST',
    body: JSON.stringify({
      evaluation_type: 'PERIODIC_EVALUATION',
      form_type: input.form === 'B' ? 'FORM_B' : 'FORM_C',
      oceny_czastkowe: input.decisions.map((d) => ({
        name: names[d.competency_id],
        score: d.selected_level,
        is_mandatory: d.is_mandatory,
      })),
      uzasadnienie: input.justification_draft || null,
    }),
  })
  return {
    mean: response.srednia_arytmetyczna,
    overall_level: response.ogolny_poziom,
    result: response.werdykt === 'POZYTYWNA' ? 'positive' : 'negative',
    reasons: response.powody_werdyktu,
    justification_required: response.uzasadnienie_obowiazkowe,
    development_criteria: response.iprz_mandatory_criteria,
    errors: response.errors,
    warnings: response.warnings,
  }
}

export async function askAiAssistant(question: string, mode: AssistantMode): Promise<AssistantAnswer> {
  if (USE_MOCKS) return mockDelay(mockAskAiAssistant(question, mode), 700)
  return request<AssistantAnswer>('/ai-assistant', { method: 'POST', body: JSON.stringify({ question, mode }) })
}

/* ------------------------------------------------------------------ */
/* TYLKO FRONTEND, DO USTALENIA Z BACKENDEM                            */
/* ------------------------------------------------------------------ */

// Kopie robocze makiet, żeby dodawanie pracowników i notatek działało do odświeżenia strony.
const employees = structuredClone(mockEmployees)
const notes = structuredClone(mockNotes)
const jobDescriptions = structuredClone(mockJobDescriptions)
const assessments = structuredClone(mockAssessments)
const assessmentContent = buildMockAssessmentContent(mockNames)

function contentOf(id: string) {
  return (assessmentContent[id] ??= emptyContent())
}

function currentUser(): User | undefined {
  const id = readSessionUserId()
  return mockUsers.find((u) => u.id === id)
}

/** Czy zalogowany przełożony ocenia tego pracownika (makieta uprawnień backendu). */
function ownsEmployee(employee_id: string): boolean {
  const user = currentUser()
  return employees.some((e) => e.id === employee_id && e.supervisor_id === user?.id)
}

/** Użytkownicy do logowania demonstracyjnego (wybór roli). */
export async function listDemoUsers(): Promise<User[]> {
  if (USE_MOCKS) return mockDelay(mockUsers, 150)
  return request<User[]>('/auth/demo-users')
}

export async function getUser(id: string): Promise<User | null> {
  if (USE_MOCKS) return mockDelay(mockUsers.find((u) => u.id === id) ?? null, 0)
  return request<User>(`/users/${encodeURIComponent(id)}`)
}

/** Pracownicy przypisani do zalogowanego przełożonego. */
export async function listEmployees(): Promise<Employee[]> {
  if (USE_MOCKS) {
    const user = currentUser()
    return mockDelay(employees.filter((e) => e.supervisor_id === user?.id))
  }
  return request<Employee[]>('/employees')
}

/**
 * Pracownik zalogowanego przełożonego.
 * null = pracownik nie istnieje; ApiError 403 = pracownik innego przełożonego (brak dostępu).
 */
export async function getEmployee(id: string): Promise<Employee | null> {
  if (USE_MOCKS) {
    return mockCall(() => {
      const employee = employees.find((e) => e.id === id)
      if (!employee) return null
      if (!ownsEmployee(id)) throw new ApiError(403, 'Brak dostępu do pracownika')
      return employee
    })
  }
  try {
    return await request<Employee>(`/employees/${encodeURIComponent(id)}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

export async function createEmployee(data: CreateEmployeeInput): Promise<Employee> {
  if (USE_MOCKS) {
    const user = currentUser()
    const employee: Employee = {
      id: `emp-${crypto.randomUUID().slice(0, 8)}`,
      supervisor_id: user?.id ?? '',
      first_name: data.first_name,
      last_name: data.last_name,
      position_title: data.position_title,
      organizational_unit: data.organizational_unit ?? user?.organizational_unit ?? '',
      hire_date: data.hire_date,
      contract_type: data.contract_type,
      contract_end_date: data.contract_end_date,
      assessment_kind: data.assessment_kind,
      form: data.form,
      last_assessment_date: null,
      last_assessment_result: null,
      // Termin i status wylicza backend; makieta podaje wartości przykładowe.
      next_assessment_due:
        data.assessment_kind === 'first' ? mockFirstAssessmentSchedule(data).first_assessment_period_end : null,
      status: data.assessment_kind === 'first' ? 'awaiting_first_assessment' : 'up_to_date',
    }
    employees.push(employee)
    return mockDelay(employee)
  }
  return request<Employee>('/employees', { method: 'POST', body: JSON.stringify(data) })
}

/** Terminy pierwszej oceny nowo zatrudnionego (rozmowa wstępna, okres na pierwszą ocenę). */
export async function getFirstAssessmentSchedule(input: FirstAssessmentScheduleInput): Promise<FirstAssessmentSchedule> {
  if (USE_MOCKS) return mockCall(() => mockFirstAssessmentSchedule(input), 400)
  return request<FirstAssessmentSchedule>('/first-assessment-schedule', { method: 'POST', body: JSON.stringify(input) })
}

export async function listNotes(employee_id: string): Promise<Note[]> {
  if (USE_MOCKS) return mockDelay(ownsEmployee(employee_id) ? notes.filter((n) => n.employee_id === employee_id) : [])
  return request<Note[]>(`/employees/${encodeURIComponent(employee_id)}/notes`)
}

export async function addNote(employee_id: string, text: string): Promise<Note> {
  if (USE_MOCKS) {
    if (!ownsEmployee(employee_id)) return Promise.reject(new ApiError(403, 'Brak dostępu do pracownika'))
    const note: Note = {
      id: `note-${crypto.randomUUID().slice(0, 8)}`,
      employee_id,
      created_at: new Date().toISOString(),
      text,
    }
    notes.unshift(note)
    return mockDelay(note, 200)
  }
  return request<Note>(`/employees/${encodeURIComponent(employee_id)}/notes`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

export async function listJobDescriptions(employee_id: string): Promise<JobDescriptionDocument[]> {
  if (USE_MOCKS) {
    return mockDelay(ownsEmployee(employee_id) ? jobDescriptions.filter((d) => d.employee_id === employee_id) : [])
  }
  return request<JobDescriptionDocument[]>(`/employees/${encodeURIComponent(employee_id)}/job-descriptions`)
}

/**
 * Zapisuje opis stanowiska przy pracowniku.
 * confirmedAnalysis = wynik analyzeOsp po poprawkach i potwierdzeniu przez przełożonego
 * (ścieżka oceny okresowej). Bez niego plik jest tylko archiwizowany, bez analizy.
 */
export async function attachJobDescription(
  employee_id: string,
  file: File,
  confirmedAnalysis?: OspAnalysis,
): Promise<JobDescriptionDocument> {
  if (USE_MOCKS) {
    return mockCall(() => {
      const previous = jobDescriptions.filter((d) => d.employee_id === employee_id)
      const doc: JobDescriptionDocument = {
        id: `jd-${crypto.randomUUID().slice(0, 8)}`,
        employee_id,
        filename: file.name,
        uploaded_at: new Date().toISOString(),
        version: previous.length + 1,
        // Bez potwierdzonej analizy (ścieżka pierwszej oceny) plik trafia tylko do archiwum.
        analysis: confirmedAnalysis ?? null,
      }
      jobDescriptions.push(doc)
      // Potwierdzona analiza ustala arkusz oceny okresowej pracownika (robi to backend).
      const employee = employees.find((e) => e.id === employee_id)
      if (employee && confirmedAnalysis && employee.assessment_kind === 'periodic') {
        employee.form = confirmedAnalysis.suggested_form
        employee.position_title = confirmedAnalysis.position_title
      }
      return doc
    }, 600)
  }
  const body = new FormData()
  body.append('file', file)
  if (confirmedAnalysis) body.append('confirmed_analysis', JSON.stringify(confirmedAnalysis))
  return request<JobDescriptionDocument>(`/employees/${encodeURIComponent(employee_id)}/job-descriptions`, {
    method: 'POST',
    body,
  })
}

/**
 * Lista ocen ze statusami i terminami. Przełożony widzi oceny swoich pracowników,
 * kadry widzą wszystkie (bez szczegółów).
 */
export async function listAssessments(filters: AssessmentFilters = {}): Promise<AssessmentSummary[]> {
  if (USE_MOCKS) {
    const user = currentUser()
    const visibleEmployeeIds =
      user?.role === 'hr' ? null : new Set(employees.filter((e) => e.supervisor_id === user?.id).map((e) => e.id))
    return mockDelay(
      assessments.filter(
        (a) =>
          (visibleEmployeeIds === null || visibleEmployeeIds.has(a.employee_id)) &&
          (!filters.employee_id || a.employee_id === filters.employee_id) &&
          (!filters.status || a.status === filters.status),
      ),
    )
  }
  const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][])
  return request<AssessmentSummary[]>(`/assessments${params.size ? `?${params}` : ''}`)
}

/** Pełna ocena (szkic albo zakończona). null = nie istnieje; ApiError 403 = ocena pracownika innego przełożonego. */
export async function getAssessment(id: string): Promise<AssessmentDetail | null> {
  if (USE_MOCKS) {
    return mockCall(() => {
      const assessment = assessments.find((a) => a.id === id)
      if (!assessment) return null
      if (!ownsEmployee(assessment.employee_id)) throw new ApiError(403, 'Brak dostępu do oceny')
      return { ...assessment, ...contentOf(id) }
    })
  }
  try {
    return await request<AssessmentDetail>(`/assessments/${encodeURIComponent(id)}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

/**
 * Tworzy szkic oceny (pierwszej albo okresowej) dla pracownika.
 * Istniejąca nierozpoczęta lub przeterminowana ocena tego rodzaju zamienia się w szkic.
 */
export async function createAssessmentDraft(input: CreateAssessmentInput): Promise<AssessmentSummary> {
  if (USE_MOCKS) {
    return mockCall(() => {
      const employee = employees.find((e) => e.id === input.employee_id)
      if (!employee || !ownsEmployee(employee.id)) throw new ApiError(403, 'Brak dostępu do pracownika')
      if (!employee.form) throw new ApiError(409, 'Pracownik nie ma ustalonego arkusza oceny')
      const now = new Date().toISOString()
      const open = assessments.find(
        (a) => a.employee_id === employee.id && a.kind === input.kind && ['not_started', 'overdue'].includes(a.status),
      )
      if (open) {
        Object.assign(open, { status: 'draft', started_at: now, form: employee.form })
        employee.status = 'assessment_in_progress'
        return open
      }
      const draft: AssessmentSummary = {
        id: `as-${crypto.randomUUID().slice(0, 8)}`,
        employee_id: employee.id,
        employee_name: `${employee.first_name} ${employee.last_name}`,
        supervisor_name: `${currentUser()?.first_name ?? ''} ${currentUser()?.last_name ?? ''}`.trim(),
        kind: input.kind,
        form: employee.form,
        status: 'draft',
        started_at: now,
        completed_at: null,
        due_date: employee.next_assessment_due ?? now.slice(0, 10),
        result: null,
      }
      assessments.unshift(draft)
      employee.status = 'assessment_in_progress'
      return draft
    }, 500)
  }
  return request<AssessmentSummary>('/assessments', { method: 'POST', body: JSON.stringify(input) })
}

/**
 * Szablon arkusza oceny okresowej: kryteria obowiązkowe i limit kryteriów dodatkowych.
 * Frontend nie zna tych reguł; zwraca je backend (propozycja: GET /assessment-templates/{form}).
 */
export async function getAssessmentTemplate(form: AssessmentForm): Promise<AssessmentTemplate> {
  if (USE_MOCKS) return mockDelay(mockAssessmentTemplates[form], 200)
  return request<AssessmentTemplate>(`/assessment-templates/${form}`)
}

/** Zapisuje wersję roboczą oceny (konfiguracja, odpowiedzi, decyzje, uzasadnienie). */
export async function saveAssessmentDraft(id: string, input: AssessmentDraftInput): Promise<AssessmentDetail> {
  if (USE_MOCKS) {
    return mockCall(() => {
      const assessment = assessments.find((a) => a.id === id)
      if (!assessment || !ownsEmployee(assessment.employee_id)) throw new ApiError(403, 'Brak dostępu do oceny')
      if (assessment.status === 'completed') throw new ApiError(409, 'Ocena jest już zakończona')
      const { form, ...content } = input
      assessment.form = form
      Object.assign(contentOf(id), structuredClone(content), { updated_at: new Date().toISOString() })
      return { ...assessment, ...contentOf(id) }
    }, 300)
  }
  return request<AssessmentDetail>(`/assessments/${encodeURIComponent(id)}/draft`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

/** Dodaje miesiące do daty "RRRR-MM-DD" (tylko makieta; termin wylicza backend). */
function mockAddMonths(iso: string, months: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}

/**
 * Kończy ocenę: backend zapisuje arkusz, wylicza wynik, zmienia status oceny i pracownika
 * oraz wyznacza termin następnej oceny.
 */
export async function completeAssessment(id: string, input: AssessmentDraftInput): Promise<AssessmentDetail> {
  if (USE_MOCKS) {
    return mockCall(() => {
      const assessment = assessments.find((a) => a.id === id)
      if (!assessment || !ownsEmployee(assessment.employee_id)) throw new ApiError(403, 'Brak dostępu do oceny')
      const decisions = input.decisions.flatMap((d) => (d.selected_level === null ? [] : [{ ...d, selected_level: d.selected_level }]))
      if (decisions.length !== input.decisions.length) throw new ApiError(422, 'Nie wszystkie kryteria mają decyzję.')
      const evaluation = mockEvaluate({ form: input.form, justification_draft: input.justification_draft, decisions }, mockNames)
      if (evaluation.justification_required && !input.justification_draft.trim()) {
        throw new ApiError(422, 'Uzasadnienie jest obowiązkowe przy ocenie negatywnej.')
      }
      const now = new Date().toISOString()
      const { form, ...content } = input
      Object.assign(assessment, { form, status: 'completed', completed_at: now, result: evaluation.result })
      Object.assign(contentOf(id), structuredClone(content), { updated_at: now, evaluation })
      const employee = employees.find((e) => e.id === assessment.employee_id)
      if (employee) {
        // Makieta: po ocenie negatywnej kolejna po 6 miesiącach, po pozytywnej po 24 (§ 7 rozporządzenia z 2016 r.).
        Object.assign(employee, {
          last_assessment_date: now.slice(0, 10),
          last_assessment_result: evaluation.result,
          next_assessment_due: mockAddMonths(now, evaluation.result === 'negative' ? 6 : 24),
          status: 'up_to_date',
          form,
        })
      }
      return { ...assessment, ...contentOf(id) }
    }, 700)
  }
  return request<AssessmentDetail>(`/assessments/${encodeURIComponent(id)}/complete`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/**
 * Arkusz oceny w formacie PDF. Docelowo generuje go backend (POST /evaluations/pdf);
 * makieta buduje w przeglądarce prosty dokument oznaczony jako przykład.
 */
export async function exportAssessmentPdf(id: string): Promise<Blob> {
  if (USE_MOCKS) {
    const detail = await mockCall(() => {
      const assessment = assessments.find((a) => a.id === id)
      if (!assessment || !ownsEmployee(assessment.employee_id)) throw new ApiError(403, 'Brak dostępu do oceny')
      return { ...assessment, ...contentOf(id) }
    }, 300)
    return mockAssessmentPdf(detail)
  }
  return requestBlob(`/assessments/${encodeURIComponent(id)}/pdf`)
}

const MOCK_LEVEL_LABELS: Record<Level, string> = {
  1: 'znacznie poniżej oczekiwań',
  3: 'poniżej oczekiwań',
  5: 'na poziomie oczekiwań',
  7: 'powyżej oczekiwań',
  9: 'znacznie powyżej oczekiwań',
}

function mockAssessmentPdf(a: AssessmentDetail): Promise<Blob> {
  const employee = employees.find((e) => e.id === a.employee_id)
  const formLabel = a.form === 'B' ? 'Arkusz B' : a.form === 'C' ? 'Arkusz C' : 'Arkusz pierwszej oceny'
  const blocks: PdfBlock[] = [
    { text: 'DOKUMENT PRZYKŁADOWY — wygenerowany z makiety, nie jest arkuszem urzędowym', size: 8, bold: true },
    { text: `Ocena okresowa — ${formLabel}`, size: 18, bold: true, gap: 12 },
    {
      text: `Oceniany: ${a.employee_name}${employee ? `, ${employee.position_title}, ${employee.organizational_unit}` : ''}`,
      gap: 10,
    },
    { text: `Oceniający: ${a.supervisor_name}` },
    {
      text: `Status: ${a.status === 'completed' ? 'zakończona' : 'wersja robocza'}${a.completed_at ? `, data sporządzenia ${a.completed_at.slice(0, 10)}` : ''}`,
    },
    { text: 'Kryteria oceny i przyznane poziomy', size: 12, bold: true, gap: 16 },
  ]
  for (const mandatory of [true, false]) {
    const list = a.decisions.filter((d) => d.is_mandatory === mandatory)
    if (!list.length) continue
    blocks.push({ text: mandatory ? 'Kryteria obowiązkowe' : 'Kryteria dodatkowe', bold: true, gap: 8 })
    for (const d of list) {
      const level = d.selected_level ? `${d.selected_level} pkt — ${MOCK_LEVEL_LABELS[d.selected_level]}` : 'brak decyzji'
      blocks.push({ text: `${mockNames[d.competency_id] ?? d.competency_id}: ${level}`, indent: 12 })
      if (d.decision_note) blocks.push({ text: `Uwaga oceniającego: ${d.decision_note}`, size: 9, indent: 24 })
    }
  }
  if (a.evaluation) {
    blocks.push(
      { text: 'Wynik oceny', size: 12, bold: true, gap: 16 },
      { text: `Średnia: ${a.evaluation.mean.toFixed(2).replace('.', ',')} pkt; ogólny poziom: ${a.evaluation.overall_level ?? '—'}` },
      { text: `Ocena: ${a.evaluation.result === 'positive' ? 'POZYTYWNA' : 'NEGATYWNA'}`, bold: true },
      ...a.evaluation.reasons.map((r) => ({ text: r, size: 9, indent: 12 })),
    )
  }
  if (a.justification_draft.trim()) {
    blocks.push({ text: 'Uzasadnienie', size: 12, bold: true, gap: 16 }, { text: a.justification_draft })
  }
  blocks.push({ text: 'Podpis oceniającego: ................................................', gap: 40 })
  return buildSimplePdf(blocks, 'Kompas Kompetencji · dokument przykładowy z makiety', `Arkusz oceny: ${a.employee_name}`)
}
