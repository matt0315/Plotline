import { ArrowRight, CalendarDays, CheckCircle2, MapPin, Clock, Users, Wallet, Store, HardHat, FileCheck2, LayoutGrid } from 'lucide-react'
import { useEvent, update, useMoney } from '../store/event'
import { useUI } from '../store/ui'
import { usePlan } from '../store/plans'
import { budgetTotals, loadList, nextSteps, runSheet, seatingStats } from '../lib/derived'
import { EVENT_TEMPLATES } from '../data/eventTemplates'
import { daysUntil, fmt12 } from '../lib/time'
import { openPositions, relLabel } from '../lib/roster'
import { StaticPlan } from './Layout/render'
import { VenueSearch } from '../components/VenueSearch'
import { Stat, Select } from '../components/ui'
import type { EventType } from '../types/event'

const Card = ({ title, icon, onOpen, children }: { title: string; icon: React.ReactNode; onOpen: () => void; children: React.ReactNode }) => (
  <div className="card flex flex-col p-4">
    <button onClick={onOpen} className="group mb-3 flex items-center gap-2 text-left">
      <span className="text-slate-400">{icon}</span>
      <h2 className="flex-1 text-sm font-semibold">{title}</h2>
      <ArrowRight size={14} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
    </button>
    <div className="flex-1">{children}</div>
  </div>
)

