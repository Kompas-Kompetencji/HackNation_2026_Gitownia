import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import {
  BookOpenText,
  ChevronRight,
  CircleAlert,
  Eraser,
  FileSearch,
  FlaskConical,
  LoaderCircle,
  MessagesSquare,
  RotateCcw,
  Scale,
  UserRound,
} from 'lucide-react'
import { askAiAssistant, USE_MOCKS } from '../lib/api'
import { texts } from '../lib/texts'
import type { AssistantAnswer, AssistantMode } from '../types'

interface Exchange {
  id: string
  question: string
  /** Krótka treść pokazywana zamiast pełnego pytania z kontekstem. */
  label?: string
  state: 'pending' | 'done' | 'error'
  answer?: AssistantAnswer
}

const MODES: { mode: AssistantMode; icon: typeof Scale }[] = [
  { mode: 'formal', icon: Scale },
  { mode: 'interview', icon: MessagesSquare },
]

/** Gotowe pytanie: sam tekst albo krótka etykieta i pełne pytanie z kontekstem w treści. */
export type AssistantSuggestion = string | { label: string; question: string }

/** Kontekst panelu: który pracownik jest otwarty i gotowe pytania dopasowane do jego sytuacji. */
export interface AssistantContext {
  subject: string
  /** Wyjaśnienie, czego asystent nie wie (np. że nie dostaje danych pracownika). */
  note?: string
  suggestions: Record<AssistantMode, readonly AssistantSuggestion[]>
}

/** Pytanie wysłane z ekranu (np. przycisk „Przygotuj rozmowę oceniającą"). Nowe id = nowe pytanie. */
export interface AssistantRequest {
  id: string
  mode: AssistantMode
  label: string
  question: string
}

const asPair = (s: AssistantSuggestion) => (typeof s === 'string' ? { label: s, question: s } : s)

