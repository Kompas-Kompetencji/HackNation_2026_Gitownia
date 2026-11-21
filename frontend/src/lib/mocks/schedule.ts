import type { FirstAssessmentSchedule, FirstAssessmentScheduleInput } from '../../types'

/**
 * MAKIETA odpowiedzi backendu z terminami pierwszej oceny.
 * Prawdziwe terminy wylicza backend według przepisów; tu są tylko wiarygodnie wyglądające daty
 * (rozmowa wstępna 14 dni od zatrudnienia, okres oceny: ostatni miesiąc przed końcem umowy
 * albo piąty i szósty miesiąc pracy, gdy umowa nie ma daty końca).
 */
export function mockFirstAssessmentSchedule(input: FirstAssessmentScheduleInput): FirstAssessmentSchedule {
  const hire = parse(input.hire_date)
  const end = input.contract_end_date ? parse(input.contract_end_date) : addMonths(hire, 6)
  return {
    introductory_interview_due: iso(addDays(hire, 14)),
    first_assessment_period_start: iso(addMonths(end, -1)),
    first_assessment_period_end: iso(addDays(end, -1)),
  }
}

function parse(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000)
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d)
  r.setUTCMonth(r.getUTCMonth() + n)
  return r
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}
