import type { SVGProps } from 'react'

/** Znak aplikacji: róża wiatrów rysowana jedną linią. */
export function CompassMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <circle cx="32" cy="32" r="29" />
      <circle cx="32" cy="32" r="21" strokeWidth="1" />
      <path d="M32 6 L37 32 L32 58 L27 32 Z" fill="currentColor" fillOpacity="0.9" strokeLinejoin="round" />
      <path d="M6 32 L32 28 L58 32 L32 36 Z" strokeLinejoin="round" />
    </svg>
  )
}
