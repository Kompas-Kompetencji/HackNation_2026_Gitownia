/** Błąd zapytania z kodem HTTP, do pokazania w stanie błędu ekranu. */
export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
