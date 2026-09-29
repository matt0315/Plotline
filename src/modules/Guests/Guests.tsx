import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Upload, ClipboardPaste, Trash2, UserPlus, Search, Users, Download, Wand2 } from 'lucide-react'
import type { Guest, Rsvp } from '../../types/event'
import { useEvent, update } from '../../store/event'
import { useUI } from '../../store/ui'
import { isSeating } from '../../lib/geometry'
import { seatingStats } from '../../lib/derived'
import { download, slug } from '../../lib/share'
import { autoSeat, newGuest, parseGuests, seatGuest } from './guestActions'
import { Button, Cell, Empty, IconButton, Modal, PageHeader, Select, toast, focusSoon } from '../../components/ui'

const RSVP_TEXT: Record<Rsvp, string> = { yes: 'text-emerald-700 font-medium', no: 'text-red-600', maybe: 'text-amber-700', pending: 'text-slate-500' }
const RSVPS: { value: Rsvp; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'yes', label: 'Attending' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'no', label: 'Declined' },
]

type Filter = 'all' | Rsvp | 'unseated'

const edit = (id: string, field: keyof Guest, value: string) =>
  update((d) => {
    const g = d.guests.find((x) => x.id === id)
    if (g) (g as unknown as Record<string, string>)[field] = value
  }, `guest-${field}-${id}`)

const toCsv = (guests: Guest[], tableName: (id: string) => string) => {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const rows = [['Name', 'Group', 'RSVP', 'Dietary', 'Email', 'Phone', 'Table', 'Notes']]
  for (const g of guests) rows.push([g.name, g.group, g.rsvp, g.dietary, g.email, g.phone, g.seat ? tableName(g.seat.itemId) : '', g.notes])
  return rows.map((r) => r.map(esc).join(',')).join('\n')
}

