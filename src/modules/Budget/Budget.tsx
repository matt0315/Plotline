import { Plus, Trash2, Link2, Wallet, HardHat, Package } from 'lucide-react'
import { CurrencyPicker } from '../../components/CurrencyPicker'
import type { BudgetLine } from '../../types/event'
import { useEvent, update, useMoney } from '../../store/event'
import { useUI } from '../../store/ui'
import { budgetTotals, crewCost, lineActual, linePaid } from '../../lib/derived'
import { kitCost } from '../../lib/kit'
import { useKit } from '../../store/kit'
import { uid } from '../../lib/id'
import { Button, Cell, Empty, IconButton, NumberCell, PageHeader, Stat, focusSoon } from '../../components/ui'

const edit = (id: string, fn: (b: BudgetLine) => void, key: string) =>
  update((d) => {
    const b = d.budget.find((x) => x.id === id)
    if (b) fn(b)
  }, `bud-${key}-${id}`)

export default function Budget() {
  const d = useEvent((s) => s.doc)!
  const money = useMoney()
  const readOnly = useEvent((s) => s.readOnly)
  const go = useUI((s) => s.go)
  // Kit prices live outside the event, so re-render when they change.
  useKit((s) => s.updated)
  const t = budgetTotals(d)
  const kitTotal = kitCost(d)
  const hasKitLine = d.budget.some((l) => l.source === 'kit')
  const cats = [...new Set(d.budget.map((b) => b.category))]
  const perGuest = d.guestCount ? t.forecast / d.guestCount : 0

  const add = (category = 'Other') => {
    const line: BudgetLine = { id: uid('b'), category, name: '', estimate: 0, actual: 0, paid: 0 }
    update((x) => void x.budget.push(line))
    focusSoon(`#bud-${line.id} input`)
  }

  const byCat = cats.map((c) => {
    const lines = d.budget.filter((b) => b.category === c)
    const est = lines.reduce((s, l) => s + l.estimate, 0)
    const fc = lines.reduce((s, l) => {
      const a = lineActual(l, d)
      return s + (a > 0 ? a : l.estimate)
    }, 0)
    return { c, lines, est, fc }
  })
  const maxCat = Math.max(1, ...byCat.map((x) => Math.max(x.est, x.fc)))

  return (
    <div>
      <PageHeader
        title="Budget"
        sub="Estimates until you have real numbers — booked supplier quotes and crew hours flow in automatically."
        actions={
          <>
            <CurrencyPicker />
            {!readOnly && (
              <Button variant="primary" onClick={() => add()}>
                <Plus size={16} /> Add line
              </Button>
            )}
          </>
        }
      />

      <div className="card mb-5 grid grid-cols-2 gap-4 p-4 sm:grid-cols-5">
        <div>
          <div className="text-xs font-medium text-slate-500">Target</div>
          <div className="-ml-2 text-xl font-semibold">
            <NumberCell value={d.budgetTarget} format={(n) => money(n)} onChange={(n) => update((x) => void (x.budgetTarget = n), 'target')} className="!text-left text-xl font-semibold" />
          </div>
        </div>
        <Stat label="Forecast" value={money(t.forecast)} sub={`${money(perGuest)} per guest`} />
        <Stat label={t.variance < 0 ? 'Over target' : 'Under target'} value={money(Math.abs(t.variance))} tone={t.variance < 0 ? 'red' : 'green'} />
        <Stat label="Committed" value={money(t.actual)} sub="booked quotes + actuals" />
        <Stat label="Paid" value={money(t.paid)} sub={`${money(t.due)} still due`} />
      </div>

      {!readOnly && kitTotal > 0 && !hasKitLine && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-900">
          <Package size={16} className="shrink-0" />
          <span className="flex-1">Your kit prices put this floor plan at {money(kitTotal)}. Track it as a budget line that updates as the plan changes?</span>
          <Button
            size="sm"
            variant="primary"
            onClick={() => update((x) => void x.budget.push({ id: uid('b'), category: 'Rentals', name: 'Floor-plan kit', estimate: Math.round(kitTotal), actual: 0, paid: 0, source: 'kit' }))}
          >
            Add to budget
          </Button>
        </div>
      )}

      {!d.budget.length ? (
        <div className="card">
          <Empty icon={<Wallet />} title="No budget lines" body="Add lines for each cost. Link suppliers so their quotes update the budget as they change." action={!readOnly && <Button variant="primary" onClick={() => add()}>Add line</Button>} />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
          <div className={`card overflow-x-auto ${readOnly ? 'pointer-events-none' : ''}`}>
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-slate-200 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Item</th>
                  <th className="w-28 px-3 py-2 text-right font-medium">Estimate</th>
                  <th className="w-28 px-3 py-2 text-right font-medium">Actual</th>
                  <th className="w-28 px-3 py-2 text-right font-medium">Paid</th>
                  <th className="w-24 px-3 py-2 text-right font-medium">Due</th>
                  <th className="w-10" />
                </tr>
              </thead>
              {byCat.map(({ c, lines, est, fc }) => (
                <tbody key={c} className="border-b border-slate-100 last:border-0">
                  <tr className="bg-slate-50/70">
                    <td className="px-3 py-1.5 text-xs font-semibold text-slate-600">{c}</td>
                    <td className="px-3 text-right text-xs text-slate-500 tabular-nums">{money(est)}</td>
                    <td className={`px-3 text-right text-xs tabular-nums ${fc > est ? 'text-red-600' : 'text-slate-500'}`}>{money(fc)}</td>
                    <td colSpan={2} />
                    <td>
                      <IconButton title={`Add to ${c}`} onClick={() => add(c)}>
                        <Plus size={14} />
                      </IconButton>
                    </td>
                  </tr>
                  {lines.map((l) => {
                    const sup = l.supplierId ? d.suppliers.find((s) => s.id === l.supplierId) : undefined
                    const actual = lineActual(l, d)
                    const paid = linePaid(l, d)
                    const readThrough = !!sup || l.source === 'crew' || l.source === 'kit'
                    return (
                      <tr key={l.id} id={`bud-${l.id}`} className="group">
                        <td className="px-1 py-0.5">
                          <div className="flex items-center gap-1">
                            <Cell value={l.name} placeholder="Item" onChange={(v) => edit(l.id, (b) => void (b.name = v), 'name')} />
                            {sup && (
                              <button onClick={() => go('suppliers', sup.id)} className="flex shrink-0 items-center gap-1 rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] text-brand-700" title="Actual and paid come from this supplier">
                                <Link2 size={11} /> {sup.name || sup.category}
                              </button>
                            )}
                            {l.source === 'crew' && (
                              <button onClick={() => go('crew')} className="flex shrink-0 items-center gap-1 rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] text-brand-700" title="Actual is crew hours × rates">
                                <HardHat size={11} /> Crew {money(crewCost(d))}
                              </button>
                            )}
                            {l.source === 'kit' && (
                              <button onClick={() => go('layout')} className="flex shrink-0 items-center gap-1 rounded-md bg-brand-50 px-1.5 py-0.5 text-[11px] text-brand-700" title="Actual is floor-plan items × your kit prices">
                                <Package size={11} /> Floor plan {money(kitTotal)}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-1">
                          <NumberCell value={l.estimate} format={(n) => money(n)} onChange={(n) => edit(l.id, (b) => void (b.estimate = n), 'est')} />
                        </td>
                        <td className="px-1">
                          {readThrough ? (
                            <div className={`px-2 text-right tabular-nums ${actual > l.estimate && l.estimate ? 'text-red-600' : ''}`}>{actual ? money(actual) : '—'}</div>
                          ) : (
                            <NumberCell value={l.actual} format={(n) => (n ? money(n) : '—')} onChange={(n) => edit(l.id, (b) => void (b.actual = n), 'act')} className={l.actual > l.estimate && l.estimate ? 'text-red-600' : ''} />
                          )}
                        </td>
                        <td className="px-1">
                          {sup ? (
                            <div className="px-2 text-right text-emerald-700 tabular-nums">{paid ? money(paid) : '—'}</div>
                          ) : (
                            <NumberCell value={l.paid} format={(n) => (n ? money(n) : '—')} onChange={(n) => edit(l.id, (b) => void (b.paid = n), 'paid')} className="text-emerald-700" />
                          )}
                        </td>
                        <td className="px-3 text-right text-slate-500 tabular-nums">{actual - paid > 0 ? money(actual - paid) : '—'}</td>
                        <td>
                          <IconButton className="opacity-0 group-hover:opacity-100 max-sm:opacity-100" title="Remove" onClick={() => update((x) => void (x.budget = x.budget.filter((b) => b.id !== l.id)))}>
                            <Trash2 size={14} />
                          </IconButton>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              ))}
            </table>
          </div>

          <div className="card h-fit p-4">
            <h2 className="mb-3 text-sm font-semibold">By category</h2>
            <ul className="space-y-3">
              {byCat
                .filter((x) => x.est || x.fc)
                .sort((a, b) => b.fc - a.fc)
                .map(({ c, est, fc }) => (
                  <li key={c}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-slate-600">{c}</span>
                      <span className={`tabular-nums ${fc > est ? 'text-red-600' : 'text-slate-500'}`}>{money(fc)}</span>
                    </div>
                    <div className="relative h-2 rounded-full bg-slate-100">
                      <div className={`absolute inset-y-0 left-0 rounded-full ${fc > est ? 'bg-red-400' : 'bg-brand-500'}`} style={{ width: `${(fc / maxCat) * 100}%` }} />
                      <div className="absolute inset-y-[-2px] w-0.5 bg-slate-700" style={{ left: `${(est / maxCat) * 100}%` }} title={`Estimate ${money(est)}`} />
                    </div>
                  </li>
                ))}
            </ul>
            <p className="mt-3 text-[11px] text-slate-400">Bar = forecast · tick = estimate</p>
          </div>
        </div>
      )}
    </div>
  )
}
