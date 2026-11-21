import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { BookOpenText, CircleAlert, FileSearch, LoaderCircle, MessagesSquare, Scale } from 'lucide-react'
import { askAiAssistant } from '../lib/api'
import { texts } from '../lib/texts'
import type { AssistantAnswer, AssistantMode } from '../types'

interface Exchange {
  id: string
  question: string
  state: 'pending' | 'done' | 'error'
  answer?: AssistantAnswer
}

const MODES: { mode: AssistantMode; icon: typeof Scale }[] = [
  { mode: 'formal', icon: Scale },
  { mode: 'interview', icon: MessagesSquare },
]

/** Prawy panel asystenta z przełącznikiem trybu. Każdy tryb ma osobną historię pytań. */
export function AssistantPanel({ id }: { id: string }) {
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
  const pending = exchanges.some((e) => e.state === 'pending')

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [exchanges])

  async function ask(text: string) {
    const trimmed = text.trim()
    if (!trimmed) {
      setFieldError(true)
      textareaRef.current?.focus()
      return
    }
    const askedMode = mode
    const exchangeId = crypto.randomUUID()
    setFieldError(false)
    setQuestion('')
    setHistory((h) => ({ ...h, [askedMode]: [...h[askedMode], { id: exchangeId, question: trimmed, state: 'pending' }] }))

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
      aria-label={t.regionLabel}
      className="sticky top-16 flex h-[calc(100vh-4rem)] animate-panel-in flex-col border-l border-line bg-surface"
    >
      <div className="border-b border-line px-6 pt-6 pb-5">
        <h2 className="text-title font-semibold text-ink">{t.title}</h2>

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
            <ul className="space-y-1.5">
              {t.suggestions[mode].map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => void ask(s)}
                    className="w-full rounded-md border border-line px-3 py-2 text-left text-sm text-ink transition-colors duration-150 hover:border-accent hover:bg-accent-soft"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ol className="space-y-6">
            {exchanges.map((e) => (
              <li key={e.id}>
                <p className="text-xs font-medium text-ink-faint">{t.you}</p>
                <p className="mt-0.5 font-medium text-ink">{e.question}</p>
                <div className="mt-3">
                  <ExchangeAnswer exchange={e} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-line px-6 pt-4 pb-5" noValidate>
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

function ExchangeAnswer({ exchange }: { exchange: Exchange }) {
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
      <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-sm text-danger">
        <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
        {t.error}
      </p>
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
      </div>
    )
  }

  return (
    <div>
      <p className="text-[0.9375rem] leading-relaxed text-ink">{answer.answer}</p>
      {answer.sources.map((s) => (
        <figure key={`${s.document_title}-${s.location}`} className="mt-3 border-l-2 border-accent bg-accent-soft/60 py-2 pr-3 pl-3">
          <figcaption className="flex items-start gap-2 text-xs font-medium text-accent">
            <BookOpenText aria-hidden className="mt-px size-3.5 shrink-0" />
            <span>
              {t.sourceLabel}: {s.document_title}, {s.location}
            </span>
          </figcaption>
          <blockquote className="mt-1 text-sm text-ink-muted">„{s.excerpt}"</blockquote>
        </figure>
      ))}
    </div>
  )
}