const Bar = ({ value, max, tone = 'brand' }: { value: number; max: number; tone?: 'brand' | 'red' | 'green' }) => (
  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
    <div className={`h-full ${tone === 'red' ? 'bg-red-500' : tone === 'green' ? 'bg-emerald-500' : 'bg-brand-500'}`} style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%` }} />
  </div>
)

export const Overview = () => {
  const d = useEvent((s) => s.doc)!
  const money = useMoney()
  const readOnly = useEvent((s) => s.readOnly)
  const go = useUI((s) => s.go)
  const plan = usePlan(d.layout.basePlan?.planId)
  const st = seatingStats(d)
  const b = budgetTotals(d)
  const steps = nextSteps(d)
  const rows = runSheet(d).filter((r) => r.phase === 'event')
  const days = daysUntil(d.date)
  const booked = d.suppliers.filter((s) => s.status === 'booked' || s.status === 'paid').length
  const live = d.suppliers.filter((s) => s.status !== 'declined').length
  const rsvp = { yes: d.guests.filter((g) => g.rsvp === 'yes').length, no: d.guests.filter((g) => g.rsvp === 'no').length, pending: d.guests.filter((g) => g.rsvp === 'pending' || g.rsvp === 'maybe').length }
  const load = loadList(d)

  return (
    <div className={readOnly ? 'pointer-events-none' : ''}>
      {/* Event header — edit in place */}
      <div className="card mb-5 p-4 sm:p-5">
        <input
          className="w-full rounded-md bg-transparent text-2xl font-semibold tracking-tight outline-none focus:ring-2 focus:ring-brand-100"
          value={d.name}
          onChange={(e) => update((x) => void (x.name = e.target.value), 'name')}
        />
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex items-center gap-2">
            <CalendarDays size={16} className="shrink-0 text-slate-400" />
            <input type="date" className="cell" value={d.date} onChange={(e) => update((x) => void (x.date = e.target.value), 'date')} />
          </label>
          <label className="flex items-center gap-2">
            <Clock size={16} className="shrink-0 text-slate-400" />
            <input type="time" className="cell" value={d.startTime} onChange={(e) => update((x) => void (x.startTime = e.target.value), 'start')} />
          </label>
          <label className="flex items-center gap-2">
            <Users size={16} className="shrink-0 text-slate-400" />
            <input
              type="number"
              min={1}
              className="cell tabular-nums"
              value={d.guestCount}
              onChange={(e) => update((x) => void (x.guestCount = Math.max(0, parseInt(e.target.value) || 0)), 'guestCount')}
            />
            <span className="text-slate-500">guests</span>
          </label>
          <Select<EventType>
            value={d.type}
            options={(Object.keys(EVENT_TEMPLATES) as EventType[]).map((k) => ({ value: k, label: EVENT_TEMPLATES[k].label }))}
            onChange={(v) => update((x) => void (x.type = v))}
          />
          <div className="flex min-w-0 items-center gap-2">
            <MapPin size={16} className="shrink-0 text-slate-400" />
            <div className="min-w-0 flex-1">
              <VenueSearch value={d.venue.name} onPick={(p) => update((x) => void (x.venue = { name: p.name, address: p.address, lat: p.lat, lng: p.lng, zoom: 18 }))} />
            </div>
          </div>
        </div>
        {days != null && (
          <p className="mt-3 text-sm text-slate-500">
            {days > 0 ? (
              <>
                <strong className="text-brand-600">{days}</strong> day{days === 1 ? '' : 's'} to go
              </>
            ) : days === 0 ? (
              <strong className="text-brand-600">It's today — good luck!</strong>
            ) : (
              `${-days} days ago`
            )}
          </p>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* What's next */}
        <div className="card p-4 lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold">What's next</h2>
          {steps.length ? (
            <ul className="space-y-1">
              {steps.map((s, i) => (
                <li key={i}>
                  <button onClick={() => go(s.tab)} className="group flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                    <span className="flex-1">{s.text}</span>
                    <ArrowRight size={14} className="mt-0.5 text-slate-300 group-hover:text-brand-600" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 size={16} /> Everything's in order.
            </p>
          )}
        </div>

        {/* Floor plan thumbnail */}
        <button onClick={() => go('layout')} className="card group relative overflow-hidden text-left lg:col-span-2">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
            <LayoutGrid size={16} className="text-slate-400" />
            <span className="flex-1 text-sm font-semibold">Floor plan</span>
            <span className="text-xs text-slate-500">
              {st.capacity} seats · {d.layout.items.length} items
            </span>
          </div>
          <div className="flex h-64 items-center justify-center bg-slate-50 p-3">
            {d.layout.items.length || plan ? (
              <StaticPlan items={d.layout.items} spaces={d.layout.spaces} guests={d.guests} base={plan && d.layout.basePlan ? { plan, placement: d.layout.basePlan } : undefined} className="h-full w-full" />
            ) : (
              <span className="text-sm text-slate-400">Empty — click to start</span>
            )}
          </div>
        </button>

        <Card title="Guests" icon={<Users size={16} />} onOpen={() => go('guests')}>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Invited" value={d.guests.length} />
            <Stat label="Attending" value={rsvp.yes} />
            <Stat label="Waiting" value={rsvp.pending} />
          </div>
          <div className="mt-3 space-y-1">
            <div className="flex justify-between text-xs text-slate-500">
              <span>Seated</span>
              <span className="tabular-nums">
                {st.seated} / {st.attending}
              </span>
            </div>
            <Bar value={st.seated} max={st.attending} tone={st.seated === st.attending && st.attending ? 'green' : 'brand'} />
          </div>
        </Card>

        <Card title="Budget" icon={<Wallet size={16} />} onOpen={() => go('budget')}>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Forecast" value={money(b.forecast)} sub={b.target ? `of ${money(b.target)}` : undefined} />
            <Stat label={b.variance < 0 ? 'Over' : 'Under'} value={money(Math.abs(b.variance))} tone={b.variance < 0 ? 'red' : 'green'} />
          </div>
          <div className="mt-3 space-y-1">
            <div className="flex justify-between text-xs text-slate-500">
              <span>Paid</span>
              <span className="tabular-nums">
                {money(b.paid)} · {money(b.due)} due
              </span>
            </div>
            <Bar value={b.paid} max={b.actual || b.forecast} tone="green" />
          </div>
        </Card>

        <Card title="Suppliers" icon={<Store size={16} />} onOpen={() => go('suppliers')}>
          <Stat label="Booked" value={`${booked} / ${live}`} />
          <ul className="mt-2 space-y-1">
            {d.suppliers
              .filter((s) => s.status === 'researching' || s.status === 'quoted')
              .slice(0, 4)
              .map((s) => (
                <li key={s.id} className="flex justify-between gap-2 text-xs">
                  <span className="truncate text-slate-600">{s.name || s.category}</span>
                  <span className="shrink-0 text-amber-700 capitalize">{s.status}</span>
                </li>
              ))}
          </ul>
        </Card>

        <Card title="Run sheet" icon={<Clock size={16} />} onOpen={() => go('run')}>
          <ul className="space-y-1.5">
            {rows.slice(0, 6).map((r) => (
              <li key={r.id} className="flex gap-3 text-sm">
                <span className="w-16 shrink-0 text-slate-500 tabular-nums">{fmt12(r.time)}</span>
                <span className="truncate">{r.title}</span>
              </li>
            ))}
            {!rows.length && <li className="text-sm text-slate-400">No timings yet</li>}
          </ul>
        </Card>

        <Card title="Crew roster & docs" icon={<HardHat size={16} />} onOpen={() => go('crew')}>
          <div className="grid grid-cols-2 gap-2">
            <Stat
              label="Crew"
              value={d.crew.length}
              sub={
                d.shifts.length
                  ? `${d.shifts.length} shifts${openPositions(d) ? ` · ${openPositions(d)} to fill` : ''}${Math.min(...d.shifts.map((s) => s.day)) < 0 ? ` · from ${relLabel(Math.min(...d.shifts.map((s) => s.day))).toLowerCase()}` : ''}`
                  : 'No roster yet'
              }
            />
            <button onClick={() => go('docs')} className="text-left">
              <Stat label="Forms" value={d.docs.length} sub={`${d.docs.reduce((s, f) => s + f.responses.length, 0)} responses`} />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-1 text-xs text-slate-400">
            <FileCheck2 size={12} /> Set-up to pack-down, plus safety forms
          </div>
        </Card>

        <Card title="Load list" icon={<LayoutGrid size={16} />} onOpen={() => go('layout')}>
          <ul className="space-y-1">
            {load.slice(0, 7).map(([k, n]) => (
              <li key={k} className="flex justify-between text-sm">
                <span className="truncate text-slate-600">{k}</span>
                <span className="font-medium tabular-nums">{n}</span>
              </li>
            ))}
            {!load.length && <li className="text-sm text-slate-400">Built from your floor plan and site map</li>}
          </ul>
        </Card>
      </div>
    </div>
  )
}