export default function Guests() {
  const d = useEvent((s) => s.doc)!
  const readOnly = useEvent((s) => s.readOnly)
  const focusId = useUI((s) => s.focusId)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [paste, setPaste] = useState(false)
  const [pasted, setPasted] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const st = seatingStats(d)

  const tables = useMemo(() => d.layout.items.filter(isSeating).filter((i) => i.kind !== 'chair'), [d.layout.items])
  const tableName = (id: string) => d.layout.items.find((i) => i.id === id)?.label || 'Table'
  const groups = useMemo(() => [...new Set(d.guests.map((g) => g.group).filter(Boolean))].sort(), [d.guests])

  const list = d.guests.filter((g) => {
    if (q && !`${g.name} ${g.group} ${g.email} ${g.dietary}`.toLowerCase().includes(q.toLowerCase())) return false
    if (filter === 'unseated') return !g.seat && g.rsvp !== 'no'
    if (filter !== 'all') return g.rsvp === filter
    return true
  })

  useEffect(() => {
    if (!focusId) return
    const el = document.getElementById(`row-${focusId}`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el?.querySelector('input')?.focus()
  }, [focusId])

  const add = (over: Partial<Guest> = {}) => {
    const g = newGuest(over)
    update((x) => void x.guests.push(g))
    focusSoon(`#row-${g.id} input`)
  }

  const importText = (text: string) => {
    const guests = parseGuests(text)
    if (!guests.length) return toast('No names found')
    update((x) => void x.guests.push(...guests))
    toast(`Added ${guests.length} guest${guests.length === 1 ? '' : 's'}`)
  }

  const counts: Record<Filter, number> = {
    all: d.guests.length,
    yes: d.guests.filter((g) => g.rsvp === 'yes').length,
    pending: d.guests.filter((g) => g.rsvp === 'pending').length,
    maybe: d.guests.filter((g) => g.rsvp === 'maybe').length,
    no: d.guests.filter((g) => g.rsvp === 'no').length,
    unseated: st.unseated,
  }

  return (
    <div>
      <PageHeader
        title="Guests"
        sub={`${d.guests.length} invited · ${counts.yes} attending · ${st.seated} seated`}
        actions={
          !readOnly && (
            <>
              <Button onClick={() => download(new Blob([toCsv(d.guests, tableName)], { type: 'text/csv' }), `${slug(d.name)}-guests.csv`)} disabled={!d.guests.length}>
                <Download size={16} /> CSV
              </Button>
              <Button onClick={() => file.current?.click()}>
                <Upload size={16} /> Import
              </Button>
              <Button onClick={() => setPaste(true)}>
                <ClipboardPaste size={16} /> Paste list
              </Button>
              <Button variant="primary" onClick={() => add()}>
                <Plus size={16} /> Add guest
              </Button>
            </>
          )
        }
      />
      <input
        ref={file}
        type="file"
        hidden
        accept=".csv,.txt,text/csv,text/plain"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) importText(await f.text())
        }}
      />

      {d.guests.length === 0 ? (
        <div className="card">
          <Empty
            icon={<Users />}
            title="Add your guest list"
            body="Paste names from a spreadsheet or email — one per line, optionally with a group after a comma. Or import a CSV."
            action={
              !readOnly && (
                <div className="flex gap-2">
                  <Button onClick={() => setPaste(true)}>
                    <ClipboardPaste size={16} /> Paste names
                  </Button>
                  <Button variant="primary" onClick={() => add()}>
                    <Plus size={16} /> Add one
                  </Button>
                </div>
              )
            }
          />
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" placeholder="Search guests" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-1">
              {(['all', 'yes', 'pending', 'maybe', 'no', 'unseated'] as Filter[]).map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-xs font-medium ${filter === f ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}>
                  {f === 'all' ? 'All' : f === 'yes' ? 'Attending' : f === 'no' ? 'Declined' : f === 'unseated' ? 'Not seated' : f[0].toUpperCase() + f.slice(1)} · {counts[f]}
                </button>
              ))}
            </div>
            {st.unseated > 0 && tables.length > 0 && !readOnly && (
              <Button
                size="sm"
                className="ml-auto"
                onClick={() => {
                  const r = autoSeat()
                  toast(r.left ? `Seated ${r.seated}. ${r.left} need more seats.` : `Seated ${r.seated} — groups kept together`)
                }}
              >
                <Wand2 size={14} /> Auto-seat
              </Button>
            )}
          </div>

          <datalist id="groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>

          <div className="card overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
                <tr>
                  <th className="w-[22%] px-3 py-2 font-medium">Name</th>
                  <th className="w-[14%] px-3 py-2 font-medium">Group</th>
                  <th className="w-[12%] px-3 py-2 font-medium">RSVP</th>
                  <th className="w-[14%] px-3 py-2 font-medium">Dietary</th>
                  <th className="w-[18%] px-3 py-2 font-medium">Email</th>
                  <th className="w-[14%] px-3 py-2 font-medium">Table</th>
                  <th className="w-[6%]" />
                </tr>
              </thead>
              <tbody className={readOnly ? 'pointer-events-none' : ''}>
                {list.map((g) => (
                  <tr key={g.id} id={`row-${g.id}`} className={`group border-b border-slate-100 last:border-0 ${focusId === g.id ? 'bg-brand-50' : ''}`}>
                    <td className="px-1 py-0.5">
                      <div className="flex items-center">
                        {g.plusOneOf && <span className="pl-2 text-xs text-slate-400">+1</span>}
                        <Cell value={g.name} placeholder="Name" onChange={(v) => edit(g.id, 'name', v)} />
                      </div>
                    </td>
                    <td className="px-1">
                      <input className="cell" list="groups" value={g.group} placeholder="—" onChange={(e) => edit(g.id, 'group', e.target.value)} />
                    </td>
                    <td className="px-1">
                      <Select value={g.rsvp} options={RSVPS} onChange={(v) => edit(g.id, 'rsvp', v)} className={RSVP_TEXT[g.rsvp]} />
                    </td>
                    <td className="px-1">
                      <Cell value={g.dietary} placeholder="—" onChange={(v) => edit(g.id, 'dietary', v)} />
                    </td>
                    <td className="px-1">
                      <Cell value={g.email} placeholder="—" type="email" onChange={(v) => edit(g.id, 'email', v)} />
                    </td>
                    <td className="px-1">
                      <select
                        className="cell cursor-pointer"
                        value={g.seat?.itemId ?? ''}
                        disabled={g.rsvp === 'no'}
                        onChange={(e) => {
                          const t = tables.find((x) => x.id === e.target.value)
                          if (!t) return seatGuest(g.id, undefined)
                          const taken = new Set(d.guests.filter((o) => o.id !== g.id && o.seat?.itemId === t.id).map((o) => o.seat!.index))
                          const idx = [...Array(t.seats).keys()].find((i) => !taken.has(i))
                          if (idx === undefined) return toast(`${t.label || 'That table'} is full`)
                          seatGuest(g.id, { itemId: t.id, index: idx })
                        }}
                      >
                        <option value="">{g.rsvp === 'no' ? '—' : 'Not seated'}</option>
                        {tables.map((t) => {
                          const used = d.guests.filter((o) => o.seat?.itemId === t.id).length
                          return (
                            <option key={t.id} value={t.id}>
                              {t.label || 'Table'} ({used}/{t.seats})
                            </option>
                          )
                        })}
                      </select>
                    </td>
                    <td className="px-1">
                      <div className="flex justify-end opacity-0 transition group-hover:opacity-100 max-sm:opacity-100">
                        {!g.plusOneOf && (
                          <IconButton title="Add plus-one" onClick={() => add({ name: `Guest of ${g.name.split(' ')[0] || 'guest'}`, group: g.group, plusOneOf: g.id, rsvp: g.rsvp })}>
                            <UserPlus size={15} />
                          </IconButton>
                        )}
                        <IconButton title="Remove" onClick={() => update((x) => void (x.guests = x.guests.filter((y) => y.id !== g.id)))}>
                          <Trash2 size={15} />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!list.length && <p className="p-6 text-center text-sm text-slate-500">No guests match.</p>}
          </div>
          {!readOnly && (
            <button onClick={() => add()} className="mt-2 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-white hover:text-slate-800">
              <Plus size={16} /> Add guest
            </button>
          )}
        </>
      )}

      <Modal
        open={paste}
        onClose={() => setPaste(false)}
        title="Paste your guest list"
        footer={
          <>
            <Button onClick={() => setPaste(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!parseGuests(pasted).length}
              onClick={() => {
                importText(pasted)
                setPasted('')
                setPaste(false)
              }}
            >
              Add {parseGuests(pasted).length || ''} guests
            </Button>
          </>
        }
      >
        <p className="mb-2 text-sm text-slate-600">One guest per line. Add a group after a comma if you like. Spreadsheet columns with a header row work too.</p>
        <textarea
          autoFocus
          className="input h-56 font-mono text-xs"
          placeholder={'Alex Rivera, Bride family\nSam Chen, Bride family\nJordan Lee, College friends, jordan@email.com, yes'}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
        />
      </Modal>
    </div>
  )
}
