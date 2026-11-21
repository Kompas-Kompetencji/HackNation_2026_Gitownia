import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getUser } from '../lib/api'
import { readSessionUserId, writeSessionUserId } from '../lib/session'
import type { User, UserRole } from '../types'

interface AuthState {
  user: User | null
  /** true, dopóki sesja zapisana w przeglądarce nie zostanie odczytana. */
  restoring: boolean
  signIn: (user: User) => void
  signOut: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [restoring, setRestoring] = useState(() => readSessionUserId() !== null)

  useEffect(() => {
    const id = readSessionUserId()
    if (!id) return
    let active = true
    getUser(id)
      .then((u) => {
        if (!active) return
        setUser(u)
        if (!u) writeSessionUserId(null)
      })
      .catch(() => writeSessionUserId(null))
      .finally(() => active && setRestoring(false))
    return () => {
      active = false
    }
  }, [])

  const signIn = useCallback((u: User) => {
    writeSessionUserId(u.id)
    setUser(u)
  }, [])

  const signOut = useCallback(() => {
    writeSessionUserId(null)
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, restoring, signIn, signOut }), [user, restoring, signIn, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth musi być użyte wewnątrz AuthProvider')
  return ctx
}

/** Strona startowa danej roli. */
// eslint-disable-next-line react-refresh/only-export-components
export function homePathFor(role: UserRole): string {
  return role === 'hr' ? '/kadry' : '/przelozony'
}
