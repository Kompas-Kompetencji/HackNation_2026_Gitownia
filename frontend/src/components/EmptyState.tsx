import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-start gap-4 rounded-md border border-dashed border-line-strong bg-surface/60 px-6 py-8">
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-accent" />
      <div>
        <p className="font-medium text-ink">{title}</p>
        <p className="mt-1 max-w-prose text-ink-muted">{body}</p>
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  )
}
