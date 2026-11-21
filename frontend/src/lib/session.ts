/**
 * Sesja demonstracyjna: przechowuje identyfikator zalogowanego użytkownika
 * w sessionStorage (karta przeglądarki). Docelowo zastąpi ją logowanie z backendu.
 */
const KEY = 'kompas.user_id'

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
