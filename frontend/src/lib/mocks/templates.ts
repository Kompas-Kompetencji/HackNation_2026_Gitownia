import type { AssessmentTemplate, EmployeeForm } from '../../types'

/**
 * Reguły arkuszy B i C (§ 4 rozporządzenia z 2016 r., backend/app/core/config.py).
 * Trzymane w makiecie, bo frontend nie powinien ich znać: zwraca je getAssessmentTemplate.
 * C01 Rzetelność, C02 Komunikacja, C03 Wykorzystywanie wiedzy, C04 Organizacja pracy,
 * C06 Współpraca, C13 Zarządzanie ludźmi, C14 Podejmowanie decyzji i odpowiedzialność.
 */
export const mockAssessmentTemplates: Record<EmployeeForm, AssessmentTemplate> = {
  C: { form: 'C', mandatory_competency_ids: ['C03', 'C01', 'C04', 'C06', 'C02'], max_additional: 3 },
  // Pierwsza ocena (§ 7 rozporządzenia z 2015 r.): rzetelność, wiedza, organizacja pracy, komunikacja, współpraca.
  first: { form: 'first', mandatory_competency_ids: ['C01', 'C03', 'C04', 'C02', 'C06'], max_additional: 0 },
  B: { form: 'B', mandatory_competency_ids: ['C13', 'C14', 'C04', 'C06', 'C02'], max_additional: 3 },
}
