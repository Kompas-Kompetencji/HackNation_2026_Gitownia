import { formatDate } from '../../lib/format'
import type { MonitoringRow } from '../../lib/hrMonitoring'
import { texts } from '../../lib/texts'

const t = texts.hrHome.reminder

/** Wiersz listy w treści: pracownik, rodzaj oceny, termin i powód (bez treści oceny). */
function line(row: MonitoringRow): string {
  const reason = row.overdue
    ? 'overdue'
    : row.attention.includes('not_started_near_due')
      ? 'not_started_near_due'
      : row.dueSoon
        ? 'due_soon'
        : null
  return t.line(
    row.employeeName,
    texts.hrHome.kind[row.kind],
    row.due ? formatDate(row.due) : null,
    reason ? texts.hrHome.attention.reasons[reason] : null,
  )
}

export function defaultMessage(rows: MonitoringRow[], selected: string[]): string {
  return t.body(rows.filter((r) => selected.includes(r.employee.id)).map(line))
}

/** Gotowa wiadomość w programie pocztowym (wariant zapasowy; adresata wpisuje osoba z kadr). */
export function mailtoHref(rows: MonitoringRow[], selected: string[]): string {
  return `mailto:?subject=${encodeURIComponent(t.subject)}&body=${encodeURIComponent(defaultMessage(rows, selected))}`
}
