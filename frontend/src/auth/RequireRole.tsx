import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { UserRole } from '../types'
import { useAuth } from './AuthContext'
import { FullPageStatus } from '../components/FullPageStatus'
import { ForbiddenPage } from '../pages/ForbiddenPage'
import { texts } from '../lib/texts'

/**
 * Zabezpieczenie trasy: niezalogowany trafia do logowania,
 * zalogowany z inną rolą widzi komunikat o braku dostępu (bez treści widoku).
 */
export function RequireRole({ role, children }: { role: UserRole; children: ReactNode }) {
  const { user, restoring } = useAuth()
  const location = useLocation()

  if (restoring) return <FullPageStatus message={texts.common.loading} />
  if (!user) return <Navigate to="/logowanie" replace state={{ from: location.pathname }} />
  if (user.role !== role) return <ForbiddenPage />
  return <>{children}</>
}
