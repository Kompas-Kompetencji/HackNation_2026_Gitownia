/**
 * JEDYNE miejsce z wywołaniami sieciowymi. Komponenty nie używają fetch() bezpośrednio.
 *
 * Tryby (zmienne środowiskowe Vite):
 *  VITE_USE_MOCKS=false → wszystkie funkcje pytają backend pod adresem VITE_API_URL.
 *  VITE_USE_MOCKS=true  → makiety z src/lib/mocks, z wyjątkiem funkcji wymienionych
 *                         w VITE_REAL_API (tryb mieszany), np.
 *                         VITE_REAL_API=getCompetencies,analyzeOsp,calculateScore,askAiAssistant,exportAssessmentPdf
 *                         ("*" = wszystkie funkcje, które backend obsługuje).
 *  VITE_API_URL         → adres backendu widziany z przeglądarki. Domyślnie "/api/v1":
 *                         w trybie deweloperskim proxy Vite przekazuje /api do BACKEND_PROXY_TARGET.
 *
 * Backend (FastAPI, gałąź feature/wspolne-klejenie, katalog backend/) ma trasy pod /api/v1.
 * Różnice między jego odpowiedziami a kontraktem z src/types są wyrównywane w adapterach
 * poniżej (funkcje from*), komponenty widzą wyłącznie typy z src/types.
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

/** Funkcje api.ts, które da się osobno przełączyć na backend (VITE_REAL_API). */
export const API_FUNCTIONS = [
  // Backend już je obsługuje (przez adaptery poniżej):
  'getCompetencies',
  'analyzeOsp',
  'calculateScore',
  'evaluateAssessment',
  'askAiAssistant',
  'exportAssessmentPdf',
  'getAssessmentTemplate',
  'getFirstAssessmentSchedule',
  // Backend ich jeszcze nie ma (docs/prosby-dla-kolegi.md); przełączenie da błąd 404:
  'listDemoUsers',
  'getUser',
  'listEmployees',
  'getEmployee',
  'createEmployee',
  'listNotes',
  'addNote',
  'listJobDescriptions',
  'attachJobDescription',
  'listAssessments',
  'getAssessment',
  'createAssessmentDraft',
  'saveAssessmentDraft',
  'completeAssessment',
] as const

export type ApiFunctionName = (typeof API_FUNCTIONS)[number]

/** Funkcje, które backend ma; "*" w VITE_REAL_API włącza tylko je. */
const BACKEND_READY: ApiFunctionName[] = API_FUNCTIONS.slice(0, 8)

const ALL_MOCKS = (import.meta.env.VITE_USE_MOCKS ?? 'true') !== 'false'

const REAL_API: ReadonlySet<ApiFunctionName> = (() => {
  const raw = (import.meta.env.VITE_REAL_API ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (raw.includes('*')) return new Set(BACKEND_READY)
  const unknown = raw.filter((name) => !(API_FUNCTIONS as readonly string[]).includes(name))
  if (unknown.length) console.warn(`VITE_REAL_API: nieznane funkcje ${unknown.join(', ')}`)
  return new Set(raw.filter((name): name is ApiFunctionName => !unknown.includes(name)))
})()

/** Czy dana funkcja zwraca makietę (true) czy pyta backend (false). */
export function usesMock(name: ApiFunctionName): boolean {
  return ALL_MOCKS && !REAL_API.has(name)
}

/**
 * true tylko wtedy, gdy CAŁA aplikacja działa na makietach (żadna funkcja nie pyta backendu).
 * Komponenty używają tej flagi do etykiet „dane przykładowe”; w trybie mieszanym etykiety znikają.
 */
export const USE_MOCKS = ALL_MOCKS && REAL_API.size === 0
export const API_URL = (import.meta.env.VITE_API_URL ?? '/api/v1').replace(/\/$/, '')

export { ApiError }

/** Komunikat dla błędu sieci (backend wyłączony, zły adres, CORS). */
const NETWORK_ERROR_MESSAGE = 'Brak połączenia z serwerem. Sprawdź połączenie i spróbuj ponownie.'

/** Treść błędu FastAPI: {"detail": "tekst"} albo {"detail": [{"msg": ...}]} (walidacja Pydantic). */
async function errorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => '')
  try {
    const body = JSON.parse(text) as { detail?: unknown }
    if (typeof body.detail === 'string') return body.detail
    if (Array.isArray(body.detail)) {
      return body.detail.map((d: { msg?: string; loc?: unknown[] }) => `${d.loc?.slice(1).join('.') ?? ''}: ${d.msg ?? ''}`).join('; ')
    }
  } catch {
    /* treść nie jest JSON-em */
  }
  return text || response.statusText
}

