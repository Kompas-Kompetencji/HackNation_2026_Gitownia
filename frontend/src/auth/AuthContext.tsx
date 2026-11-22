import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, getUser, loginDemo, SESSION_EXPIRED_EVENT } from '../lib/api'
import { readSessionUserId, writeSessionToken, writeSessionUserId } from '../lib/session'
import type { User, UserRole } from '../types'

interface AuthState {
  user: User | null
  /** true, dopóki sesja zapisana w przeglądarce nie zostanie odczytana. */
  restoring: boolean
  /** Logowanie: backend wydaje podpisany token; błąd (np. brak połączenia) przekazuje dalej. */
  signIn: (user: User) => Promise<User>
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
      // Sesję usuwamy tylko, gdy konta naprawdę nie ma (401/404); chwilowy błąd sieci jej nie kasuje.
      .catch((error) => {
        if (error instanceof ApiError && (error.status === 401 || error.status === 404)) {
          writeSessionUserId(null)
          writeSessionToken(null)
        }
      })
      .finally(() => active && setRestoring(false))
    return () => {
      active = false
    }
  }, [])

  const signIn = useCallback(async (u: User) => {
    const { token, user: signedIn } = await loginDemo(u.id)
    writeSessionToken(token)
    writeSessionUserId(signedIn.id)
    setUser(signedIn)
    return signedIn
  }, [])

  const signOut = useCallback(() => {
    writeSessionUserId(null)
    writeSessionToken(null)
    setUser(null)
  }, [])

  // Wygasły lub odrzucony token: wylogowanie, ochrona tras przekieruje na ekran logowania.
  useEffect(() => {
    const onExpired = () => signOut()
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  }, [signOut])

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
