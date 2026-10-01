import { useEffect, useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight, Wallet, Check, Scale, Store, Phone, Mail, HardHat } from 'lucide-react'
import type { Supplier, SupplierStatus } from '../../types/event'
import { useEvent, update, useMoney } from '../../store/event'
import { useUI } from '../../store/ui'
import { dayTitle, newShift, sortShifts } from '../../lib/roster'
import { addMinutes, fmt12 } from '../../lib/time'
import { sectionColor } from '../../data/roster'
import { choose, linkToBudget, newSupplier, SUPPLIER_CATEGORIES } from './supplierActions'
import { Button, Cell, Empty, IconButton, Modal, NumberCell, PageHeader, Select, focusSoon } from '../../components/ui'

const STATUSES: { value: SupplierStatus; label: string }[] = [
  { value: 'researching', label: 'Researching' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'booked', label: 'Booked' },
  { value: 'paid', label: 'Paid in full' },
  { value: 'declined', label: 'Not using' },
]

const STATUS_STYLE: Record<SupplierStatus, string> = {
  researching: 'text-slate-500',
  quoted: 'text-amber-700',
  booked: 'text-brand-700 font-medium',
  paid: 'text-emerald-700 font-medium',
  declined: 'text-slate-400 line-through',
}

const edit = (id: string, fn: (s: Supplier) => void, key: string) =>
  update((d) => {
    const s = d.suppliers.find((x) => x.id === id)
    if (s) fn(s)
  }, `sup-${key}-${id}`)

