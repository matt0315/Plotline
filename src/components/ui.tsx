import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { X } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'text-red-600 hover:bg-red-50',
}

export const Button = ({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) => (
  <button
    {...p}
    className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:opacity-50 disabled:pointer-events-none ${
      size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm'
    } ${VARIANTS[variant]} ${className}`}
  />
)

export const IconButton = ({ className = '', active, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) => (
  <button
    {...p}
    className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-slate-600 transition hover:bg-slate-100 disabled:opacity-40 ${
      active ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200' : ''
    } ${className}`}
  />
)

/** Text input that commits on every keystroke but coalesces into one undo step. */
export const Cell = ({
  value,
  onChange,
  className = '',
  placeholder,
  type = 'text',
  align,
}: {
  value: string | number
  onChange: (v: string) => void
  className?: string
  placeholder?: string
  type?: string
  align?: 'right'
}) => (
  <input
    className={`cell ${align === 'right' ? 'text-right tabular-nums' : ''} ${className}`}
    value={value}
    placeholder={placeholder}
    type={type}
    onChange={(e) => onChange(e.target.value)}
  />
)

/** Number cell that shows formatted text until focused. */
export const NumberCell = ({
  value,
  onChange,
  format,
  className = '',
  step,
}: {
  value: number
  onChange: (n: number) => void
  format?: (n: number) => string
  className?: string
  step?: number
}) => {
  const [focus, setFocus] = useState(false)
  const [draft, setDraft] = useState('')
  return (
    <input
      className={`cell text-right tabular-nums ${className}`}
      inputMode="decimal"
      step={step}
      value={focus ? draft : format ? format(value) : String(value)}
      onFocus={(e) => {
        setDraft(value ? String(value) : '')
        setFocus(true)
        const el = e.target
        // select() also focuses, so only do it if the user hasn't moved on.
        requestAnimationFrame(() => document.activeElement === el && el.select())
      }}
      onBlur={() => setFocus(false)}
      onChange={(e) => {
        const raw = e.target.value
        // Allow currency marks around the number (A$, ¥, €, 120 kr), but ignore stray letters rather than zeroing the value.
        if (raw && (!/^\s*[A-Za-z]{0,3}\s?[^\w\s.,-]{0,2}\s*-?[\d,]*\.?\d*\s*(?:[A-Za-z]{0,3}|[^\w\s.,-]{0,2})\s*$/.test(raw) || (/[A-Za-z]/.test(raw) && !/\d/.test(raw)))) return
        setDraft(raw)
        const n = parseFloat(raw.replace(/[^0-9.-]/g, ''))
        onChange(Number.isFinite(n) ? n : 0)
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

export const Select = <T extends string>({
  value,
  options,
  onChange,
  className = '',
}: {
  value: T
  options: { value: T; label: string }[] | readonly T[]
  onChange: (v: T) => void
  className?: string
}) => (
  <select className={`cell cursor-pointer ${className}`} value={value} onChange={(e) => onChange(e.target.value as T)}>
    {options.map((o) =>
      typeof o === 'string' ? (
        <option key={o} value={o}>
          {o}
        </option>
      ) : (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ),
    )}
  </select>
)

export const Pill = ({ children, tone = 'slate', className = '' }: { children: ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' | 'brand' | 'blue'; className?: string }) => {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    red: 'bg-red-50 text-red-700 ring-red-200',
    brand: 'bg-brand-50 text-brand-700 ring-brand-200',
    blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  }
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-transparent ${tones[tone]} ${className}`}>{children}</span>
}

export const Modal = ({
  open,
  onClose,
  title,
  children,
  width = 'max-w-lg',
  footer,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  width?: string
  footer?: ReactNode
}) => {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`flex max-h-[92vh] w-full ${width} flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl`}>
        {title && (
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <h2 className="text-base font-semibold">{title}</h2>
            <IconButton onClick={onClose} aria-label="Close">
              <X size={18} />
            </IconButton>
          </div>
        )}
        <div className="scroll-thin flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export const Empty = ({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) => (
  <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">{icon}</div>
    <h3 className="font-semibold">{title}</h3>
    {body && <p className="mt-1 max-w-sm text-sm text-slate-500">{body}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
)

export const Stat = ({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'red' | 'green' }) => (
  <div>
    <div className="text-xs font-medium text-slate-500">{label}</div>
    <div className={`mt-0.5 text-xl font-semibold tabular-nums ${tone === 'red' ? 'text-red-600' : tone === 'green' ? 'text-emerald-600' : ''}`}>{value}</div>
    {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
  </div>
)

export const PageHeader = ({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) => (
  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {sub && <p className="mt-0.5 text-sm text-slate-500">{sub}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
)

let toastTimer: ReturnType<typeof setTimeout> | undefined
export const toast = (msg: string) => {
  let el = document.getElementById('toast')
  if (!el) {
    el = document.createElement('div')
    el.id = 'toast'
    el.className = 'fixed bottom-20 left-1/2 z-[2000] -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg transition-opacity sm:bottom-6'
    document.body.appendChild(el)
  }
  el.textContent = msg
  el.style.opacity = '1'
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el && (el.style.opacity = '0'), 2600)
}

/** Focus a freshly-added row's input once React has rendered it. */
export const focusSoon = (selector: string, tries = 12) => {
  const el = document.querySelector<HTMLInputElement>(selector)
  if (el) {
    el.focus()
    el.scrollIntoView({ block: 'nearest' })
    return
  }
  if (tries > 0) requestAnimationFrame(() => focusSoon(selector, tries - 1))
}
