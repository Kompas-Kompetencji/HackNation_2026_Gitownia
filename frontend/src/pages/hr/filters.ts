import type { ProcessStatus } from '../../lib/hrMonitoring'
import type { AssessmentKind } from '../../types'

/** Filtry tabeli „Wszystkie oceny” (sterowane też z paska „Przegląd”). */
export interface TableFilters {
  query: string
  kind: '' | AssessmentKind
  status: '' | ProcessStatus
  supervisor: string
  unit: string
  dueSoon: boolean
  overdue: boolean
}

export const EMPTY_FILTERS: TableFilters = {
  query: '',
  kind: '',
  status: '',
  supervisor: '',
  unit: '',
  dueSoon: false,
  overdue: false,
}

export function hasFilters(f: TableFilters): boolean {
  return JSON.stringify(f) !== JSON.stringify(EMPTY_FILTERS)
}
