/**
 * Sesja demonstracyjna: przechowuje identyfikator zalogowanego użytkownika
 * w sessionStorage (karta przeglądarki). Docelowo zastąpi ją logowanie z backendu.
 */
const KEY = 'kompas.user_id'
const TOKEN_KEY = 'kompas.token'

/** Token dostępu (JWT z POST /auth/login); w trybie makiet nie ma tokenu. */
export function readSessionToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function writeSessionToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    /* brak sessionStorage */
  }
}

export function readSessionUserId(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function writeSessionUserId(userId: string | null): void {
  try {
    if (userId) sessionStorage.setItem(KEY, userId)
    else sessionStorage.removeItem(KEY)
  } catch {
    /* brak dostępu do sessionStorage: sesja działa tylko do odświeżenia strony */
  }
}
