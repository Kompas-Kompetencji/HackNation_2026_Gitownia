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
  CompetencyModel,
  CreateEmployeeInput,
  Employee,
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

function currentUser(): User | undefined {
  const id = readSessionUserId()
  return mockUsers.find((u) => u.id === id)
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

export async function getEmployee(id: string): Promise<Employee | null> {
  if (USE_MOCKS) {
    const user = currentUser()
    return mockDelay(employees.find((e) => e.id === id && e.supervisor_id === user?.id) ?? null)
  }
  return request<Employee>(`/employees/${encodeURIComponent(id)}`)
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
      last_assessment_date: null,
      last_assessment_result: null,
      next_assessment_due: null, // termin wylicza backend
      status: 'awaiting_first_assessment',
    }
    employees.push(employee)
    return mockDelay(employee)
  }
  return request<Employee>('/employees', { method: 'POST', body: JSON.stringify(data) })
}

export async function listNotes(employee_id: string): Promise<Note[]> {
  if (USE_MOCKS) return mockDelay(notes.filter((n) => n.employee_id === employee_id))
  return request<Note[]>(`/employees/${encodeURIComponent(employee_id)}/notes`)
}

export async function addNote(employee_id: string, text: string): Promise<Note> {
  if (USE_MOCKS) {
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
  if (USE_MOCKS) return mockDelay(jobDescriptions.filter((d) => d.employee_id === employee_id))
  return request<JobDescriptionDocument[]>(`/employees/${encodeURIComponent(employee_id)}/job-descriptions`)
}

/**
 * Zapisuje opis stanowiska przy pracowniku.
 * confirmedAnalysis = wynik analyzeOsp po poprawkach i potwierdzeniu przez przełożonego.
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
        analysis: confirmedAnalysis ?? mockAnalyzeOsp(file.name),
      }
      jobDescriptions.push(doc)
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
      mockAssessments.filter(
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
