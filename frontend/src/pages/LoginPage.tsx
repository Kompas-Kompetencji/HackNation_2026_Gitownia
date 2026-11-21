import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { CircleAlert, LoaderCircle } from 'lucide-react'
import { listDemoUsers, USE_MOCKS } from '../lib/api'
import { texts } from '../lib/texts'
import { homePathFor, useAuth } from '../auth/AuthContext'
import { CompassMark } from '../components/CompassMark'
import type { User } from '../types'

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; users: User[] }

export function LoginPage() {
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showError, setShowError] = useState(false)

  useEffect(() => {
    let active = true
    listDemoUsers()
      .then((users) => active && setState({ kind: 'ready', users }))
      .catch(() => active && setState({ kind: 'error' }))
    return () => {
      active = false
    }
  }, [])

  if (user) return <Navigate to={homePathFor(user.role)} replace />

  const from = (location.state as { from?: string } | null)?.from

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (state.kind !== 'ready') return
    const chosen = state.users.find((u) => u.id === selectedId)
    if (!chosen) {
      setShowError(true)
      return
    }
    signIn(chosen)
    const home = homePathFor(chosen.role)
    navigate(from && from.startsWith(home) ? from : home, { replace: true })
  }

  const supervisors = state.kind === 'ready' ? state.users.filter((u) => u.role === 'supervisor') : []
  const hr = state.kind === 'ready' ? state.users.filter((u) => u.role === 'hr') : []

  return (
    <div className="grid min-h-screen grid-cols-[minmax(420px,5fr)_7fr]">
      <aside className="relative flex flex-col justify-between overflow-hidden bg-accent px-14 py-12 text-accent-ink">
        <div className="flex items-center gap-3">
          <CompassMark className="size-8" />
          <span className="font-medium">{texts.app.name}</span>
        </div>
        <div className="relative z-10 max-w-md">
          <p className="font-serif text-[2.75rem] leading-[1.1] font-semibold tracking-[-0.015em]">
            {texts.login.claim}
          </p>
          <p className="mt-6 max-w-sm text-[1.0625rem] leading-relaxed text-white/80">{texts.login.claimBody}</p>
        </div>
        <p className="text-sm text-white/70">{texts.app.institution}</p>
        <CompassMark
          aria-hidden
          className="pointer-events-none absolute -right-40 -bottom-40 size-[34rem] text-white/[0.07]"
        />
      </aside>

      <main id="tresc" className="flex items-center px-16 py-12">
        <form onSubmit={handleSubmit} className="w-full max-w-xl" noValidate>
          <h1 className="font-serif text-display font-semibold text-ink">{texts.login.title}</h1>
          <p className="mt-3 text-ink-muted">{texts.login.lead}</p>

          <div className="mt-8">
            {state.kind === 'loading' && (
              <p role="status" className="flex items-center gap-2 text-ink-muted">
                <LoaderCircle aria-hidden className="size-4 animate-spin" />
                {texts.login.loading}
              </p>
            )}
            {state.kind === 'error' && (
              <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-soft p-4 text-danger">
                <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                {texts.login.loadError}
              </p>
            )}
            {state.kind === 'ready' && (
              <>
                <AccountGroup
                  legend={texts.login.groupSupervisors}
                  users={supervisors}
                  selectedId={selectedId}
                  onSelect={(id) => {
                    setSelectedId(id)
                    setShowError(false)
                  }}
                  describedBy={showError ? 'blad-konta' : undefined}
                />
                <AccountGroup
                  legend={texts.login.groupHr}
                  users={hr}
                  selectedId={selectedId}
                  onSelect={(id) => {
                    setSelectedId(id)
                    setShowError(false)
                  }}
                  describedBy={showError ? 'blad-konta' : undefined}
                />
                {showError && (
                  <p id="blad-konta" role="alert" className="mt-3 flex items-center gap-2 text-sm text-danger">
                    <CircleAlert aria-hidden className="size-4" />
                    {texts.login.chooseAccount}
                  </p>
                )}
              </>
            )}
          </div>

          <button
            type="submit"
            disabled={state.kind !== 'ready'}
            className="mt-8 w-full rounded-md bg-accent px-5 py-3 font-medium text-accent-ink transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {texts.login.signIn}
          </button>

          <p className="mt-6 text-sm text-ink-faint">
            {texts.login.demoNotice}
            {USE_MOCKS && <> {texts.login.mockNotice}</>}
          </p>
        </form>
      </main>
    </div>
  )
}

function AccountGroup({
  legend,
  users,
  selectedId,
  onSelect,
  describedBy,
}: {
  legend: string
  users: User[]
  selectedId: string | null
  onSelect: (id: string) => void
  describedBy?: string
}) {
  if (users.length === 0) return null
  return (
    <fieldset className="mt-6 first:mt-0" aria-describedby={describedBy}>
      <legend className="mb-2 text-sm font-medium text-ink-muted">{legend}</legend>
      <div className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
        {users.map((u) => {
          const checked = u.id === selectedId
          return (
            <label
              key={u.id}
              className={`flex cursor-pointer items-start gap-4 px-4 py-3.5 transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-accent ${
                checked ? 'bg-accent-soft' : 'hover:bg-sunken'
              }`}
            >
              <input
                type="radio"
                name="account"
                value={u.id}
                checked={checked}
                onChange={() => onSelect(u.id)}
                className="mt-1 size-4 accent-accent focus-visible:outline-none"
              />
              <span className="min-w-0">
                <span className="block font-medium text-ink">
                  {u.first_name} {u.last_name}
                </span>
                <span className="block text-sm text-ink-muted">{u.job_title}</span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
