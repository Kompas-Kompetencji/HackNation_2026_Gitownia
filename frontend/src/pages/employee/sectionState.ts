/** Stan danych jednej sekcji panelu: błąd sekcji nie wyłącza reszty panelu. */
export type SectionState<T> = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; data: T }
