import { ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { homePathFor, useAuth } from '../auth/AuthContext'
import { texts } from '../lib/texts'
import { AppLayout } from '../layout/AppLayout'
import { PageHeader } from '../components/PageHeader'

export function ForbiddenPage() {
  const { user } = useAuth()
  const home = user ? homePathFor(user.role) : '/logowanie'

  return (
    <AppLayout>
      <PageHeader title={texts.routes.forbiddenTitle} />
      <div className="flex max-w-xl items-start gap-4 rounded-md border border-line bg-surface p-6">
        <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
        <div>
          <p className="text-ink">{texts.routes.forbiddenBody}</p>
          <Link
            to={home}
            className="mt-4 inline-flex rounded-md bg-accent px-4 py-2 font-medium text-accent-ink transition-colors hover:bg-accent-hover"
          >
            {texts.routes.backHome}
          </Link>
        </div>
      </div>
    </AppLayout>
  )
}
