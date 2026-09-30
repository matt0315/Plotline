import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, HardHat, FileDown, Wallet, Copy, AlertTriangle, Sparkles, Store, Users, CalendarPlus, X, Check } from 'lucide-react'
import type { CrewMember, Shift } from '../../types/event'
import { useEvent, update } from '../../store/event'
import { useUI } from '../../store/ui'
import { SECTIONS, sectionColor } from '../../data/roster'
import { crewCost, crewHours, dayTitle, doubleBookings, newShift, openPositions, relLabel, shiftHours, sortShifts, suggestedRoster } from '../../lib/roster'
import { addMinutes, fmt12 } from '../../lib/time'
import { money } from '../../lib/money'
import { uid } from '../../lib/id'
import { Button, Cell, Empty, IconButton, Modal, NumberCell, PageHeader, focusSoon, toast } from '../../components/ui'

const ROLES = ['Event manager', 'Coordinator', 'Stage manager', 'Site manager', 'Production manager', 'AV tech', 'Lighting tech', 'Bar staff', 'Wait staff', 'Chef', 'Kitchen hand', 'Runner', 'Security', 'Steward', 'First aider', 'Registration', 'Driver', 'Rigger', 'Grounds', 'Cleaner', 'Labourer']

const DAY_OPTIONS = Array.from({ length: 22 }, (_, i) => i - 14) // two weeks before → a week after

/** A new 4-hour shift: from the event start on event day, from 8am on other days. */
const blankShift = (day: number, eventStart: string) => {
  const start = day === 0 ? eventStart : '08:00'
  return newShift({ day, start, end: addMinutes(start, 240) })
}

const newPerson = (over: Partial<CrewMember> = {}): CrewMember => ({ id: uid('c'), name: '', role: '', phone: '', email: '', rate: 0, notes: '', ...over })

const editPerson = (id: string, fn: (c: CrewMember) => void, key: string) =>
  update((d) => {
    const c = d.crew.find((x) => x.id === id)
    if (c) fn(c)
  }, `crew-${key}-${id}`)

/* ---------- Shift editor ---------- */

