import { LoaderCircle } from 'lucide-react'

export function FullPageStatus({ message }: { message: string }) {
  return (
    <div role="status" className="flex min-h-screen items-center justify-center gap-3 text-ink-muted">
      <LoaderCircle aria-hidden className="size-5 animate-spin" />
      <span>{message}</span>
    </div>
  )
}
