import { useState } from 'react'
import { CircleAlert, FileSpreadsheet, LoaderCircle } from 'lucide-react'
import { Button } from '../../components/ui'
import { exportAssessments } from '../../lib/api'
import { downloadBlob } from '../../lib/download'
import { texts } from '../../lib/texts'

const t = texts.integrations

/** Eksport statusów, terminów i wyników ocen dla systemu kadrowego (np. QNT) – bez treści ocen. */
export function ExportActions() {
  const [working, setWorking] = useState<'csv' | 'json' | null>(null)
  const [error, setError] = useState(false)

  async function run(format: 'csv' | 'json') {
    setWorking(format)
    setError(false)
    try {
      downloadBlob(await exportAssessments(format), `oceny-eksport.${format}`)
    } catch {
      setError(true)
    } finally {
      setWorking(null)
    }
  }

  return (
    <div className="text-right">
      <p className="mb-1.5 text-xs font-medium text-ink-muted" title={t.exportHint}>{t.exportTitle}</p>
      <div className="flex justify-end gap-2">
        {(['csv', 'json'] as const).map((f) => (
          <Button key={f} variant="secondary" className="py-1.5 text-sm" disabled={working !== null} onClick={() => void run(f)} title={t.exportHint}>
            {working === f ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <FileSpreadsheet aria-hidden className="size-4" />}
            {f === 'csv' ? t.exportCsv : t.exportJson}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-1.5 flex items-center justify-end gap-1.5 text-sm text-danger">
          <CircleAlert aria-hidden className="size-4" />
          {t.exportError}
        </p>
      )}
    </div>
  )
}
