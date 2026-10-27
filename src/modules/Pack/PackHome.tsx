import { CalendarDays, ClipboardList, FileCheck2, LayoutGrid, MapPin, Map as MapIcon, Navigation, Phone, Clock, Utensils, Users } from 'lucide-react'
import type { EventDoc } from '../../types/event'
import { useEvent } from '../../store/event'
import { useUI } from '../../store/ui'
import { loadList, runDays, runSheet, type RunRow } from '../../lib/derived'
import { namesThem, packShifts } from '../../lib/packs'
import { dateLabel, dayTitle, eventLength } from '../../lib/roster'
import { fmt12 } from '../../lib/time'
import { Button } from '../../components/ui'

const Card = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
  <section className="card overflow-hidden">
    <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-sm font-semibold">
      <span className="text-slate-400">{icon}</span>
      {title}
    </header>
    <div className="p-4 pt-3">{children}</div>
  </section>
)

/** Dietary needs per table, without names. */
const dietaryByTable = (d: EventDoc) => {
  const tables = new Map<string, Map<string, number>>()
  const label = (id?: string) => (id ? d.layout.items.find((i) => i.id === id)?.label || 'Unnamed table' : 'Not seated yet')
  for (const g of d.guests) {
    const diet = g.dietary.trim()
    if (!diet) continue
    const t = label(g.seat?.itemId)
    const m = tables.get(t) ?? new Map<string, number>()
    m.set(diet, (m.get(diet) ?? 0) + 1)
    tables.set(t, m)
  }
  return [...tables.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
}

/** What someone opening their pack sees first: when they're needed, where, and what to read or fill in. */
export default function PackHome() {
  const d = useEvent((s) => s.doc)!
  const pack = useUI((s) => s.pack)!
  const go = useUI((s) => s.go)
  const a = pack.audience
  const o = pack.opts
  const len = eventLength(d)
  const all = runSheet(d)
  const days = runDays(d, all)

  // Their rows: their arrivals, their shifts, and run sheet items that name them.
  const shifts = new Set(packShifts(d, a).map((s) => s.id))
  const named = namesThem(d, a)
  const mine = (r: RunRow) =>
    r.source ? (r.source.kind === 'supplier' ? a.kind === 'supplier' && r.source.id === a.id : shifts.has(r.source.id)) : named(r)
  const rows = all.filter(mine)
  const myDays = [...new Set(rows.map((r) => r.day))]

  const v = d.venue
  const directions = v.lat || v.lng ? `https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lng}` : v.address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(v.address)}` : ''
  const contacts = [
    ...d.suppliers.filter((s) => s.phone || s.contact).map((s) => ({ id: s.id, name: s.contact || s.name, what: s.name && s.contact ? `${s.name} · ${s.category}` : s.category, phone: s.phone })),
    ...d.crew.filter((c) => c.phone).map((c) => ({ id: c.id, name: c.name, what: c.role, phone: c.phone })),
  ]
  const diet = o.dietary ? dietaryByTable(d) : []
  const load = o.load ? loadList(d) : []
  const range = days.length > 1 && d.date ? `${dateLabel(d.date, days[0])} – ${dateLabel(d.date, days[days.length - 1])}` : d.date ? dateLabel(d.date, 0) : ''

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="card p-5">
        <p className="text-xs font-semibold tracking-wide text-brand-600 uppercase">Pack for {a.label}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{d.name}</h1>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
          {range && (
            <span className="flex items-center gap-1.5">
              <CalendarDays size={15} className="text-slate-400" />
              {range}
              {d.startTime && days.length === 1 ? ` · starts ${fmt12(d.startTime)}` : ''}
            </span>
          )}
          {(v.name || v.address) && (
            <span className="flex items-center gap-1.5">
              <MapPin size={15} className="text-slate-400" />
              {[v.name, v.address].filter(Boolean).join(', ')}
            </span>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {directions && (
            <a href={directions} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">
              <Navigation size={14} /> Directions
            </a>
          )}
          {o.floor && d.layout.items.length > 0 && (
            <Button size="sm" onClick={() => go('layout')}>
              <LayoutGrid size={14} /> Floor plan
            </Button>
          )}
          {o.site && (
            <Button size="sm" onClick={() => go('site')}>
              <MapIcon size={14} /> Site map
            </Button>
          )}
          {o.run && (
            <Button size="sm" onClick={() => go('run')}>
              <Clock size={14} /> Full run sheet
            </Button>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-400">This page is live — it always shows the latest plan.</p>
      </div>

      <Card icon={<Clock size={15} />} title={rows.length ? 'Your times' : 'Times'}>
        {rows.length ? (
          <div className="space-y-3">
            {myDays.map((day) => (
              <div key={day}>
                {(myDays.length > 1 || len > 1 || day !== 0) && <h3 className="mb-1 text-xs font-semibold text-slate-500">{dayTitle(d.date, day, len)}</h3>}
                <ul className="divide-y divide-slate-100">
                  {rows
                    .filter((r) => r.day === day)
                    .map((r) => (
                      <li key={r.id} className="flex gap-3 py-1.5 text-sm">
                        <span className="w-[72px] shrink-0 font-medium tabular-nums">{fmt12(r.time)}</span>
                        <span className="min-w-0 flex-1">
                          {r.title}
                          {(r.location || r.notes) && <span className="block text-xs text-slate-500">{[r.location, r.notes].filter(Boolean).join(' · ')}</span>}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No times set for you yet. {o.run ? 'The full run sheet has the whole plan.' : 'Check back — this page updates as the plan changes.'}</p>
        )}
      </Card>

      {d.docs.length > 0 && (
        <Card icon={<FileCheck2 size={15} />} title="To read or fill in">
          <ul className="space-y-1">
            {d.docs.map((f) => (
              <li key={f.id}>
                <button onClick={() => go('docs', f.id)} className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50">
                  <span className="font-medium text-brand-700">{f.title || 'Untitled form'}</span>
                  {f.description && <span className="block text-xs text-slate-500">{f.description}</span>}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {o.dietary && (
        <Card icon={<Utensils size={15} />} title="Dietary needs by table">
          {diet.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {diet.map(([table, m]) => (
                <li key={table} className="flex gap-3 py-1.5">
                  <span className="w-32 shrink-0 font-medium">{table}</span>
                  <span className="text-slate-600">{[...m.entries()].map(([k, n]) => `${n} × ${k}`).join(' · ')}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No dietary needs recorded yet.</p>
          )}
          <p className="mt-2 text-xs text-slate-400">{d.guests.length} guests attending or still to reply.</p>
        </Card>
      )}

      {o.load && (
        <Card icon={<ClipboardList size={15} />} title="Load list">
          {load.length ? (
            <ul className="grid gap-x-6 text-sm sm:grid-cols-2">
              {load.map(([what, n]) => (
                <li key={what} className="flex justify-between gap-3 border-b border-slate-100 py-1">
                  <span>{what}</span>
                  <span className="font-medium tabular-nums">{n}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Nothing on the floor plan yet.</p>
          )}
        </Card>
      )}

      {o.contacts && contacts.length > 0 && (
        <Card icon={<Users size={15} />} title="Contacts">
          <ul className="divide-y divide-slate-100 text-sm">
            {contacts.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-1.5">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{c.name}</span>
                  {c.what && <span className="block text-xs text-slate-500">{c.what}</span>}
                </span>
                {c.phone && (
                  <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-1 rounded-md px-2 py-1 text-brand-600 hover:bg-brand-50">
                    <Phone size={13} /> {c.phone}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
