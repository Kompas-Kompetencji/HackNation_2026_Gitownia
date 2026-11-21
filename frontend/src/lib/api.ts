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
  AssessmentFilters,
  AssessmentSummary,
  AssistantAnswer,
  AssistantMode,
  CreateAssessmentInput,
  CompetencyModel,
  CreateEmployeeInput,
  Employee,
  FirstAssessmentSchedule,
  FirstAssessmentScheduleInput,
  IndicatorAnswer,
  JobDescriptionDocument,
  Note,
  OspAnalysis,
  ScoreResult,
  User,
} from '../types'
import {
  mockAnalyzeOsp,
  mockAskAiAssistant,
  mockAssessments,
  mockCalculateScore,
  mockCompetencyModel,
  mockEmployees,
  mockFirstAssessmentSchedule,
  mockJobDescriptions,
  mockNotes,
  mockUsers,
} from './mocks'
import { readSessionUserId } from './session'

export const USE_MOCKS = (import.meta.env.VITE_USE_MOCKS ?? 'true') !== 'false'
export const API_URL = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '')

/** Błąd zapytania z kodem HTTP, do pokazania w stanie błędu ekranu. */
export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

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

export async function getCompetencies(): Promise<CompetencyModel> {
  if (USE_MOCKS) return mockDelay(mockCompetencyModel)
  return request<CompetencyModel>('/competencies')
}

/** Analiza pliku z opisem stanowiska pracy (OSP). */
export async function analyzeOsp(file: File): Promise<OspAnalysis> {
  if (USE_MOCKS) return mockCall(() => mockAnalyzeOsp(file.name), 900)
  const body = new FormData()
  body.append('file', file)
  return request<OspAnalysis>('/analyze-osp', { method: 'POST', body })
}

export async function calculateScore(answers: IndicatorAnswer[]): Promise<ScoreResult> {
  if (USE_MOCKS) return mockDelay(mockCalculateScore(answers), 250)
  return request<ScoreResult>('/calculate-score', { method: 'POST', body: JSON.stringify({ answers }) })
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

/** Jedna ocena (na razie tylko podsumowanie; pełny formularz w etapie 4). */
export async function getAssessment(id: string): Promise<AssessmentSummary | null> {
  if (USE_MOCKS) {
    return mockCall(() => {
      const assessment = assessments.find((a) => a.id === id)
      if (!assessment) return null
      if (!ownsEmployee(assessment.employee_id)) throw new ApiError(403, 'Brak dostępu do oceny')
      return assessment
    })
  }
  try {
    return await request<AssessmentSummary>(`/assessments/${encodeURIComponent(id)}`)
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