/** The shifts this supplier's team is rostered on, with a shortcut to add one. */
const SupplierRoster = ({ supplierId }: { supplierId: string }) => {
  const d = useEvent((x) => x.doc)!
  const shifts = sortShifts(d.shifts.filter((sh) => sh.supplierId === supplierId))
  const rosterTeam = () => {
    const sh = newShift({ supplierId, section: 'Bump in', day: 0, start: d.startTime, end: addMinutes(d.startTime, 240), needed: 2 })
    update((x) => void x.shifts.push(sh))
    useUI.getState().go('crew', sh.id)
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs sm:col-span-2 lg:col-span-4">
      <div className="mb-1 flex items-center gap-2">
        <HardHat size={13} className="text-slate-400" />
        <span className="font-medium text-slate-600">On the crew roster</span>
        <div className="flex-1" />
        <button onClick={rosterTeam} className="rounded-md px-2 py-0.5 text-brand-600 hover:bg-brand-50">
          + Roster their team
        </button>
      </div>
      {shifts.length ? (
        <ul className="space-y-0.5">
          {shifts.map((sh) => (
            <li key={sh.id}>
              <button onClick={() => useUI.getState().go('crew', sh.id)} className="flex w-full gap-2 rounded px-1 py-0.5 text-left hover:bg-slate-50">
                <span className="w-40 shrink-0 text-slate-500">{dayTitle(d.date, sh.day)}</span>
                <span className="w-28 shrink-0 tabular-nums">
                  {fmt12(sh.start)}–{fmt12(sh.end)}
                </span>
                <span className="truncate">
                  <span style={{ color: sectionColor(sh.section) }}>{sh.section}</span> · {sh.task} · {sh.needed} crew
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-slate-400">Not rostered yet — add their bump-in, service or pack-down so it shows on the roster and run sheet.</p>
      )}
    </div>
  )
}

const Row = ({ s, open, onToggle }: { s: Supplier; open: boolean; onToggle: () => void }) => {
  const d = useEvent((x) => x.doc)!
  const money = useMoney()
  const linked = !!s.budgetLineId && d.budget.some((b) => b.id === s.budgetLineId)
  return (
    <div id={`sup-${s.id}`} className={`${s.status === 'declined' ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-1 px-2 py-1 md:flex-nowrap">
        <IconButton onClick={onToggle} className="shrink-0">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </IconButton>
        <div className="min-w-0 flex-1 basis-44">
          <Cell value={s.name} placeholder="Supplier name" className="font-medium" onChange={(v) => edit(s.id, (x) => void (x.name = v), 'name')} />
        </div>
        <div className="w-36 shrink-0">
          <Select value={s.status} options={STATUSES} className={STATUS_STYLE[s.status]} onChange={(v) => edit(s.id, (x) => void (x.status = v), 'status')} />
        </div>
        <div className="w-28 shrink-0" title="Quote">
          <NumberCell value={s.quote} format={(n) => (n ? money(n) : 'Quote')} onChange={(n) => edit(s.id, (x) => void (x.quote = n), 'quote')} className={s.quote ? '' : 'text-slate-400'} />
        </div>
        <div className="w-28 shrink-0" title="Paid">
          <NumberCell value={s.paid} format={(n) => (n ? money(n) : 'Paid')} onChange={(n) => edit(s.id, (x) => void (x.paid = n), 'paid')} className={s.paid ? 'text-emerald-700' : 'text-slate-400'} />
        </div>
        <div className="flex w-24 shrink-0 justify-end">
          {linked ? (
            <span className="flex items-center gap-1 px-2 text-xs text-emerald-700" title="This quote flows into the budget">
              <Wallet size={12} /> In budget
            </span>
          ) : (
            s.status !== 'declined' && (
              <button onClick={() => linkToBudget(s.id)} className="rounded-md px-2 py-1 text-xs text-brand-600 hover:bg-brand-50">
                + Budget
              </button>
            )
          )}
        </div>
      </div>
      {open && (
        <div className="grid gap-x-4 gap-y-2 border-t border-dashed border-slate-100 bg-slate-50/60 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-slate-500">
            Category
            <select className="input mt-1" value={s.category} onChange={(e) => edit(s.id, (x) => void (x.category = e.target.value), 'cat')}>
              {[...new Set([...SUPPLIER_CATEGORIES, s.category])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Contact
            <input className="input mt-1" value={s.contact} onChange={(e) => edit(s.id, (x) => void (x.contact = e.target.value), 'contact')} />
          </label>
          <label className="text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Phone size={11} /> Phone
            </span>
            <input className="input mt-1" type="tel" value={s.phone} onChange={(e) => edit(s.id, (x) => void (x.phone = e.target.value), 'phone')} />
          </label>
          <label className="text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Mail size={11} /> Email
            </span>
            <input className="input mt-1" type="email" value={s.email} onChange={(e) => edit(s.id, (x) => void (x.email = e.target.value), 'email')} />
          </label>
          <label className="text-xs text-slate-500">
            Arrives (on run sheet)
            <input className="input mt-1" type="time" value={s.arrival} onChange={(e) => edit(s.id, (x) => void (x.arrival = e.target.value), 'arr')} />
          </label>
          <label className="text-xs text-slate-500">
            Leaves
            <input className="input mt-1" type="time" value={s.departure} onChange={(e) => edit(s.id, (x) => void (x.departure = e.target.value), 'dep')} />
          </label>
          <label className="text-xs text-slate-500">
            Balance due by
            <input className="input mt-1" type="date" value={s.dueDate} onChange={(e) => edit(s.id, (x) => void (x.dueDate = e.target.value), 'due')} />
          </label>
          <div className="flex items-end justify-end">
            <Button
              size="sm"
              variant="danger"
              onClick={() =>
                update((d) => {
                  d.suppliers = d.suppliers.filter((x) => x.id !== s.id)
                  for (const b of d.budget) if (b.supplierId === s.id) delete b.supplierId
                  // Their rostered shifts stay, handed back to your own team to fill.
                  for (const sh of d.shifts) if (sh.supplierId === s.id) delete sh.supplierId
                })
              }
            >
              <Trash2 size={14} /> Remove
            </Button>
          </div>
          <SupplierRoster supplierId={s.id} />
          <label className="text-xs text-slate-500 sm:col-span-2 lg:col-span-4">
            Notes
            <textarea className="input mt-1 h-16" value={s.notes} onChange={(e) => edit(s.id, (x) => void (x.notes = e.target.value), 'notes')} />
          </label>
        </div>
      )}
    </div>
  )
}

const Compare = ({ category, onClose }: { category: string; onClose: () => void }) => {
  const d = useEvent((x) => x.doc)!
  const money = useMoney()
  const list = d.suppliers.filter((s) => s.category === category)
  const quoted = list.filter((s) => s.quote > 0)
  const low = quoted.length ? Math.min(...quoted.map((s) => s.quote)) : 0
  const line = d.budget.find((b) => b.category === category)
  return (
    <Modal open onClose={onClose} title={`Compare ${category}`} width="max-w-3xl">
      {line && <p className="mb-3 text-sm text-slate-500">Budgeted: {money(line.estimate)}</p>}
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(list.length, 4)}, minmax(0, 1fr))` }}>
        {list.map((s) => (
          <div key={s.id} className={`rounded-xl border p-4 ${s.status === 'booked' || s.status === 'paid' ? 'border-brand-500 ring-2 ring-brand-100' : 'border-slate-200'}`}>
            <div className="truncate font-semibold">{s.name || 'Unnamed'}</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{s.quote ? money(s.quote) : '—'}</div>
            {s.quote > 0 && s.quote === low && quoted.length > 1 && <div className="text-xs font-medium text-emerald-700">Lowest quote</div>}
            {line && s.quote > 0 && <div className={`text-xs ${s.quote > line.estimate ? 'text-red-600' : 'text-slate-500'}`}>{s.quote > line.estimate ? `${money(s.quote - line.estimate)} over budget` : `${money(line.estimate - s.quote)} under budget`}</div>}
            <p className="mt-2 line-clamp-4 text-xs text-slate-500">{s.notes || 'No notes'}</p>
            <Button
              size="sm"
              variant={s.status === 'booked' || s.status === 'paid' ? 'secondary' : 'primary'}
              className="mt-3 w-full"
              disabled={s.status === 'booked' || s.status === 'paid'}
              onClick={() => {
                choose(s.id)
                onClose()
              }}
            >
              {s.status === 'booked' || s.status === 'paid' ? (
                <>
                  <Check size={14} /> Chosen
                </>
              ) : (
                'Choose'
              )}
            </Button>
          </div>
        ))}
      </div>
    </Modal>
  )
}

export default function Suppliers() {
  const d = useEvent((s) => s.doc)!
  const money = useMoney()
  const readOnly = useEvent((s) => s.readOnly)
  const focusId = useUI((s) => s.focusId)
  const [open, setOpen] = useState<Set<string>>(new Set(focusId ? [focusId] : []))
  const [comparing, setComparing] = useState<string | null>(null)

  useEffect(() => {
    if (!focusId) return
    setOpen((o) => new Set([...o, focusId]))
    requestAnimationFrame(() => document.getElementById(`sup-${focusId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
  }, [focusId])

  const cats = [...new Set(d.suppliers.map((s) => s.category))].sort((a, b) => SUPPLIER_CATEGORIES.indexOf(a) - SUPPLIER_CATEGORIES.indexOf(b))
  const committed = d.suppliers.filter((s) => s.status === 'booked' || s.status === 'paid').reduce((t, s) => t + s.quote, 0)
  const paid = d.suppliers.reduce((t, s) => t + s.paid, 0)

  const add = (category = 'Other') => {
    const s = newSupplier({ category })
    update((x) => void x.suppliers.push(s))
    setOpen((o) => new Set([...o, s.id]))
    focusSoon(`#sup-${s.id} input`)
  }

  return (
    <div>
      <PageHeader
        title="Suppliers"
        sub={`${d.suppliers.filter((s) => s.status === 'booked' || s.status === 'paid').length} booked · ${money(committed)} committed · ${money(paid)} paid`}
        actions={
          !readOnly && (
            <Button variant="primary" onClick={() => add()}>
              <Plus size={16} /> Add supplier
            </Button>
          )
        }
      />
      {!d.suppliers.length ? (
        <div className="card">
          <Empty icon={<Store />} title="No suppliers yet" body="Track quotes, bookings and payments. Arrival times go straight onto the run sheet, and costs flow into the budget." action={!readOnly && <Button variant="primary" onClick={() => add()}>Add supplier</Button>} />
        </div>
      ) : (
        <div className={`space-y-4 ${readOnly ? 'pointer-events-none' : ''}`}>
          {cats.map((c) => {
            const list = d.suppliers.filter((s) => s.category === c)
            const live = list.filter((s) => s.status !== 'declined')
            return (
              <section key={c} className="card overflow-hidden">
                <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-2">
                  <h2 className="text-sm font-semibold">{c}</h2>
                  <span className="text-xs text-slate-400">{list.length}</span>
                  <div className="flex-1" />
                  {list.length > 1 && (
                    <Button size="sm" variant="ghost" onClick={() => setComparing(c)}>
                      <Scale size={14} /> Compare {live.length}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => add(c)}>
                    <Plus size={14} /> Quote
                  </Button>
                </header>
                <div className="divide-y divide-slate-100">
                  {list.map((s) => (
                    <Row
                      key={s.id}
                      s={s}
                      open={open.has(s.id)}
                      onToggle={() =>
                        setOpen((o) => {
                          const n = new Set(o)
                          if (n.has(s.id)) n.delete(s.id)
                          else n.add(s.id)
                          return n
                        })
                      }
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
      {comparing && <Compare category={comparing} onClose={() => setComparing(null)} />}
    </div>
  )
}
