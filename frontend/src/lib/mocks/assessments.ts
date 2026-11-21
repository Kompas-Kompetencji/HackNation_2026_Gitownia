import type {
  AssessmentDetail,
  AssessmentForm,
  AssessmentResult,
  AssessmentSummary,
  CriterionDecision,
  EmployeeForm,
  Level,
} from '../../types'
import { mockEvaluate } from './score'
import { mockAssessmentTemplates } from './templates'

const SUP1 = 'Halina Zawadzka-Nowicka'
const SUP2 = 'Tomasz Kędzierski'

/** Zakończona ocena z przeszłości (historia ocen). */
function done(
  id: string,
  employee_id: string,
  employee_name: string,
  form: EmployeeForm,
  completed: string,
  result: AssessmentResult,
): AssessmentSummary {
  return {
    id,
    employee_id,
    employee_name,
    supervisor_name: SUP1,
    kind: form === 'first' ? 'first' : 'periodic',
    form,
    status: 'completed',
    started_at: `${completed}T08:00:00Z`,
    completed_at: `${completed}T14:00:00Z`,
    due_date: completed,
    result,
  }
}

/**
 * Oceny przykładowe. Sytuacje pracowników:
 * - Joanna Pietrzyk: termin wkrótce, szkic oceny okresowej w toku, historia z oceną negatywną,
 * - Grzegorz Łuczak: ocena okresowa zakończona w 2025 r.,
 * - Małgorzata Wróbel-Sośnicka: termin oceny okresowej przekroczony, brak aktualnego opisu stanowiska,
 * - Paweł Żmijewski (przełożony 2): pierwsza ocena nierozpoczęta, brak historii.
 */
export const mockAssessments: AssessmentSummary[] = [
  {
    id: 'as-001',
    employee_id: 'emp-001',
    employee_name: 'Joanna Pietrzyk',
    supervisor_name: SUP1,
    kind: 'periodic',
    form: 'C',
    status: 'draft',
    started_at: '2026-11-12T08:00:00Z',
    completed_at: null,
    due_date: '2026-12-09',
    result: null,
  },
  done('as-101', 'emp-001', 'Joanna Pietrzyk', 'C', '2024-12-09', 'positive'),
  done('as-102', 'emp-001', 'Joanna Pietrzyk', 'C', '2022-12-12', 'negative'),
  done('as-103', 'emp-001', 'Joanna Pietrzyk', 'first', '2019-08-28', 'positive'),

  done('as-002', 'emp-002', 'Grzegorz Łuczak', 'C', '2025-05-20', 'positive'),
  done('as-201', 'emp-002', 'Grzegorz Łuczak', 'C', '2023-05-18', 'positive'),

  {
    id: 'as-003',
    employee_id: 'emp-003',
    employee_name: 'Małgorzata Wróbel-Sośnicka',
    supervisor_name: SUP1,
    kind: 'periodic',
    form: 'B',
    status: 'overdue',
    started_at: null,
    completed_at: null,
    due_date: '2026-10-14',
    result: null,
  },
  done('as-301', 'emp-003', 'Małgorzata Wróbel-Sośnicka', 'B', '2024-10-14', 'positive'),
  done('as-302', 'emp-003', 'Małgorzata Wróbel-Sośnicka', 'first', '2021-07-30', 'positive'),

  {
    id: 'as-004',
    employee_id: 'emp-004',
    employee_name: 'Paweł Żmijewski',
    supervisor_name: SUP2,
    kind: 'first',
    form: 'first',
    status: 'not_started',
    started_at: null,
    completed_at: null,
    due_date: '2027-11-14',
    result: null,
  },
]

type Content = Omit<AssessmentDetail, keyof AssessmentSummary>

export function emptyContent(): Content {
  return {
    additional_competency_ids: null,
    answers: [],
    decisions: [],
    justification_draft: '',
    last_step: null,
    updated_at: null,
    evaluation: null,
  }
}

/** Treść zakończonej oceny z historii: same decyzje (oceny sprzed wdrożenia nie mają odpowiedzi do wskaźników). */
function history(
  form: AssessmentForm,
  additional: Record<string, Level>,
  mandatoryLevels: Level[],
  justification: string,
  names: Record<string, string>,
): Content {
  const mandatory = mockAssessmentTemplates[form].mandatory_competency_ids
  const decisions: CriterionDecision[] = [
    ...mandatory.map((competency_id, i) => ({
      competency_id,
      is_mandatory: true,
      selected_level: mandatoryLevels[i],
      decision_note: '',
    })),
    ...Object.entries(additional).map(([competency_id, selected_level]) => ({
      competency_id,
      is_mandatory: false,
      selected_level,
      decision_note: '',
    })),
  ]
  return {
    ...emptyContent(),
    additional_competency_ids: Object.keys(additional),
    decisions,
    justification_draft: justification,
    evaluation: mockEvaluate(
      { form, justification_draft: justification, decisions: decisions.map((d) => ({ ...d, selected_level: d.selected_level! })) },
      names,
    ),
  }
}

/** Treść ocen (szkice i historia). Oceny bez wpisu mają pustą treść. */
export function buildMockAssessmentContent(names: Record<string, string>): Record<string, Content> {
  return {
    'as-101': history('C', { C10: 7, C07: 5 }, [5, 7, 5, 7, 5], '', names),
    'as-102': history(
      'C',
      { C10: 5 },
      [3, 1, 3, 5, 3],
      'W okresie oceny siedem z dwudziestu odpowiedzi na skargi zostało wysłanych po terminie ustawowym, bez wcześniejszej informacji o ryzyku opóźnienia. Pracownica nie skorzystała z zaplanowanego szkolenia z postępowania administracyjnego.',
      names,
    ),
    'as-002': history('C', { C07: 9, C08: 7, C09: 5 }, [7, 7, 5, 5, 7], '', names),
    'as-201': history('C', { C07: 7 }, [7, 5, 5, 5, 5], '', names),
    'as-301': history('B', { C10: 7, C11: 7 }, [5, 7, 7, 5, 5], '', names),
  }
}
