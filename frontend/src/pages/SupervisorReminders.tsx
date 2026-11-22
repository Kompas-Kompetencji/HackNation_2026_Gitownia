import { useCallback, useEffect, useMemo, useState } from 'react'
import { BellRing, ChevronDown, X } from 'lucide-react'
import { Button } from '../components/ui'
import { listReminders } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { readSessionUserId } from '../lib/session'
import { texts } from '../lib/texts'
import type { Reminder } from '../types'

const t = texts.supervisorHome.reminders
const DAYS = 14
const VISIBLE = 3

/** Zamknięte przypomnienia zapamiętane tylko w tej przeglądarce (nie w bazie). */
function storageKey(): string {
  return `kompas.zamkniete-przypomnienia.${readSessionUserId() ?? 'anonim'}`
}

function readDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey())
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function writeDismissed(ids: Set<string>) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify([...ids]))
  } catch {
    /* tryb prywatny albo zablokowany magazyn: zamknięcie działa do odświeżenia strony */
  }
}

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; data: Reminder[] }

/**
 * Pasek „Przypomnienie od kadr” nad listą pracowników: przypomnienia z ostatnich 14 dni, najnowsze pierwsze,
 * trzy widoczne, reszta po rozwinięciu. Bez przypomnień nic się nie wyświetla.
 */
export function SupervisorReminders() {
  const [state, setState] = useState<Load>({ kind: 'loading' })
  const [dismissed, setDismissed] = useState<Set<string>>(readDismissed)
  const [showAll, setShowAll] = useState(false)
  const [announcement, setAnnouncement] = useState('')

  const load = useCallback(() => {
    setState({ kind: 'loading' })
    listReminders()
      .then((data) => setState({ kind: 'ready', data }))
      .catch(() => setState({ kind: 'error' }))
  }, [])

  useEffect(load, [load])

  const recent = useMemo(() => {
    if (state.kind !== 'ready') return []
    const since = Date.now() - DAYS * 24 * 60 * 60 * 1000
    return state.data
      .filter((r) => new Date(r.created_at).getTime() >= since && !dismissed.has(r.id))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }, [state, dismissed])

  function dismiss(id: string) {
    const next = new Set(dismissed)
    next.add(id)
    writeDismissed(next)
    setDismissed(next)
    setAnnouncement(t.dismissed)
  }

  if (state.kind === 'error') {
    return (
      <p className="mb-4 flex items-center gap-3 text-sm text-ink-muted">
        {t.error}
        <Button variant="quiet" onClick={load}>
          {texts.common.retry}
        </Button>
      </p>
    )
  }

  const shown = showAll ? recent : recent.slice(0, VISIBLE)
  const hidden = recent.length - VISIBLE

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      {recent.length > 0 && (
        <section aria-labelledby="przypomnienia-kadr" className="mb-6 rounded-md border border-warning/35 bg-warning-soft/60">
          <h2 id="przypomnienia-kadr" className="flex items-center gap-2 px-5 pt-3.5 text-sm font-semibold text-warning">
            <BellRing aria-hidden className="size-4" />
            {t.title}
            {recent.length > 1 && <span className="font-normal text-ink-muted">({recent.length})</span>}
          </h2>
          <ul className="divide-y divide-warning/20">
            {shown.map((r) => (
              <li key={r.id} className="flex items-start gap-4 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-ink-muted tabular-nums">
                    {t.meta(formatDateTime(r.created_at), r.author_name)}
                  </p>
                  <p className="mt-1 max-w-prose text-sm whitespace-pre-line text-ink">{r.message}</p>
                  {r.employee_names.length > 0 && (
                    <p className="mt-1.5 text-sm text-ink">
                      <span className="text-ink-muted">{t.employees}: </span>
                      {r.employee_names.filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
                <Button
                  variant="secondary"
                  className="shrink-0 px-2.5 py-1 text-sm active:scale-[0.97]"
                  onClick={() => dismiss(r.id)}
                  aria-label={t.dismissLabel(formatDateTime(r.created_at))}
                >
                  <X aria-hidden className="size-4" />
                  {t.dismiss}
                </Button>
              </li>
            ))}
          </ul>
          {hidden > 0 && (
            <div className="border-t border-warning/20 px-5 py-2">
              <button
                type="button"
                aria-expanded={showAll}
                onClick={() => setShowAll((v) => !v)}
                className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
              >
                <ChevronDown aria-hidden className={`size-4 transition-transform duration-150 ease-out ${showAll ? 'rotate-180' : ''}`} />
                {showAll ? t.showLess : t.showMore(hidden)}
              </button>
            </div>
          )}
        </section>
      )}
    </>
  )
}
