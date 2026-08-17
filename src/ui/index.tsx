/*
 * The component library.
 *
 * Four primitives, one file, because at this size splitting them costs more than it
 * saves. Every one takes its colours from tokens.css and forwards unknown props to the
 * underlying element, so a caller can always add an aria-* attribute we did not
 * anticipate. That last part is what makes a design system usable rather than a cage.
 */
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'

type Tone = 'default' | 'ok' | 'warn' | 'danger'

const toneVar: Record<Tone, string> = {
  default: 'var(--text)',
  ok: 'var(--ok)',
  warn: 'var(--warn)',
  danger: 'var(--danger)',
}

export function Button({
  children,
  variant = 'secondary',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }) {
  return (
    <button
      {...rest}
      style={{
        font: 'inherit',
        fontSize: 'var(--text-sm)',
        padding: 'var(--space-2) var(--space-3)',
        borderRadius: 'var(--radius)',
        cursor: rest.disabled ? 'not-allowed' : 'pointer',
        opacity: rest.disabled ? 0.5 : 1,
        border: '1px solid var(--border)',
        background: variant === 'primary' ? 'var(--accent)' : 'var(--surface-raised)',
        color: variant === 'primary' ? '#08131f' : 'var(--text)',
        ...rest.style,
      }}
    >
      {children}
    </button>
  )
}

export function Card({
  title,
  action,
  children,
  ...rest
}: HTMLAttributes<HTMLElement> & { title: string; action?: ReactNode }) {
  return (
    <section
      {...rest}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 'var(--space-4)',
        ...rest.style,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-3)',
          gap: 'var(--space-3)',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600 }}>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  )
}

/**
 * A single headline number.
 *
 * The value is wrapped in aria-live="polite" so a screen-reader user hears it change
 * without being interrupted. Note `aria-live` sits on a wrapper that is always in the
 * DOM — putting it on an element that mounts with the value would announce nothing.
 */
export function StatTile({
  label,
  value,
  unit,
  tone = 'default',
}: {
  label: string
  value: string | number
  unit?: string
  tone?: Tone
}) {
  return (
    <div
      style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 'var(--space-3) var(--space-4)',
        minWidth: 0,
      }}
    >
      <div style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>{label}</div>
      <div aria-live="polite" aria-atomic="true">
        <span
          style={{
            fontSize: 'var(--text-xl)',
            fontVariantNumeric: 'tabular-nums',
            color: toneVar[tone],
            fontWeight: 600,
          }}
        >
          {value}
        </span>
        {unit ? <span style={{ color: 'var(--muted)', marginLeft: 4 }}>{unit}</span> : null}
      </div>
    </div>
  )
}

export function Badge({ tone = 'default', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px var(--space-2)',
        borderRadius: 999,
        fontSize: 'var(--text-sm)',
        color: toneVar[tone],
        border: `1px solid ${toneVar[tone]}`,
      }}
    >
      {children}
    </span>
  )
}
