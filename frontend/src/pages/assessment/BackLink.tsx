import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { texts } from '../../lib/texts'

export function BackLink({ to }: { to?: string }) {
  return (
    <Link
      to={to ?? '/przelozony'}
      className="mb-4 inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-ink-muted underline-offset-2 hover:text-ink hover:underline"
    >
      <ArrowLeft aria-hidden className="size-4" />
      {to ? texts.assessment.back : texts.wizard.backToList}
    </Link>
  )
}