const ShiftEditor = ({ initial, onClose }: { initial: Shift; onClose: () => void }) => {
  const d = useEvent((s) => s.doc)!
  const exists = d.shifts.some((s) => s.id === initial.id)
  const [s, setS] = useState<Shift>(initial)
  const [newName, setNewName] = useState('')
  const set = (p: Partial<Shift>) => setS((x) => ({ ...x, ...p }))
  const team = s.supplierId ? 'supplier' : 'crew'
  const suppliers = d.suppliers.filter((x) => x.status !== 'declined')
  const others = d.shifts.filter((x) => x.id !== s.id)

  // Who is already busy at this time on another shift?
  const busy = useMemo(() => {
    const clashes = doubleBookings({ ...d, shifts: [...others, s] })
    return new Set(clashes.filter((c) => c.a.id === s.id || c.b.id === s.id).map((c) => c.crewId))
  }, [d, others, s])

  const save = () => {
    update((dd) => {
      const i = dd.shifts.findIndex((x) => x.id === s.id)
      if (i >= 0) dd.shifts[i] = s
      else dd.shifts.push(s)
    })
    onClose()
  }

  const togglePerson = (id: string) => set({ crewIds: s.crewIds.includes(id) ? s.crewIds.filter((x) => x !== id) : [...s.crewIds, id], needed: Math.max(s.needed, s.crewIds.includes(id) ? 0 : s.crewIds.length + 1) })

  const addPerson = () => {
    if (!newName.trim()) return
    const p = newPerson({ name: newName.trim(), role: s.section === 'General' ? '' : s.section })
    update((dd) => void dd.crew.push(p))
    set({ crewIds: [...s.crewIds, p.id], needed: Math.max(s.needed, s.crewIds.length + 1) })
    setNewName('')
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={exists ? 'Edit shift' : 'New shift'}
      width="max-w-xl"
      footer={
        <>
          {exists && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={() => {
                update((dd) => void (dd.shifts = dd.shifts.filter((x) => x.id !== s.id)))
                onClose()
              }}
            >
              <Trash2 size={14} /> Delete
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!s.section.trim()}>
            <Check size={14} /> Save
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-500">
          Section
          <input className="input mt-1" list="roster-sections" value={s.section} onChange={(e) => set({ section: e.target.value })} />
        </label>
        <label className="text-xs text-slate-500">
          Task
          <input className="input mt-1" autoFocus placeholder="e.g. Tables and linen per floor plan" value={s.task} onChange={(e) => set({ task: e.target.value })} />
        </label>
        <label className="text-xs text-slate-500">
          Day
          <select className="input mt-1" value={s.day} onChange={(e) => set({ day: parseInt(e.target.value) })}>
            {DAY_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {dayTitle(d.date, n)}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-500">
            Start
            <input type="time" className="input mt-1" value={s.start} onChange={(e) => set({ start: e.target.value })} />
          </label>
          <label className="text-xs text-slate-500">
            Finish
            <input type="time" className="input mt-1" value={s.end} onChange={(e) => set({ end: e.target.value })} />
          </label>
        </div>
      </div>
      <p className="mt-1 text-right text-xs text-slate-500">
        {shiftHours(s).toFixed(1)} hours{s.end < s.start ? ' · finishes after midnight' : ''}
      </p>

      <div className="mt-3">
        <div className="label">Who does it</div>
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm">
          <button className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 font-medium ${team === 'crew' ? 'bg-white shadow-sm' : 'text-slate-500'}`} onClick={() => set({ supplierId: undefined })}>
            <Users size={14} /> Our team
          </button>
          <button
            className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 font-medium ${team === 'supplier' ? 'bg-white shadow-sm' : 'text-slate-500'}`}
            onClick={() => (suppliers.length ? set({ supplierId: suppliers[0].id, crewIds: [] }) : toast('Add the supplier on the Suppliers tab first'))}
          >
            <Store size={14} /> A supplier’s team
          </button>
        </div>

        {team === 'supplier' ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <label className="text-xs text-slate-500">
              Supplier
              <select className="input mt-1" value={s.supplierId} onChange={(e) => set({ supplierId: e.target.value })}>
                {suppliers.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name || x.category} · {x.category}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-500">
              Their crew size
              <input type="number" min={1} className="input mt-1" value={s.needed} onChange={(e) => set({ needed: Math.max(1, parseInt(e.target.value) || 1) })} />
            </label>
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
              <span>
                {s.crewIds.length} of{' '}
                <input type="number" min={1} className="w-12 rounded border border-slate-300 px-1 py-0.5 text-center" value={s.needed} onChange={(e) => set({ needed: Math.max(1, parseInt(e.target.value) || 1) })} /> positions
                filled
              </span>
            </div>
            <ul className="scroll-thin max-h-48 space-y-1 overflow-y-auto">
              {d.crew.map((c) => {
                const on = s.crewIds.includes(c.id)
                return (
                  <li key={c.id}>
                    <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${on ? 'border-brand-300 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                      <input type="checkbox" className="accent-brand-600" checked={on} onChange={() => togglePerson(c.id)} />
                      <span className="flex-1 truncate">
                        {c.name || <span className="text-slate-400">Unnamed</span>} <span className="text-xs text-slate-500">{c.role}</span>
                      </span>
                      {on && busy.has(c.id) && (
                        <span className="flex items-center gap-1 text-xs text-red-600">
                          <AlertTriangle size={12} /> double-booked
                        </span>
                      )}
                      <span className="text-xs text-slate-400 tabular-nums">{crewHours(d, c.id).toFixed(1)}h rostered</span>
                    </label>
                  </li>
                )
              })}
            </ul>
            <div className="mt-2 flex gap-2">
              <input className="input py-1.5" placeholder="Add someone new…" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPerson())} />
              <Button size="sm" onClick={addPerson} disabled={!newName.trim()}>
                <Plus size={14} /> Add
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-500">
          Location
          <input className="input mt-1" placeholder="e.g. Main marquee" value={s.location} onChange={(e) => set({ location: e.target.value })} />
        </label>
        <label className="text-xs text-slate-500">
          Notes
          <input className="input mt-1" placeholder="Bring gloves, park at gate 2…" value={s.notes} onChange={(e) => set({ notes: e.target.value })} />
        </label>
      </div>
    </Modal>
  )
}

/* ---------- Roster ---------- */

const ShiftRow = ({ s, onOpen, clash }: { s: Shift; onOpen: () => void; clash: boolean }) => {
  const d = useEvent((x) => x.doc)!
  const sup = s.supplierId ? d.suppliers.find((x) => x.id === s.supplierId) : undefined
  const people = s.crewIds.map((id) => d.crew.find((c) => c.id === id)).filter(Boolean) as CrewMember[]
  const short = !sup && people.length < s.needed
  return (
    <div className="group flex items-stretch gap-3 px-3 py-2 hover:bg-slate-50">
      <span className="w-1 shrink-0 rounded-full" style={{ background: sectionColor(s.section) }} />
      <button onClick={onOpen} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-left">
        <span className="w-32 shrink-0 text-sm tabular-nums">
          {fmt12(s.start)}–{fmt12(s.end)}
          <span className="block text-[11px] text-slate-400">{shiftHours(s).toFixed(1)} h</span>
        </span>
        <span className="min-w-0 flex-1 basis-48">
          <span className="text-xs font-semibold" style={{ color: sectionColor(s.section) }}>
            {s.section}
          </span>
          <span className="block truncate text-sm">{s.task || <span className="text-slate-400">No task yet</span>}</span>
          {(s.location || s.notes) && <span className="block truncate text-xs text-slate-500">{[s.location, s.notes].filter(Boolean).join(' · ')}</span>}
        </span>
        <span className="flex min-w-0 basis-56 items-center gap-2 text-sm">
          {sup ? (
            <span className="flex min-w-0 items-center gap-1.5 truncate text-slate-700">
              <Store size={14} className="shrink-0 text-slate-400" />
              <span className="truncate">{sup.name || sup.category}</span>
              <span className="text-xs text-slate-500">· {s.needed} crew</span>
            </span>
          ) : (
            <>
              <span className="min-w-0 truncate text-slate-700">{people.length ? people.map((p) => p.name || p.role || 'Unnamed').join(', ') : <span className="text-slate-400">Nobody yet</span>}</span>
              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${short ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
                {people.length}/{s.needed}
              </span>
            </>
          )}
          {clash && (
            <span title="Someone on this shift is rostered elsewhere at the same time">
              <AlertTriangle size={14} className="shrink-0 text-red-500" />
            </span>
          )}
        </span>
      </button>
      <div className="flex shrink-0 items-center opacity-0 transition group-hover:opacity-100 max-sm:opacity-100">
        <IconButton title="Duplicate" onClick={() => update((dd) => void dd.shifts.push({ ...s, id: uid('s') }))}>
          <Copy size={14} />
        </IconButton>
        <IconButton title="Delete" onClick={() => update((dd) => void (dd.shifts = dd.shifts.filter((x) => x.id !== s.id)))}>
          <Trash2 size={14} />
        </IconButton>
      </div>
    </div>
  )
}

const Roster = ({ onEdit, personFilter, clearFilter }: { onEdit: (s: Shift) => void; personFilter: string | null; clearFilter: () => void }) => {
  const d = useEvent((s) => s.doc)!
  const readOnly = useEvent((s) => s.readOnly)
  const [addingDay, setAddingDay] = useState(false)
  const clashIds = useMemo(() => new Set(doubleBookings(d).flatMap((c) => [c.a.id, c.b.id])), [d])
  const shifts = sortShifts(personFilter ? d.shifts.filter((s) => s.crewIds.includes(personFilter)) : d.shifts)
  const days = [...new Set([...shifts.map((s) => s.day), ...(personFilter ? [] : [0])])].sort((a, b) => a - b)
  const person = personFilter ? d.crew.find((c) => c.id === personFilter) : null

  return (
    <div className={readOnly ? 'pointer-events-none' : ''}>
      {person && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
          Showing {person.name || person.role || 'this person'}’s shifts · {crewHours(d, person.id).toFixed(1)} h
          <button onClick={clearFilter} className="ml-auto flex items-center gap-1 text-xs hover:underline">
            <X size={12} /> Show everyone
          </button>
        </div>
      )}
      <div className="space-y-4">
        {days.map((day) => {
          const list = shifts.filter((s) => s.day === day)
          const hours = list.reduce((h, s) => h + shiftHours(s) * (s.supplierId ? s.needed : Math.max(s.crewIds.length, 1)), 0)
          return (
            <section key={day} className={`card overflow-hidden ${day === 0 ? 'ring-1 ring-brand-200' : ''}`}>
              <header className={`flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 ${day === 0 ? 'bg-brand-50/60' : ''}`}>
                <h2 className="text-sm font-semibold">{dayTitle(d.date, day)}</h2>
                <span className="text-xs text-slate-500">
                  {list.length} shift{list.length === 1 ? '' : 's'} · {hours.toFixed(0)} crew-hours
                </span>
                <div className="flex-1" />
                <Button size="sm" variant="ghost" onClick={() => onEdit(blankShift(day, d.startTime))}>
                  <Plus size={14} /> Shift
                </Button>
              </header>
              <div className="divide-y divide-slate-100">
                {list.map((s) => (
                  <ShiftRow key={s.id} s={s} onOpen={() => onEdit(s)} clash={clashIds.has(s.id)} />
                ))}
                {!list.length && <p className="px-4 py-4 text-sm text-slate-400">Nothing rostered.</p>}
              </div>
            </section>
          )
        })}
      </div>

      {!personFilter && (
        <div className="mt-3">
          {addingDay ? (
            <div className="card flex flex-wrap gap-1.5 p-3">
              <span className="w-full text-xs text-slate-500">Add work on which day?</span>
              {DAY_OPTIONS.filter((n) => !days.includes(n)).map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    setAddingDay(false)
                    onEdit(blankShift(n, d.startTime))
                  }}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs hover:bg-brand-50 hover:text-brand-700"
                >
                  {relLabel(n)}
                </button>
              ))}
            </div>
          ) : (
            <button onClick={() => setAddingDay(true)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-white hover:text-slate-800">
              <CalendarPlus size={16} /> Add another day — prep before, or pack-down and cleaning after
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/* ---------- People ---------- */

const People = ({ onShowShifts }: { onShowShifts: (id: string) => void }) => {
  const d = useEvent((s) => s.doc)!
  const readOnly = useEvent((s) => s.readOnly)
  const add = () => {
    const p = newPerson()
    update((x) => void x.crew.push(p))
    focusSoon(`#crew-${p.id} input`)
  }
  if (!d.crew.length)
    return (
      <div className="card">
        <Empty icon={<Users />} title="No people yet" body="Add your team, then put them on shifts. Their hours × rate go into the budget." action={!readOnly && <Button variant="primary" onClick={add}>Add a person</Button>} />
      </div>
    )
  return (
    <>
      <datalist id="roles">
        {ROLES.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      <div className="card overflow-x-auto">
        <table className={`w-full min-w-[820px] text-sm ${readOnly ? 'pointer-events-none' : ''}`}>
          <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Mobile</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="w-24 px-3 py-2 text-right font-medium">$/hr</th>
              <th className="w-24 px-3 py-2 text-right font-medium">Shifts</th>
              <th className="w-24 px-3 py-2 text-right font-medium">Cost</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {d.crew.map((c) => {
              const n = d.shifts.filter((s) => s.crewIds.includes(c.id)).length
              const h = crewHours(d, c.id)
              return (
                <tr key={c.id} id={`crew-${c.id}`} className="group border-b border-slate-100 last:border-0">
                  <td className="px-1 py-0.5">
                    <Cell value={c.name} placeholder="Name" onChange={(v) => editPerson(c.id, (x) => void (x.name = v), 'name')} />
                  </td>
                  <td className="px-1">
                    <input className="cell" list="roles" value={c.role} placeholder="Role" onChange={(e) => editPerson(c.id, (x) => void (x.role = e.target.value), 'role')} />
                  </td>
                  <td className="px-1">
                    <Cell value={c.phone} type="tel" placeholder="—" onChange={(v) => editPerson(c.id, (x) => void (x.phone = v), 'phone')} />
                  </td>
                  <td className="px-1">
                    <Cell value={c.email} type="email" placeholder="—" onChange={(v) => editPerson(c.id, (x) => void (x.email = v), 'email')} />
                  </td>
                  <td className="px-1">
                    <NumberCell value={c.rate} format={(v) => (v ? money(v) : '—')} onChange={(v) => editPerson(c.id, (x) => void (x.rate = v), 'rate')} />
                  </td>
                  <td className="px-3 text-right">
                    <button className="text-brand-600 hover:underline disabled:text-slate-400 disabled:no-underline" disabled={!n} onClick={() => onShowShifts(c.id)}>
                      {n} · {h.toFixed(1)}h
                    </button>
                  </td>
                  <td className="px-3 text-right tabular-nums">{h * c.rate ? money(h * c.rate) : '—'}</td>
                  <td>
                    <IconButton
                      className="opacity-0 group-hover:opacity-100 max-sm:opacity-100"
                      title="Remove person"
                      onClick={() =>
                        update((x) => {
                          x.crew = x.crew.filter((y) => y.id !== c.id)
                          for (const s of x.shifts) s.crewIds = s.crewIds.filter((id) => id !== c.id)
                        })
                      }
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <button onClick={add} className="mt-2 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-white hover:text-slate-800">
          <Plus size={16} /> Add person
        </button>
      )}
    </>
  )
}

/* ---------- Page ---------- */

export default function Crew() {
  const d = useEvent((s) => s.doc)!
  const readOnly = useEvent((s) => s.readOnly)
  const focusId = useUI((s) => s.focusId)
  const [view, setView] = useState<'roster' | 'people'>('roster')
  const [editing, setEditing] = useState<Shift | null>(null)
  const [personFilter, setPersonFilter] = useState<string | null>(null)

  // Jumping here from the run sheet opens that shift.
  useEffect(() => {
    const s = focusId && d.shifts.find((x) => x.id === focusId)
    if (s) (setView('roster'), setEditing(s))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId])

  const cost = crewCost(d)
  const hours = d.shifts.reduce((h, s) => h + (s.supplierId ? 0 : shiftHours(s) * s.crewIds.length), 0)
  const unfilled = openPositions(d)
  const clashes = doubleBookings(d)
  const days = new Set(d.shifts.map((s) => s.day))
  const inBudget = d.budget.some((b) => b.source === 'crew')

  const suggest = () => {
    const seeds = suggestedRoster(d.type, d.startTime, d.suppliers)
    const have = new Set(d.shifts.map((s) => `${s.day}|${s.section}|${s.task}`))
    const fresh = seeds.filter((s) => !have.has(`${s.day}|${s.section}|${s.task}`))
    if (!fresh.length) return toast('Your roster already has all the suggested shifts')
    update((x) => void x.shifts.push(...fresh))
    toast(`Added ${fresh.length} suggested shift${fresh.length === 1 ? '' : 's'} — assign people to fill them`)
  }

  return (
    <div>
      <datalist id="roster-sections">
        {SECTIONS.map((s) => (
          <option key={s.name} value={s.name} />
        ))}
      </datalist>
      <PageHeader
        title="Crew & roster"
        sub={`${d.crew.length} people · ${d.shifts.length} shifts across ${days.size} day${days.size === 1 ? '' : 's'} · ${hours.toFixed(0)} team hours · ${money(cost)}`}
        actions={
          <>
            <Button onClick={async () => (await import('../../lib/pdf')).exportPack(d, ['crew'])} disabled={!d.shifts.length}>
              <FileDown size={16} /> Roster PDF
            </Button>
            {!readOnly && (
              <>
                <Button onClick={suggest}>
                  <Sparkles size={16} /> Suggest shifts
                </Button>
                <Button variant="primary" onClick={() => (view === 'people' ? setView('roster') : null, setEditing(blankShift(0, d.startTime)))}>
                  <Plus size={16} /> Add shift
                </Button>
              </>
            )}
          </>
        }
      />

      {(unfilled > 0 || clashes.length > 0 || (!inBudget && cost > 0)) && !readOnly && (
        <div className="mb-4 space-y-2">
          {unfilled > 0 && (
            <div className="card flex items-center gap-2 p-3 text-sm">
              <Users size={16} className="text-amber-600" />
              <span className="flex-1">
                {unfilled} position{unfilled === 1 ? '' : 's'} on your team’s shifts still need someone.
              </span>
            </div>
          )}
          {clashes.length > 0 && (
            <div className="card flex items-start gap-2 p-3 text-sm">
              <AlertTriangle size={16} className="mt-0.5 text-red-500" />
              <ul className="flex-1 space-y-0.5">
                {clashes.slice(0, 4).map((c, i) => {
                  const p = d.crew.find((x) => x.id === c.crewId)
                  return (
                    <li key={i}>
                      <strong>{p?.name || p?.role || 'Someone'}</strong> is on <em>{c.a.section}</em> and <em>{c.b.section}</em> at the same time ({relLabel(c.a.day).toLowerCase()}).
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {!inBudget && cost > 0 && (
            <div className="card flex flex-wrap items-center gap-3 p-3 text-sm">
              <Wallet size={16} className="text-brand-600" />
              <span className="flex-1">Your team’s shifts cost {money(cost)} but aren’t in the budget yet.</span>
              <Button size="sm" onClick={() => update((x) => void x.budget.push({ id: uid('b'), category: 'Staffing', name: 'Crew', estimate: cost, actual: 0, paid: 0, source: 'crew' }))}>
                Add to budget
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm sm:w-fit">
        {(
          [
            ['roster', `Roster · ${d.shifts.length}`],
            ['people', `People · ${d.crew.length}`],
          ] as const
        ).map(([k, label]) => (
          <button key={k} onClick={() => setView(k)} className={`flex-1 rounded-md px-4 py-1.5 font-medium sm:flex-none ${view === k ? 'bg-white shadow-sm' : 'text-slate-500'}`}>
            {label}
          </button>
        ))}
      </div>

      {view === 'roster' ? (
        d.shifts.length ? (
          <Roster onEdit={setEditing} personFilter={personFilter} clearFilter={() => setPersonFilter(null)} />
        ) : (
          <div className="card">
            <Empty
              icon={<HardHat />}
              title="No roster yet"
              body="Plan who does what and when — from mowing the lawn days before, through bump in, service and pack-down, to the cleaners the day after."
              action={
                !readOnly && (
                  <div className="flex gap-2">
                    <Button onClick={() => setEditing(blankShift(0, d.startTime))}>Add a shift</Button>
                    <Button variant="primary" onClick={suggest}>
                      <Sparkles size={16} /> Suggest a roster
                    </Button>
                  </div>
                )
              }
            />
          </div>
        )
      ) : (
        <People
          onShowShifts={(id) => {
            setPersonFilter(id)
            setView('roster')
          }}
        />
      )}

      {editing && <ShiftEditor key={editing.id} initial={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
