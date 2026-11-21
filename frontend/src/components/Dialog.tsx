import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Okno modalne na natywnym <dialog> (pułapka fokusu i Escape od przeglądarki).
 * Escape i kliknięcie poza oknem wywołują onCancel.
 */
export function Dialog({
  open,
  title,
  children,
  actions,
  onCancel,
}: {
  open: boolean
  title: string
  children: ReactNode
  actions: ReactNode
  onCancel: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-tytul"
      onCancel={(e) => {
        e.preventDefault()
        onCancel()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onCancel()
      }}
      className="dialog m-auto w-[38rem] max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-surface p-0 text-ink shadow-raised backdrop:bg-ink/40"
    >
      <div className="px-6 pt-5 pb-6">
        <h2 id="dialog-tytul" className="text-title font-semibold">
          {title}
        </h2>
        <div className="mt-2 text-ink-muted">{children}</div>
        <div className="mt-6 flex flex-row-reverse flex-wrap gap-2">{actions}</div>
      </div>
    </dialog>
  )
}
