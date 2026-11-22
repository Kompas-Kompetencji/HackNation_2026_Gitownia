import { useEffect, useState, type ReactNode } from 'react'
import { Monitor } from 'lucide-react'
import { texts } from '../lib/texts'

/**
 * Wymaganie zadania: „System nie ma być dostępny na smartfonach”.
 * Telefon rozpoznajemy po urządzeniu (user agent / Client Hints), a nie po szerokości okna,
 * żeby zwężone okno przeglądarki na komputerze dalej działało. Tablety i komputery – bez zmian.
 */
function isSmartphone(): boolean {
  if (typeof navigator === 'undefined') return false
  const hints = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData
  if (hints?.mobile !== undefined) return hints.mobile
  const ua = navigator.userAgent
  return /iPhone|iPod|Windows Phone|Android.+Mobile|Mobile.+Firefox|BlackBerry|Opera Mini/i.test(ua)
}

export function DesktopOnly({ children }: { children: ReactNode }) {
  const [phone, setPhone] = useState(isSmartphone)
  useEffect(() => setPhone(isSmartphone()), [])
  if (!phone) return <>{children}</>
  const t = texts.desktopOnly
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Monitor aria-hidden className="size-7" />
        </span>
        <h1 className="mt-5 font-serif text-2xl font-semibold text-ink">{t.title}</h1>
        <p className="mt-3 leading-relaxed text-ink-muted">{t.body}</p>
      </div>
    </main>
  )
}
