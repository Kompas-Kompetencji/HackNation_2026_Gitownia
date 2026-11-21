import { Link } from 'react-router-dom'
import { homePathFor, useAuth } from '../auth/AuthContext'
import { texts } from '../lib/texts'

export function NotFoundPage() {
  const { user } = useAuth()
  return (
    <main id="tresc" className="mx-auto max-w-xl px-8 py-24">
      <h1 className="font-serif text-display font-semibold text-ink">{texts.routes.notFoundTitle}</h1>
      <p className="mt-3 text-ink-muted">{texts.routes.notFoundBody}</p>
      <Link
        to={user ? homePathFor(user.role) : '/logowanie'}
        className="mt-6 inline-flex rounded-md bg-accent px-4 py-2 font-medium text-accent-ink hover:bg-accent-hover"
      >
        {texts.routes.backHome}
      </Link>
    </main>
  )
}
