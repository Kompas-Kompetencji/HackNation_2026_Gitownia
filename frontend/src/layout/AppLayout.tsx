import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { LogOut, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { homePathFor, useAuth } from '../auth/AuthContext'
import { texts } from '../lib/texts'
import { CompassMark } from '../components/CompassMark'
import { AssistantPanel, type AssistantContext, type AssistantRequest } from '../assistant/AssistantPanel'

const PANEL_KEY = 'kompas.assistant_open'

function readPanelPreference(): boolean {
  try {
    return localStorage.getItem(PANEL_KEY) !== 'false'
  } catch {
    return true
  }
}

/**
 * Wspólny układ ekranów po zalogowaniu.
 * withAssistant=true → kolumna główna ok. 70% i prawy panel asystenta ok. 30% (można go ukryć).
 */
export function AppLayout({
  children,
  withAssistant = false,
  assistantContext,
  assistantRequest,
}: {
  children: ReactNode
  withAssistant?: boolean
  /** Kontekst dla asystenta (np. pracownik otwarty w panelu). */
  assistantContext?: AssistantContext
  /** Pytanie wysłane do asystenta z ekranu; panel otwiera się, jeśli był ukryty. */
  assistantRequest?: AssistantRequest
}) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [assistantOpen, setAssistantOpen] = useState(readPanelPreference)

  useEffect(() => {
    try {
      localStorage.setItem(PANEL_KEY, String(assistantOpen))
    } catch {
      /* preferencja tylko do odświeżenia strony */
    }
  }, [assistantOpen])

  const showAssistant = withAssistant && assistantOpen

  useEffect(() => {
    if (assistantRequest) setAssistantOpen(true)
  }, [assistantRequest])

  function handleSignOut() {
    signOut()
    navigate('/logowanie', { replace: true })
  }

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#tresc"
        className="sr-only z-50 rounded-md bg-accent px-4 py-2 text-accent-ink focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        {texts.app.skipToContent}
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="flex h-16 items-center gap-10 px-8">
          <NavLink to={user ? homePathFor(user.role) : '/'} className="flex items-center gap-2.5 text-accent">
            <CompassMark aria-hidden className="size-7" />
            <span className="font-semibold text-ink">{texts.app.name}</span>
          </NavLink>

          <nav aria-label={texts.nav.label} className="flex h-full items-stretch gap-1">
            {user?.role === 'supervisor' && <TopNavLink to="/przelozony">{texts.nav.supervisorHome}</TopNavLink>}
            {user?.role === 'hr' && <TopNavLink to="/kadry">{texts.nav.hrHome}</TopNavLink>}
          </nav>

          <div className="ml-auto flex items-center gap-6">
            {withAssistant && (
              <button
                type="button"
                onClick={() => setAssistantOpen((v) => !v)}
                aria-expanded={assistantOpen}
                aria-controls="panel-asystenta"
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-ink-muted transition-colors duration-150 hover:bg-sunken hover:text-ink"
              >
                {assistantOpen ? (
                  <PanelRightClose aria-hidden className="size-4" />
                ) : (
                  <PanelRightOpen aria-hidden className="size-4" />
                )}
                {assistantOpen ? texts.nav.hideAssistant : texts.nav.showAssistant}
              </button>
            )}

            {user && (
              <div className="flex items-center gap-4 border-l border-line pl-6">
                <div className="text-right leading-tight">
                  <p className="text-sm font-medium text-ink">
                    {user.first_name} {user.last_name}
                  </p>
                  <p className="text-xs text-ink-muted">{texts.roles[user.role]}</p>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm text-ink transition-colors duration-150 hover:border-line-strong hover:bg-sunken"
                >
                  <LogOut aria-hidden className="size-4" />
                  {texts.nav.signOut}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className={`flex-1 ${showAssistant ? 'grid grid-cols-[minmax(0,7fr)_minmax(0,3fr)]' : ''}`}>
        <main id="tresc" tabIndex={-1} className="min-w-0 px-10 py-10 focus:outline-none">
          <div className={showAssistant ? 'max-w-5xl' : 'mx-auto max-w-6xl'}>{children}</div>
        </main>
        {/* Panel zostaje zamontowany po ukryciu, żeby nie tracić historii rozmowy. */}
        {withAssistant && <AssistantPanel id="panel-asystenta" hidden={!assistantOpen} context={assistantContext} request={assistantRequest} />}
      </div>
    </div>
  )
}

function TopNavLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center border-b-2 px-3 text-sm font-medium transition-colors duration-150 ${
          isActive ? 'border-accent text-ink' : 'border-transparent text-ink-muted hover:text-ink'
        }`
      }
    >
      {children}
    </NavLink>
  )
}