/** Prawy panel asystenta z przełącznikiem trybu. Każdy tryb ma osobną historię pytań. */
export function AssistantPanel({
  id,
  hidden = false,
  context,
  request,
}: {
  id: string
  hidden?: boolean
  context?: AssistantContext
  request?: AssistantRequest
}) {
  const t = texts.assistant
  const [mode, setMode] = useState<AssistantMode>('formal')
  const [history, setHistory] = useState<Record<AssistantMode, Exchange[]>>({ formal: [], interview: [] })
  const [question, setQuestion] = useState('')
  const [fieldError, setFieldError] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const questionId = useId()
  const errorId = useId()

  const exchanges = history[mode]
  const suggestions = context?.suggestions[mode] ?? t.suggestions[mode]
  const pending = exchanges.some((e) => e.state === 'pending')

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [exchanges])

  const handledRequest = useRef<string | null>(null)
  useEffect(() => {
    if (!request || handledRequest.current === request.id) return
    handledRequest.current = request.id
    setMode(request.mode)
    void ask(request.question, request.label, request.mode)
    // ask zależy od stanu panelu; pytanie z ekranu wysyłamy tylko raz dla danego id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  async function ask(text: string, label?: string, askedMode: AssistantMode = mode) {
    const trimmed = text.trim()
    if (!trimmed) {
      setFieldError(true)
      textareaRef.current?.focus()
      return
    }
    const exchangeId = crypto.randomUUID()
    setFieldError(false)
    if (!label) setQuestion('')
    setHistory((h) => ({
      ...h,
      [askedMode]: [...h[askedMode], { id: exchangeId, question: trimmed, label, state: 'pending' }],
    }))

    try {
      const answer = await askAiAssistant(trimmed, askedMode)
      setHistory((h) => ({
        ...h,
        [askedMode]: h[askedMode].map((e) => (e.id === exchangeId ? { ...e, state: 'done', answer } : e)),
      }))
    } catch {
      setHistory((h) => ({
        ...h,
        [askedMode]: h[askedMode].map((e) => (e.id === exchangeId ? { ...e, state: 'error' } : e)),
      }))
    }
  }

  function retry(exchange: Exchange) {
    setHistory((h) => ({ ...h, [mode]: h[mode].filter((e) => e.id !== exchange.id) }))
    void ask(exchange.question, exchange.label)
  }

  function clearConversation() {
    setHistory((h) => ({ ...h, [mode]: [] }))
    setFieldError(false)
    textareaRef.current?.focus()
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!pending) void ask(question)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (!pending) void ask(question)
    }
  }

  function handleModeKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const next: AssistantMode = mode === 'formal' ? 'interview' : 'formal'
    setMode(next)
    document.getElementById(`tryb-${next}`)?.focus()
  }

  return (
    <aside
      id={id}
      hidden={hidden}
      aria-label={t.regionLabel}
      className={`sticky top-16 h-[calc(100vh-4rem)] animate-panel-in flex-col border-l border-line bg-surface ${
        hidden ? 'hidden' : 'flex'
      }`}
    >
      <div className="border-b border-line px-6 pt-6 pb-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-title font-semibold text-ink">{t.title}</h2>
          {exchanges.length > 0 && (
            <button
              type="button"
              onClick={clearConversation}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-ink-muted transition-colors duration-150 hover:bg-sunken hover:text-ink disabled:opacity-50"
            >
              <Eraser aria-hidden className="size-4" />
              {t.clear}
            </button>
          )}
        </div>

        <div role="radiogroup" aria-label={t.modeLabel} className="mt-4 grid grid-cols-2 gap-1 rounded-md bg-sunken p-1">
          {MODES.map(({ mode: m, icon: Icon }) => {
            const active = m === mode
            return (
              <button
                key={m}
                id={`tryb-${m}`}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                onClick={() => setMode(m)}
                onKeyDown={handleModeKey}
                className={`flex items-center justify-center gap-2 rounded-[4px] px-2 py-2 text-sm font-medium transition-colors duration-150 ${
                  active ? 'bg-surface text-ink shadow-raised' : 'text-ink-muted hover:text-ink'
                }`}
              >
                <Icon aria-hidden className={`size-4 ${active ? 'text-accent' : ''}`} />
                {t.modes[m]}
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-sm leading-snug text-ink-muted">{t.modeHints[mode]}</p>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-6 py-5" aria-live="polite" aria-busy={pending}>
        {exchanges.length === 0 ? (
          <div>
            <p className="text-sm text-ink-muted">{t.emptyState}</p>
            <p className="mt-5 mb-2 text-sm font-medium text-ink">{t.suggestionsLabel}</p>
            <SuggestionList items={suggestions} disabled={pending} onPick={(s) => void ask(s.question, s.label)} />
          </div>
        ) : (
          <ol className="space-y-6">
            {exchanges.map((e) => (
              <li key={e.id}>
                <p className="text-xs font-medium text-ink-muted">{t.you}</p>
                <p className="mt-0.5 font-medium text-ink">{e.label ?? e.question}</p>
                <div className="mt-3">
                  <ExchangeAnswer exchange={e} onRetry={() => retry(e)} retryDisabled={pending} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {exchanges.length > 0 && (
        <details className="group border-t border-line px-6 py-3">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink">
            <ChevronRight aria-hidden className="size-4 transition-transform duration-150 group-open:rotate-90" />
            {t.suggestionsLabel}
          </summary>
          <div className="mt-2">
            <SuggestionList items={suggestions} disabled={pending} onPick={(s) => void ask(s.question, s.label)} />
          </div>
        </details>
      )}

      <form onSubmit={handleSubmit} className="border-t border-line px-6 pt-4 pb-5" noValidate>
        {context && (
          <div className="mb-3 rounded-sm bg-sunken px-2.5 py-1.5">
            <p className="flex items-center gap-2 text-sm text-ink">
              <UserRound aria-hidden className="size-4 shrink-0 text-ink-muted" />
              <span className="truncate">{context.subject}</span>
            </p>
            {context.note && <p className="mt-0.5 pl-6 text-xs leading-snug text-ink-muted">{context.note}</p>}
          </div>
        )}
        <label htmlFor={questionId} className="mb-1.5 block text-sm font-medium text-ink">
          {t.questionLabel}
        </label>
        <textarea
          ref={textareaRef}
          id={questionId}
          rows={3}
          value={question}
          onChange={(e) => {
            setQuestion(e.target.value)
            if (fieldError) setFieldError(false)
          }}
          onKeyDown={handleKeyDown}
          placeholder={t.placeholder[mode]}
          aria-invalid={fieldError}
          aria-describedby={fieldError ? errorId : undefined}
          className={`block w-full resize-none rounded-md border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-0 ${
            fieldError ? 'border-danger' : 'border-line-strong'
          }`}
        />
        {fieldError && (
          <p id={errorId} className="mt-1.5 flex items-center gap-1.5 text-sm text-danger">
            <CircleAlert aria-hidden className="size-4" />
            {t.emptyQuestion}
          </p>
        )}
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs leading-snug text-ink-faint">{t.disclaimer}</p>
          <button
            type="submit"
            disabled={pending}
            className="flex shrink-0 items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-colors duration-150 hover:bg-accent-hover disabled:cursor-wait disabled:opacity-60"
          >
            {pending && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
            {pending ? t.submitting : t.submit}
          </button>
        </div>
      </form>
    </aside>
  )
}

function SuggestionList({
  items,
  disabled,
  onPick,
}: {
  items: readonly AssistantSuggestion[]
  disabled: boolean
  onPick: (s: { label: string; question: string }) => void
}) {
  return (
    <ul className="space-y-1.5">
      {items.map(asPair).map((s) => (
        <li key={s.label}>
          <button
            type="button"
            onClick={() => onPick(s)}
            disabled={disabled}
            className="w-full rounded-md border border-line px-3 py-2 text-left text-sm text-ink transition-colors duration-150 hover:border-accent hover:bg-accent-soft disabled:cursor-wait disabled:opacity-60"
          >
            {s.label}
          </button>
        </li>
      ))}
    </ul>
  )
}

function ExchangeAnswer({
  exchange,
  onRetry,
  retryDisabled,
}: {
  exchange: Exchange
  onRetry: () => void
  retryDisabled: boolean
}) {
  const t = texts.assistant

  if (exchange.state === 'pending') {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-muted">
        <LoaderCircle aria-hidden className="size-4 animate-spin" />
        {t.submitting}
      </p>
    )
  }

  if (exchange.state === 'error' || !exchange.answer) {
    return (
      <div className="rounded-md bg-danger-soft px-3 py-2.5 text-sm text-danger">
        <p className="flex items-start gap-2">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t.error}
        </p>
        <button
          type="button"
          onClick={onRetry}
          disabled={retryDisabled}
          className="mt-2 ml-6 flex items-center gap-1.5 rounded-md border border-danger/40 bg-surface px-3 py-1.5 font-medium text-danger transition-colors duration-150 hover:bg-danger-soft disabled:opacity-50"
        >
          <RotateCcw aria-hidden className="size-3.5" />
          {texts.common.retry}
        </button>
      </div>
    )
  }

  const { answer } = exchange
  if (answer.status === 'no_data') {
    return (
      <div className="rounded-md border border-warning/30 bg-warning-soft px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-warning">
          <FileSearch aria-hidden className="size-4" />
          {t.noDataTitle}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-ink">{t.noDataBody}</p>
        <MockLabel />
      </div>
    )
  }

  return (
    <div>
      <p className="text-[0.9375rem] leading-relaxed whitespace-pre-line text-ink">{answer.answer}</p>
      {answer.sources.map((s) => (
        <figure key={`${s.document_title}-${s.location}`} className="mt-3 border-l-2 border-accent bg-accent-soft/60 py-2 pr-3 pl-3">
          <figcaption className="flex items-start gap-2 text-xs font-medium text-accent">
            <BookOpenText aria-hidden className="mt-px size-3.5 shrink-0" />
            <span>
              {t.sourceLabel}: {s.document_title}, {s.location}
            </span>
          </figcaption>
          <blockquote className="mt-1 text-sm text-ink-muted">„{s.excerpt}”</blockquote>
        </figure>
      ))}
      <MockLabel />
    </div>
  )
}

/** Dyskretna etykieta przy odpowiedziach z makiety; znika, gdy VITE_USE_MOCKS=false. */
function MockLabel() {
  if (!USE_MOCKS) return null
  return (
    <p className="mt-2 inline-flex items-center gap-1 text-xs text-ink-muted" title={texts.assistant.mockLabelTitle}>
      <FlaskConical aria-hidden className="size-3" />
      {texts.assistant.mockLabel}
      <span className="sr-only">: {texts.assistant.mockLabelTitle}</span>
    </p>
  )
}
