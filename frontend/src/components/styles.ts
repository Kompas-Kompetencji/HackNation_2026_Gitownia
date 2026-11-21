/** Wspólne klasy przycisków: jeden wyraźny główny, spokojny drugorzędny. */
export const buttonClass = {
  primary:
    'inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 font-medium text-accent-ink transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60',
  secondary:
    'inline-flex items-center justify-center gap-2 rounded-md border border-line-strong bg-surface px-4 py-2.5 font-medium text-ink transition-colors duration-150 hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-60',
  quiet:
    'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-accent underline-offset-2 transition-colors duration-150 hover:underline',
} as const

/** Klasa pola tekstowego; stan błędu zmienia obramowanie. */
export function inputClass(invalid: boolean): string {
  return `block w-full rounded-md border bg-surface px-3 py-2.5 text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-0 ${
    invalid ? 'border-danger' : 'border-line-strong'
  }`
}
