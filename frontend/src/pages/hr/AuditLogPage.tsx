import { useCallback, useEffect, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { AppLayout } from '../../layout/AppLayout'
import { PageHeader } from '../../components/PageHeader'
import { Alert, Button } from '../../components/ui'
import { listAuditLog } from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import { texts } from '../../lib/texts'
import type { AuditEntry } from '../../types'

const t = texts.auditLog

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; entries: AuditEntry[] }

/** Kadry/administrator: dziennik zdarzeń (rozliczalność), bez treści ocen. */
export function AuditLogPage() {
  const [state, setState] = useState<Load>({ kind: 'loading' })

  const load = useCallback(() => {
    setState({ kind: 'loading' })
    listAuditLog(300)
      .then((entries) => setState({ kind: 'ready', entries }))
      .catch(() => setState({ kind: 'error' }))
  }, [])
  useEffect(load, [load])

  return (
    <AppLayout>
      <PageHeader title={t.title} lead={t.lead} />
      {state.kind === 'loading' && (
        <p role="status" className="flex items-center gap-2 text-ink-muted">
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
          {t.loading}
        </p>
      )}
      {state.kind === 'error' && (
        <Alert action={<Button variant="secondary" className="py-1.5 text-sm" onClick={load}>{texts.common.retry}</Button>}>{t.error}</Alert>
      )}
      {state.kind === 'ready' && (
        <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-raised">
          <table className="w-full text-left text-sm">
            <thead className="bg-sunken text-ink-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t.columns.at}</th>
                <th className="px-4 py-2.5 font-medium">{t.columns.user}</th>
                <th className="px-4 py-2.5 font-medium">{t.columns.action}</th>
                <th className="px-4 py-2.5 font-medium">{t.columns.object}</th>
                <th className="px-4 py-2.5 font-medium">{t.columns.details}</th>
              </tr>
            </thead>
            <tbody>
              {state.entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-ink-muted">{t.empty}</td>
                </tr>
              )}
              {state.entries.map((e) => (
                <tr key={e.id} className="border-t border-line">
                  <td className="px-4 py-2.5 whitespace-nowrap text-ink tabular-nums">{formatDateTime(e.at)}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-ink">{e.user_name ?? '—'}</span>
                    {e.user_role && <span className="block text-ink-muted">{t.roles[e.user_role] ?? e.user_role}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-ink">{t.actions[e.action] ?? e.action}</td>
                  <td className="px-4 py-2.5 text-ink-muted">
                    {t.entities[e.entity] ?? e.entity}
                    {e.entity_id && <span className="tabular-nums"> #{e.entity_id}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-ink-muted">{e.details || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  )
}