/**
 * fetch z obsługą błędów: błąd sieci → ApiError(0); proxy Vite bez działającego backendu
 * odpowiada 500/502/504 bez treści → również traktowane jak brak połączenia.
 */
async function send(path: string, init?: RequestInit): Promise<Response> {
  const userId = readSessionUserId()
  const headers = new Headers(init?.headers)
  if (init?.body !== undefined && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  // Założenie: do czasu prawdziwego logowania backend rozpoznaje użytkownika po nagłówku (dziś go ignoruje).
  if (userId) headers.set('X-User-Id', userId)

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers })
  } catch {
    throw new ApiError(0, NETWORK_ERROR_MESSAGE)
  }
  if (!response.ok) {
    const message = await errorMessage(response)
    if ([500, 502, 503, 504].includes(response.status) && !message.trim()) throw new ApiError(0, NETWORK_ERROR_MESSAGE)
    throw new ApiError(response.status, message)
  }
  return response
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return (await (await send(path, init)).json()) as T
}

async function requestBlob(path: string, init?: RequestInit): Promise<Blob> {
  return (await send(path, init)).blob()
}

const postJson = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })

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

const competencyIdOf = (backendId: number) => `C${String(backendId).padStart(2, '0')}`

/** Odpowiedź backendu (GET /competencies) → kontrakt frontendu. Id 1–14 → "C01"–"C14". */
function mapCompetencyModel(raw: BackendCompetencyModel): CompetencyModel {
  return {
    version: raw.version,
    competencies: raw.competencies.map((c) => {
      const competency_id = competencyIdOf(c.id)
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

/** Surowy model z backendu, pobierany raz na sesję (używają go też adaptery innych funkcji). */
let backendModelPromise: Promise<BackendCompetencyModel> | null = null
function backendModel(): Promise<BackendCompetencyModel> {
  backendModelPromise ??= request<BackendCompetencyModel>('/competencies').catch((error) => {
    backendModelPromise = null // kolejna próba po błędzie sieci
    throw error
  })
  return backendModelPromise
}

export async function getCompetencies(): Promise<CompetencyModel> {
  if (usesMock('getCompetencies')) return mockDelay(mockModel)
  return mapCompetencyModel(await backendModel())
}

/** Nazwy kryteriów po competency_id; backend w ocenie i PDF identyfikuje kryteria po nazwie. */
async function competencyNames(): Promise<Record<string, string>> {
  const model = await getCompetencies()
  return Object.fromEntries(model.competencies.map((c) => [c.competency_id, c.name]))
}

/* --- Opis stanowiska pracy (OSP) --------------------------------------------------------- */

/** Odpowiedź POST /osp/parse (OspParseResult; pola po polsku). */
interface BackendOspParseResult {
  nazwa_urzedu: string
  komorka_organizacyjna: string
  stanowisko_pracy: string
  symbol_stanowiska: string
  cel_stanowiska: string
  kieruje_pracownikami: boolean
  liczba_podleglych_tekst: string
  zalecany_arkusz: 'FORM_B' | 'FORM_C' | 'FIRST_EVAL_FORM'
  zadania_dominujace: string[]
  zadania_pozostale: string[]
  kompetencje_miekkie_z_osp: string[]
  warnings: string[]
}

/** Parser backendu zwraca czasem nagłówek tabeli zamiast nazwy stanowiska. */
const OSP_TITLE_PLACEHOLDER = 'NAZWA STANOWISKA PRACY'

/**
 * Nazwa stanowiska: z dokumentu, a gdy parser zwrócił nagłówek albo nic, z nazwy pliku
 * ("OSP DC WZKSOiC 6 starszy specjalista.docx" → "Starszy specjalista"). Przełożony ją potwierdza.
 */
function positionTitle(raw: BackendOspParseResult, filename: string): string {
  const fromDoc = raw.stanowisko_pracy.trim()
  if (fromDoc && fromDoc.toUpperCase() !== OSP_TITLE_PLACEHOLDER) return fromDoc
  let base = filename.replace(/\.docx$/i, '').replace(/^OSP\s+/i, '')
  if (raw.symbol_stanowiska && base.startsWith(raw.symbol_stanowiska)) base = base.slice(raw.symbol_stanowiska.length)
  base = base.trim()
  return base ? base[0].toUpperCase() + base.slice(1) : ''
}

/**
 * Liczba podległych: backend zwraca zaznaczoną opcję tekstem ("brak podległych pracowników",
 * "bezpośrednio kieruje lub koordynuje pracę od 5 do 9 pracowników"). Dokładną liczbę znamy tylko
 * przy „brak” (0) albo jednej liczbie w tekście; przy przedziale zwracamy null i przełożony ją wpisuje.
 */
function subordinatesCount(raw: BackendOspParseResult): number | null {
  const text = raw.liczba_podleglych_tekst.toLowerCase()
  if (!raw.kieruje_pracownikami && text.includes('brak')) return 0
  const numbers = text.match(/\d+/g) ?? []
  return numbers.length === 1 ? Number(numbers[0]) : null
}

const MAX_SUGGESTED_ADDITIONAL = 3

async function fromOspParse(raw: BackendOspParseResult, filename: string): Promise<OspAnalysis> {
  const suggested_form: AssessmentForm = raw.zalecany_arkusz === 'FORM_B' ? 'B' : 'C'
  const [model, template] = await Promise.all([getCompetencies(), getAssessmentTemplate(suggested_form)])
  const idByName = new Map(model.competencies.map((c) => [c.name.toLocaleLowerCase('pl'), c.competency_id]))
  const mandatory = new Set(template.mandatory_competency_ids)
  // Backend nie proponuje kryteriów dodatkowych; bierzemy kompetencje z pkt 13 opisu stanowiska,
  // które nie są obowiązkowe w zalecanym arkuszu (może ich być mniej niż trzy).
  const additional_criteria = raw.kompetencje_miekkie_z_osp
    .map((name) => ({ name, id: idByName.get(name.toLocaleLowerCase('pl')) }))
    .filter((c): c is { name: string; id: string } => Boolean(c.id) && !mandatory.has(c.id!))
    .slice(0, Math.min(MAX_SUGGESTED_ADDITIONAL, template.max_additional))
    .map((c) => ({
      criterion_id: c.id,
      name: c.name,
      rationale: 'Kompetencja wymagana na stanowisku według opisu stanowiska pracy (punkt 13).',
    }))
  return {
    filename,
    position_title: positionTitle(raw, filename),
    organizational_unit: raw.komorka_organizacyjna.trim() || null,
    has_management_duties: raw.kieruje_pracownikami,
    subordinates_count: subordinatesCount(raw),
    suggested_form,
    additional_criteria,
  }
}

/** Analiza pliku z opisem stanowiska pracy (OSP). Backend: POST /osp/parse (multipart, pole "file"). */
export async function analyzeOsp(file: File): Promise<OspAnalysis> {
  if (usesMock('analyzeOsp')) return mockCall(() => mockAnalyzeOsp(file.name), 900)
  const body = new FormData()
  body.append('file', file)
  return fromOspParse(await request<BackendOspParseResult>('/osp/parse', { method: 'POST', body }), file.name)
}

/* --- Szablon arkusza (kryteria obowiązkowe) ---------------------------------------------- */

/** Limit kryteriów dodatkowych w ocenie okresowej; backend go nie zwraca (prośba w docs). */
const MAX_ADDITIONAL_PERIODIC = 3

/**
 * Szablon arkusza oceny okresowej: kryteria obowiązkowe i limit kryteriów dodatkowych.
 * Backend: GET /competencies?form_type=FORM_B|FORM_C (pole is_mandatory_for_selected_form).
 */
export async function getAssessmentTemplate(form: AssessmentForm): Promise<AssessmentTemplate> {
  if (usesMock('getAssessmentTemplate')) return mockDelay(mockAssessmentTemplates[form], 200)
  const raw = await request<BackendCompetencyModel>(`/competencies?form_type=FORM_${form}`)
  return {
    form,
    mandatory_competency_ids: raw.competencies.filter((c) => c.is_mandatory_for_selected_form).map((c) => competencyIdOf(c.id)),
    max_additional: MAX_ADDITIONAL_PERIODIC,
  }
}

/* --- Ocena: wskazówka dla kryterium, wynik całej oceny ----------------------------------- */

/** Odpowiedź POST /evaluations/evaluate (EvaluationResponse). */
interface BackendEvaluationResponse {
  srednia_arytmetyczna: number
  ogolny_poziom: string | null
  werdykt: 'POZYTYWNA' | 'NEGATYWNA'
  powody_werdyktu: string[]
  iprz_mandatory_criteria: string[]
  uzasadnienie_obowiazkowe: boolean
  wnioski_rozwojowe_dozwolone: boolean
  include_part_3: boolean
  errors: string[]
  warnings: string[]
}

interface BackendCriterionScore {
  name: string
  score: number
  is_mandatory: boolean
}

/**
 * Wskazówka poziomu dla JEDNEGO kryterium: średnia ze wskaźników i sugerowany poziom.
 * Wskaźniki z „brak podstaw do oceny" (null) nie wchodzą do średniej. ApiError 422 = błąd walidacji.
 *
 * Backend nie ma jeszcze osobnej trasy (prośba: POST /calculate-score). Do tego czasu adapter
 * korzysta z POST /evaluations/evaluate: każdy oceniony wskaźnik idzie jako ocena cząstkowa,
 * średnią i poziom (§ 11 ust. 1 pkt 2) liczy backend. Błędy o kryteriach obowiązkowych
 * w tej odpowiedzi dotyczą całego arkusza i są pomijane; liczy się tylko błąd skali.
 */
export async function calculateScore(answers: IndicatorAnswer[]): Promise<ScoreResult> {
  if (usesMock('calculateScore')) return mockCall(() => mockCalculateScore(answers), 250)
  if (answers.length === 0) throw new ApiError(422, 'Brak odpowiedzi do obliczenia średniej.')
  const rated = answers.filter((a) => a.selected_level !== null)
  if (rated.length === 0) return { mean: null, suggested_level: null, counted_indicators: 0 }

  const [response, model] = await Promise.all([
    request<BackendEvaluationResponse>(
      '/evaluations/evaluate',
      postJson({
        evaluation_type: 'PERIODIC_EVALUATION',
        form_type: 'FORM_C',
        oceny_czastkowe: rated.map<BackendCriterionScore>((a) => ({ name: a.indicator_id, score: a.selected_level!, is_mandatory: false })),
      }),
    ),
    backendModel(),
  ])
  const scaleError = response.errors.find((e) => e.startsWith('Niedozwolona ocena'))
  if (scaleError) throw new ApiError(422, scaleError)
  const levelByLabel = new Map((model.rating_scale ?? []).map((s) => [s.label, s.score as Level]))
  return {
    mean: response.srednia_arytmetyczna,
    suggested_level: (response.ogolny_poziom && levelByLabel.get(response.ogolny_poziom)) || null,
    counted_indicators: rated.length,
  }
}

function fromBackendEvaluation(response: BackendEvaluationResponse): AssessmentEvaluation {
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

function toCriterionScores(
  decisions: Array<{ competency_id: string; is_mandatory: boolean; selected_level: Level | null }>,
  names: Record<string, string>,
): BackendCriterionScore[] {
  return decisions.flatMap((d) =>
    d.selected_level === null ? [] : [{ name: names[d.competency_id] ?? d.competency_id, score: d.selected_level, is_mandatory: d.is_mandatory }],
  )
}

/**
 * Wynik całej oceny okresowej z backendu (POST /evaluations/evaluate):
 * średnia, ogólny poziom, ocena pozytywna lub negatywna z powodami. Frontend niczego nie liczy.
 */
export async function evaluateAssessment(input: EvaluationInput): Promise<AssessmentEvaluation> {
  if (usesMock('evaluateAssessment')) return mockCall(() => mockEvaluate(input, mockNames), 400)
  const names = await competencyNames()
  const response = await request<BackendEvaluationResponse>(
    '/evaluations/evaluate',
    postJson({
      evaluation_type: 'PERIODIC_EVALUATION',
      form_type: input.form === 'B' ? 'FORM_B' : 'FORM_C',
      oceny_czastkowe: toCriterionScores(input.decisions, names),
      uzasadnienie: input.justification_draft || null,
    }),
  )
  return fromBackendEvaluation(response)
}

/* --- Asystent ---------------------------------------------------------------------------- */

/** Odpowiedź POST /ai-assistant (most zgodności w backendzie, kształt zbliżony do AssistantAnswer). */
interface BackendAssistantAnswer {
  mode?: AssistantMode
  status?: string
  answer?: string
  sources?: Array<{ document_title?: string; location?: string; excerpt?: string }>
}

/** Backend dokleja źródło także do treści odpowiedzi; panel pokazuje źródła osobno. */
const INLINE_SOURCE = /\s*\(Podstawa:[^()]*(?:\([^()]*\)[^()]*)*\)\.?\s*$/

export async function askAiAssistant(question: string, mode: AssistantMode): Promise<AssistantAnswer> {
  if (usesMock('askAiAssistant')) return mockDelay(mockAskAiAssistant(question, mode), 700)
  const raw = await request<BackendAssistantAnswer>('/ai-assistant', postJson({ question, mode }))
  const sources = (raw.sources ?? []).map((s) => ({
    document_title: s.document_title ?? '',
    location: s.location ?? '',
    excerpt: s.excerpt ?? '',
  }))
  const answer = (raw.answer ?? '').replace(INLINE_SOURCE, '').trim()
  const answered = raw.status === 'answered' && answer.length > 0
  return { mode, status: answered ? 'answered' : 'no_data', answer: answered ? answer : '', sources: answered ? sources : [] }
}

/* --- Terminy pierwszej oceny ------------------------------------------------------------- */

/** Fragment odpowiedzi POST /deadlines/calculate (DeadlineResponse). */
interface BackendDeadlineResponse {
  termin_rozmowy_wstepnej_max: string | null
  termin_dokonania_oceny_min: string | null
  termin_dokonania_oceny_max: string | null
  errors: string[]
  warnings: string[]
}

/** Terminy pierwszej oceny nowo zatrudnionego (rozmowa wstępna, okres na pierwszą ocenę). */
export async function getFirstAssessmentSchedule(input: FirstAssessmentScheduleInput): Promise<FirstAssessmentSchedule> {
  if (usesMock('getFirstAssessmentSchedule')) return mockCall(() => mockFirstAssessmentSchedule(input), 400)
  const r = await request<BackendDeadlineResponse>(
    '/deadlines/calculate',
    postJson({
      evaluation_type: 'FIRST_EVALUATION',
      data_nawiazania_stosunku_pracy: input.hire_date,
      // Brak daty końca: backend przyjmuje umowę na 12 miesięcy od zatrudnienia.
      data_zakonczenia_umowy: input.contract_end_date,
    }),
  )
  if (r.errors.length || !r.termin_rozmowy_wstepnej_max || !r.termin_dokonania_oceny_min || !r.termin_dokonania_oceny_max) {
    throw new ApiError(422, r.errors.join(' ') || 'Backend nie wyliczył terminów pierwszej oceny.')
  }
  return {
    introductory_interview_due: r.termin_rozmowy_wstepnej_max,
    first_assessment_period_start: r.termin_dokonania_oceny_min,
    first_assessment_period_end: r.termin_dokonania_oceny_max,
  }
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
  if (usesMock('listDemoUsers')) return mockDelay(mockUsers, 150)
  return request<User[]>('/auth/demo-users')
}

export async function getUser(id: string): Promise<User | null> {
  if (usesMock('getUser')) return mockDelay(mockUsers.find((u) => u.id === id) ?? null, 0)
  return request<User>(`/users/${encodeURIComponent(id)}`)
}

/** Pracownicy przypisani do zalogowanego przełożonego. */
export async function listEmployees(): Promise<Employee[]> {
  if (usesMock('listEmployees')) {
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
  if (usesMock('getEmployee')) {
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
  if (usesMock('createEmployee')) {
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

export async function listNotes(employee_id: string): Promise<Note[]> {
  if (usesMock('listNotes')) return mockDelay(ownsEmployee(employee_id) ? notes.filter((n) => n.employee_id === employee_id) : [])
  return request<Note[]>(`/employees/${encodeURIComponent(employee_id)}/notes`)
}

export async function addNote(employee_id: string, text: string): Promise<Note> {
  if (usesMock('addNote')) {
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
  if (usesMock('listJobDescriptions')) {
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
  if (usesMock('attachJobDescription')) {
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
  if (usesMock('listAssessments')) {
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
  if (usesMock('getAssessment')) {
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
  if (usesMock('createAssessmentDraft')) {
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

/** Zapisuje wersję roboczą oceny (konfiguracja, odpowiedzi, decyzje, uzasadnienie). */
export async function saveAssessmentDraft(id: string, input: AssessmentDraftInput): Promise<AssessmentDetail> {
  if (usesMock('saveAssessmentDraft')) {
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
  if (usesMock('completeAssessment')) {
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
 * Ciało POST /evaluations/pdf (EvaluationRequest) z oceny, pracownika i oceniającego.
 * Backend nie przechowuje ocen, więc dostaje cały stan arkusza; dane pochodzą z funkcji
 * getAssessment/getEmployee/getUser (makiety albo backend, zależnie od trybu).
 */
async function toPdfRequest(detail: AssessmentDetail) {
  const [employee, evaluator, names] = await Promise.all([
    getEmployee(detail.employee_id),
    (async () => {
      const userId = readSessionUserId()
      return userId ? getUser(userId) : null
    })(),
    competencyNames(),
  ])
  const first = detail.form === 'first'
  const date = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null)
  return {
    evaluation_type: first ? 'FIRST_EVALUATION' : 'PERIODIC_EVALUATION',
    form_type: first ? 'FIRST_EVAL_FORM' : `FORM_${detail.form}`,
    oceniany: {
      imie: employee?.first_name ?? '',
      nazwisko: employee?.last_name ?? '',
      komorka_organizacyjna: employee?.organizational_unit ?? '',
      stanowisko_pracy: employee?.position_title ?? '',
      data_nawiazania_stosunku_pracy: employee?.hire_date ?? null,
    },
    oceniajacy: {
      imie: evaluator?.first_name ?? '',
      nazwisko: evaluator?.last_name ?? '',
      komorka_organizacyjna: evaluator?.organizational_unit ?? '',
      stanowisko_pracy: evaluator?.job_title ?? '',
    },
    data_sporzadzenia_oceny: date(detail.completed_at),
    oceny_czastkowe: toCriterionScores(detail.decisions, names),
    uzasadnienie: detail.justification_draft.trim() || null,
  }
}

/**
 * Arkusz oceny w formacie PDF. Backend: POST /evaluations/pdf (pełny stan arkusza w ciele).
 * Makieta buduje w przeglądarce prosty dokument oznaczony jako przykład.
 */
export async function exportAssessmentPdf(id: string): Promise<Blob> {
  if (usesMock('exportAssessmentPdf')) {
    const detail = await mockCall(() => {
      const assessment = assessments.find((a) => a.id === id)
      if (!assessment || !ownsEmployee(assessment.employee_id)) throw new ApiError(403, 'Brak dostępu do oceny')
      return { ...assessment, ...contentOf(id) }
    }, 300)
    return mockAssessmentPdf(detail)
  }
  const detail = await getAssessment(id)
  if (!detail) throw new ApiError(404, 'Nie znaleziono oceny')
  return requestBlob('/evaluations/pdf', postJson(await toPdfRequest(detail)))
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
