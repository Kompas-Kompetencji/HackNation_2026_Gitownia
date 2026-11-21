import type { ComponentProps, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { CircleAlert } from 'lucide-react'
import { buttonClass } from './styles'

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: keyof typeof buttonClass }) {
  return <button type="button" {...props} className={`${buttonClass[variant]} ${className}`} />
}

export function ButtonLink({ variant = 'primary', className = '', ...props }: LinkProps & { variant?: keyof typeof buttonClass }) {
  return <Link {...props} className={`${buttonClass[variant]} ${className}`} />
}

export function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1.5 text-sm text-danger">
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

export function Alert({
  tone = 'danger',
  children,
  action,
}: {
  tone?: 'danger' | 'positive'
  children: ReactNode
  action?: ReactNode
}) {
  const classes = tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-positive-soft text-positive'
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-md px-4 py-3 ${classes}`}>
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1">{children}</div>
      {action}
    </div>
  )
}
