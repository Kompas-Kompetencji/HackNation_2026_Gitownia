import type { Employee } from '../types'

/**
 * Pierwsza ocena zakończona (pracownik na ścieżce pierwszej oceny ma już wynik).
 * Backend nie przenosi wtedy pracownika na ścieżkę okresową, a jako „następny termin” podaje
 * termin oceny okresowej (+24 albo +6 miesięcy), który nie pasuje do pierwszej oceny.
 */
export function isFirstAssessmentDone(e: Pick<Employee, 'assessment_kind' | 'last_assessment_result'>): boolean {
  return e.assessment_kind === 'first' && e.last_assessment_result != null
}

/** Termin do wyświetlenia: po zakończonej pierwszej ocenie żadnego (dalsze kroki wynikają z przepisów). */
export function displayedNextDue(e: Employee): string | null {
  return isFirstAssessmentDone(e) ? null : e.next_assessment_due
}
