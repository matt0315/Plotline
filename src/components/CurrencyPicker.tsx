import { useState } from 'react'
import type { EventDoc } from '../types/event'
import { useEvent } from '../store/event'
import { setCurrency } from '../store/actions'
import { convert, CURRENCIES, currencyOptions, formatMoney } from '../lib/money'
import { Button, Modal, Select, toast } from './ui'

const hasAmounts = (d: EventDoc) =>
  d.budgetTarget > 0 || d.budget.some((l) => l.estimate || l.actual || l.paid) || d.suppliers.some((s) => s.quote || s.paid) || d.crew.some((c) => c.rate)

/** Event currency select. Billing for Plotline itself stays USD — this only affects the plan's own figures. */
export const CurrencyPicker = ({ className = '' }: { className?: string }) => {
  const d = useEvent((s) => s.doc)!
  const readOnly = useEvent((s) => s.readOnly)
  const [pending, setPending] = useState<string | null>(null)

  const pick = (to: string) => {
    if (to === d.currency) return
    if (hasAmounts(d)) setPending(to)
    else setCurrency(to, false)
  }
  const finish = (convertAmounts: boolean) => {
    if (!pending) return
    setCurrency(pending, convertAmounts)
    toast(convertAmounts ? `Converted to ${pending} — check the figures against real quotes` : `Budget now in ${pending}`)
    setPending(null)
  }
  const rate = pending ? CURRENCIES[pending].perUsd / CURRENCIES[d.currency]?.perUsd : 1
  const sample = d.budgetTarget || d.budget.reduce((s, l) => s + l.estimate, 0)

  return (
    <>
      <label className={`flex items-center gap-1.5 text-sm text-slate-500 ${className}`} title="Currency for this event's budget, quotes and rates">
        <span className="max-sm:hidden">Currency</span>
        {readOnly ? (
          <span className="font-medium text-slate-700">{d.currency}</span>
        ) : (
          <Select value={d.currency} options={currencyOptions} onChange={pick} className="max-w-[12rem]" />
        )}
      </label>
      <Modal
        open={!!pending}
        onClose={() => setPending(null)}
        title={`Change to ${pending}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)} className="mr-auto">
              Cancel
            </Button>
            <Button onClick={() => finish(false)}>Keep the numbers</Button>
            <Button variant="primary" onClick={() => finish(true)}>
              Convert amounts
            </Button>
          </>
        }
      >
        {pending && (
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              This event's figures are in {d.currency}. You can convert the budget, supplier quotes, payments and crew rates at a rough rate of{' '}
              <strong className="text-slate-800">
                1 {d.currency} ≈ {rate.toLocaleString(undefined, { maximumFractionDigits: rate < 10 ? 2 : 0 })} {pending}
              </strong>
              {sample > 0 && (
                <>
                  {' '}
                  (so {formatMoney(sample, d.currency)} becomes about {formatMoney(convert(sample, d.currency, pending), pending)})
                </>
              )}
              , or keep the numbers as they are if you've already entered them in {pending}.
            </p>
            <p className="text-xs text-slate-500">Rates are approximate and amounts are rounded. Your {BILLING_NOTE}</p>
          </div>
        )}
      </Modal>
    </>
  )
}

const BILLING_NOTE = 'Plotline subscription is billed in USD whatever currency you plan in.'
