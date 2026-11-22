/**
 * Panel kadr: zasady monitorowania terminów (jedno miejsce w kodzie; opis w docs/etap-6-panel-kadr.md).
 *
 * Korzysta wyłącznie z danych, które backend naprawdę zwraca kadrom: statusu pracownika
 * (`assessment_overdue`, `assessment_due_soon` – próg 30 dni liczy backend), terminu
 * `next_assessment_due`, listy ocen (status i termin, bez treści) oraz przypomnień.
 * Frontend nie wylicza terminów ani nie dodaje własnych reguł prawnych.
 */
import { isFirstAssessmentDone } from './employee'
import type { AssessmentKind, AssessmentResult, AssessmentSummary, EmployeeMonitoring, Reminder } from '../types'

/** Stan procesu oceny pracownika w tabeli kadr. */
export type ProcessStatus = 'not_started' | 'in_progress' | 'completed'

/** Powód, dla którego pracownik trafia do sekcji „Wymaga uwagi”. */
export type AttentionReason = 'overdue' | 'due_soon' | 'not_started_near_due'

export interface MonitoringRow {
  employee: EmployeeMonitoring
  employeeName: string
  kind: AssessmentKind
  process: ProcessStatus
  /** Termin do wyświetlenia (po zakończonej pierwszej ocenie brak – jak u przełożonego). */
  due: string | null
  overdue: boolean
  dueSoon: boolean
  result: AssessmentResult | null
  /** Oceny pracownika (tylko status i terminy), najnowsze pierwsze. */
  assessments: AssessmentSummary[]
  reminders: Reminder[]
  lastReminder: Reminder | null
  attention: AttentionReason[]
}

export interface SupervisorAttention {
  supervisorId: string
  supervisorName: string
  unit: string
  overdueCount: number
  dueSoonCount: number
  nearestDue: string | null
  lastReminder: Reminder | null
  /** Pracownicy wymagający uwagi, najpilniejsi pierwsi. */
  rows: MonitoringRow[]
  /** Wszyscy pracownicy przełożonego (do wyboru w oknie przypomnienia). */
  allRows: MonitoringRow[]
}

/**
 * Stan procesu z listy ocen: szkic albo „czeka na rozmowę” = w toku; brak otwartej oceny i zapisany
 * wynik = zakończona; w pozostałych przypadkach nierozpoczęta.
 */
function processStatus(employee: EmployeeMonitoring, assessments: AssessmentSummary[]): ProcessStatus {
  const open = assessments.filter((a) => a.status !== 'completed')
  if (open.some((a) => a.status === 'draft' || a.status === 'awaiting_interview')) return 'in_progress'
  if (open.length === 0 && employee.last_assessment_result != null) return 'completed'
  return 'not_started'
}

/**
 * Zasady „Wymaga uwagi”:
 * 1. po terminie – backend oznaczył pracownika jako `assessment_overdue`;
 * 2. termin w ciągu 30 dni – backend oznaczył pracownika jako `assessment_due_soon`;
 * 3. ocena nierozpoczęta mimo bliskiego terminu – warunek 1 albo 2 i brak rozpoczętej oceny (szkicu).
 */
export function attentionReasons(row: Pick<MonitoringRow, 'overdue' | 'dueSoon' | 'process'>): AttentionReason[] {
  const out: AttentionReason[] = []
  if (row.overdue) out.push('overdue')
  if (row.dueSoon) out.push('due_soon')
  if ((row.overdue || row.dueSoon) && row.process === 'not_started') out.push('not_started_near_due')
  return out
}

const byNewest = (a: Reminder, b: Reminder) => b.created_at.localeCompare(a.created_at)

export function buildRows(
  employees: EmployeeMonitoring[],
  assessments: AssessmentSummary[],
  reminders: Reminder[],
): MonitoringRow[] {
  return employees.map((employee) => {
    const own = assessments
      .filter((a) => a.employee_id === employee.id)
      .sort((a, b) => (b.completed_at ?? b.due_date).localeCompare(a.completed_at ?? a.due_date))
    const process = processStatus(employee, own)
    const firstDone = isFirstAssessmentDone(employee)
    const overdue = employee.status === 'assessment_overdue' && !firstDone
    const dueSoon = employee.status === 'assessment_due_soon' && !firstDone
    const mine = reminders.filter((r) => r.employee_ids.includes(employee.id)).sort(byNewest)
    const base = {
      employee,
      employeeName: `${employee.first_name} ${employee.last_name}`,
      kind: employee.assessment_kind,
      process,
      due: firstDone ? null : employee.next_assessment_due,
      overdue,
      dueSoon,
      result: employee.last_assessment_result,
      assessments: own,
      reminders: mine,
      lastReminder: mine[0] ?? null,
    }
    return { ...base, attention: attentionReasons(base) }
  })
}

/** Grupy „Wymaga uwagi” według przełożonych; najpierw ci z największą liczbą spraw po terminie. */
export function buildAttention(
  rows: MonitoringRow[],
  reminders: Reminder[],
  supervisorUnits: Map<string, string>,
): SupervisorAttention[] {
  const groups = new Map<string, MonitoringRow[]>()
  for (const row of rows) {
    const id = row.employee.supervisor_id
    groups.set(id, [...(groups.get(id) ?? []), row])
  }
  const out: SupervisorAttention[] = []
  for (const [supervisorId, allRows] of groups) {
    const flagged = allRows.filter((r) => r.attention.length > 0)
    if (flagged.length === 0) continue
    flagged.sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.due ?? '9999').localeCompare(b.due ?? '9999'))
    const dues = flagged.map((r) => r.due).filter((d): d is string => d != null).sort()
    const units = [...new Set(allRows.map((r) => r.employee.organizational_unit).filter(Boolean))]
    out.push({
      supervisorId,
      supervisorName: allRows[0].employee.supervisor_name,
      unit: supervisorUnits.get(supervisorId) || units.join(', '),
      overdueCount: flagged.filter((r) => r.overdue).length,
      dueSoonCount: flagged.filter((r) => r.dueSoon).length,
      nearestDue: dues[0] ?? null,
      lastReminder: reminders.filter((r) => r.supervisor_id === supervisorId).sort(byNewest)[0] ?? null,
      rows: flagged,
      allRows,
    })
  }
  return out.sort(
    (a, b) =>
      b.overdueCount - a.overdueCount ||
      (a.nearestDue ?? '9999').localeCompare(b.nearestDue ?? '9999') ||
      a.supervisorName.localeCompare(b.supervisorName, 'pl'),
  )
}

/** Ostatnie przypomnienie dla przełożonego (do ostrzeżenia o dublecie). */
export function lastReminderFor(reminders: Reminder[], supervisorId: string): Reminder | null {
  return reminders.filter((r) => r.supervisor_id === supervisorId).sort(byNewest)[0] ?? null
}

/** Przypomnienie wysłane w ciągu ostatnich 24 godzin (okno wymaga wtedy potwierdzenia). */
export function isRecent(reminder: Reminder | null, now = Date.now()): boolean {
  return reminder != null && now - new Date(reminder.created_at).getTime() < 24 * 60 * 60 * 1000
}
