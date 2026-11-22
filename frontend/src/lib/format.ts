/**
 * Formatowanie do wyświetlania (bez reguł prawnych: terminy wylicza backend).
 */
import { texts } from './texts'

const dateFormatter = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
const dateTimeFormatter = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** "2026-12-09" → "9 grudnia 2026". */
export function formatDate(iso: string): string {
  return dateFormatter.format(parseDate(iso))
}

export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso))
}

/** Liczba dni kalendarzowych od dziś do daty (ujemna = po terminie). */
export function daysUntil(iso: string, today = new Date()): number {
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const d = parseDate(iso)
  const end = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((end - start) / 86_400_000)
}

export function formatRelativeDue(iso: string): string {
  const n = daysUntil(iso)
  if (n === 0) return texts.dueRelative.today
  return n > 0 ? texts.dueRelative.inDays(n) : texts.dueRelative.daysAgo(-n)
}

/** Dzisiejsza data jako "RRRR-MM-DD" w strefie lokalnej (do atrybutu max pola daty). */
export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseDate(iso: string): Date {
  // Sama data ("RRRR-MM-DD") jako data lokalna, żeby nie przesuwała się o strefę czasową.
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function fullName(p: { first_name: string; last_name: string }): string {
  return `${p.first_name} ${p.last_name}`
}
