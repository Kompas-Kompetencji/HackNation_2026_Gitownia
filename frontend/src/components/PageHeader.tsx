import type { ReactNode } from 'react'

/** Nagłówek ekranu: tytuł szeryfowy (jedyne miejsce z czcionką szeryfową poza logowaniem). */
export function PageHeader({ title, lead, actions }: { title: string; lead?: string; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex items-end justify-between gap-6 border-b border-line pb-5">
      <div className="max-w-2xl">
        <h1 className="font-serif text-display font-semibold tracking-[-0.01em] text-ink">{title}</h1>
        {lead && <p className="mt-2 text-ink-muted">{lead}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </header>
  )
}
