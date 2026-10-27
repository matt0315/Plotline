import { Plus, Trash2, Link2, FileDown, ChevronUp, ChevronDown } from 'lucide-react'
import type { Phase, ScheduleItem } from '../../types/event'
import { useEvent, update } from '../../store/event'
import { useUI } from '../../store/ui'
import { runDays, runSheet, type RunRow } from '../../lib/derived'
import { addMinutes, fmt12, toMinutes } from '../../lib/time'
import { uid } from '../../lib/id'
import { dateLabel, dayRole, dayTitle, eventLength } from '../../lib/roster'
import { Button, Cell, IconButton, PageHeader, focusSoon } from '../../components/ui'

const PHASES: { id: Phase; label: string; tone: string }[] = [
  { id: 'setup', label: 'Set-up', tone: 'bg-sky-500' },
  { id: 'event', label: 'Event', tone: 'bg-brand-500' },
  { id: 'breakdown', label: 'Pack-down', tone: 'bg-slate-400' },
]
const TONE: Record<Phase, string> = { setup: 'bg-sky-500', event: 'bg-brand-500', breakdown: 'bg-slate-400' }
const ROLE_LABEL: Record<Phase, string> = { setup: 'Set-up', event: 'Event', breakdown: 'Pack-down' }

const edit = (id: string, fn: (s: ScheduleItem) => void, key: string) =>
  update((d) => {
    const s = d.schedule.find((x) => x.id === id)
    if (s) fn(s)
  }, `run-${key}-${id}`)

/** Move a row and everything after it on the same day (and, on the first day, in the same phase). */
const shiftFrom = (row: RunRow, delta: number, rows: RunRow[]) => {
  const after = rows.filter((r) => r.day === row.day && r.phase === row.phase && !r.source)
  const from = after.findIndex((r) => r.id === row.id)
  const ids = new Set(after.slice(from).map((r) => r.id))
  update((d) => {
    for (const s of d.schedule) if (ids.has(s.id)) s.time = addMinutes(s.time, delta)
  })
}

/** Move an item to another day. Landing on the first day, it keeps the role of the day it came from. */
const moveToDay = (id: string, day: number, len: number) =>
  update((d) => {
    const s = d.schedule.find((x) => x.id === id)
    if (!s) return
    if (day === 0) s.phase = (s.day ?? 0) === 0 ? s.phase : dayRole(s.day!, len)
    else s.phase = dayRole(day, len)
    if (day === 0) delete s.day
    else s.day = day
  })

const Row = ({ r, rows, dayOptions, readOnly }: { r: RunRow; rows: RunRow[]; dayOptions: { value: number; label: string }[]; readOnly: boolean }) => {
  const go = useUI((s) => s.go)
  const len = eventLength(useEvent((s) => s.doc)!)
  if (r.source)
    return (
      <div className="flex items-center gap-2 bg-slate-50/60 px-2 py-1.5 text-sm text-slate-600">
        <span className="w-[122px] shrink-0 px-2 tabular-nums">{fmt12(r.time)}</span>
        <span className="w-14 shrink-0" />
        <span className="min-w-0 flex-1 truncate px-2 italic">{r.title}</span>
        <span className="hidden w-40 truncate px-2 text-xs md:block">{r.owner}</span>
        <button onClick={() => go(r.source!.kind === 'supplier' ? 'suppliers' : 'crew', r.source!.id)} className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-brand-600 hover:bg-brand-50">
          <Link2 size={12} /> {r.source.kind === 'supplier' ? 'Supplier' : 'Crew'}
        </button>
      </div>
    )
  return (
    <div id={`run-${r.id}`} className={`group flex flex-wrap items-center gap-x-2 px-2 py-1 md:flex-nowrap ${readOnly ? 'pointer-events-none' : ''}`}>
      <input type="time" className="cell w-[122px] shrink-0 tabular-nums" value={r.time} onChange={(e) => edit(r.id, (s) => void (s.time = e.target.value), 'time')} />
      <label className="flex w-14 shrink-0 items-center text-xs text-slate-400" title="Duration (minutes)">
        <input
          className="cell px-1 text-right tabular-nums"
          inputMode="numeric"
          value={r.duration || ''}
          placeholder="0"
          onChange={(e) => edit(r.id, (s) => void (s.duration = Math.max(0, parseInt(e.target.value) || 0)), 'dur')}
        />
        m
      </label>
      <div className="min-w-0 flex-1 basis-40">
        <input data-title className="cell font-medium" value={r.title} placeholder="What happens" onChange={(e) => edit(r.id, (s) => void (s.title = e.target.value), 'title')} />
      </div>
      <div className="w-full md:w-40">
        <Cell value={r.owner} placeholder="Who" onChange={(v) => edit(r.id, (s) => void (s.owner = v), 'owner')} />
      </div>
      <div className="w-full md:w-36">
        <Cell value={r.location} placeholder="Where" onChange={(v) => edit(r.id, (s) => void (s.location = v), 'loc')} />
      </div>
      <div className="w-full md:w-48">
        <Cell value={r.notes} placeholder="Notes" onChange={(v) => edit(r.id, (s) => void (s.notes = v), 'notes')} />
      </div>
      <div className="flex shrink-0 items-center opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
        <select className="cell w-24 cursor-pointer text-xs text-slate-500" title="Move to another day" value={r.day} onChange={(e) => moveToDay(r.id, parseInt(e.target.value), len)}>
          {dayOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <IconButton title="Move this and everything after 15 min earlier" onClick={() => shiftFrom(r, -15, rows)}>
          <ChevronUp size={15} />
        </IconButton>
        <IconButton title="Move this and everything after 15 min later" onClick={() => shiftFrom(r, 15, rows)}>
          <ChevronDown size={15} />
        </IconButton>
        <IconButton title="Delete" onClick={() => update((x) => void (x.schedule = x.schedule.filter((s) => s.id !== r.id)))}>
          <Trash2 size={15} />
        </IconButton>
      </div>
    </div>
  )
}

const List = ({ list, ...p }: { list: RunRow[]; rows: RunRow[]; dayOptions: { value: number; label: string }[]; readOnly: boolean }) => (
  <div className="divide-y divide-slate-100">
    {list.map((r) => (
      <Row key={r.id} r={r} {...p} />
    ))}
    {!list.length && <p className="px-4 py-4 text-sm text-slate-400">Nothing yet.</p>}
  </div>
)

export default function RunSheet() {
  const d = useEvent((s) => s.doc)!
  const readOnly = useEvent((s) => s.readOnly)
  const rows = runSheet(d)
  const len = eventLength(d)
  const days = runDays(d, rows)
  const multi = days.length > 1
  // Any day already in use, plus one either side to move things onto.
  const dayOptions = Array.from({ length: days[days.length - 1] - days[0] + 3 }, (_, i) => days[0] - 1 + i).map((n) => ({ value: n, label: dayTitle('', n, len) }))

  const add = (day: number, phase: Phase) => {
    const same = rows.filter((r) => r.day === day && r.phase === phase && !r.source)
    const last = same[same.length - 1]
    const start = day === 0 || dayRole(day, len) === 'event' ? d.startTime : '08:00'
    const item: ScheduleItem = { id: uid('r'), time: last ? addMinutes(last.time, last.duration || 15) : start, duration: 15, title: '', owner: '', location: '', notes: '', phase }
    if (day !== 0) item.day = day
    update((x) => void x.schedule.push(item))
    focusSoon(`#run-${item.id} input[data-title]`)
  }

  const setLength = (n: number) =>
    update((x) => {
      // Pack-down days stay the same distance after the last event day.
      const by = n - len
      const later = (day: number | undefined) => (day !== undefined && day >= len ? day + by : day)
      for (const s of x.schedule) {
        s.day = later(s.day)
        if (s.day) s.phase = dayRole(s.day, n)
      }
      for (const sh of x.shifts) sh.day = later(sh.day)!
      for (const s of x.suppliers) {
        s.arrivalDay = later(s.arrivalDay)
        s.departureDay = later(s.departureDay)
      }
      if (n === 1) delete x.eventDays
      else x.eventDays = n
    })

  const first = rows[0]
  const last = rows[rows.length - 1]
  const exportPdf = async () => (await import('../../lib/pdf')).exportPack(d, ['run'])
  const listProps = { rows, dayOptions, readOnly }

  return (
    <div>
      <PageHeader
        title="Run sheet"
        sub={
          !first
            ? 'Every beat of the day, in order'
            : multi
              ? `${days.length} days${d.date ? ` · ${dateLabel(d.date, days[0])} – ${dateLabel(d.date, days[days.length - 1])}` : ''} · ${rows.length} items · supplier arrivals and crew calls appear automatically`
              : `${fmt12(first.time)} – ${fmt12(addMinutes(last.time, last.duration))} · ${rows.length} items · supplier arrivals and crew calls appear automatically`
        }
        actions={
          <>
            {!readOnly && (
              <select className="input w-auto cursor-pointer text-sm" title="How many days the event itself runs" value={len} onChange={(e) => setLength(parseInt(e.target.value))}>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? 'One-day event' : `${n}-day event`}
                  </option>
                ))}
              </select>
            )}
            <Button onClick={exportPdf}>
              <FileDown size={16} /> Print / PDF
            </Button>
          </>
        }
      />
      {!readOnly && (
        <button onClick={() => add(days[0] - 1, 'setup')} className="mb-4 flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800">
          <Plus size={14} /> Add a set-up day before
        </button>
      )}
      <div className="space-y-5">
        {days.map((day) => {
          const list = rows.filter((r) => r.day === day)
          const title = dayTitle(d.date, day, len)
          if (day === 0)
            return (
              <div key={day} className="space-y-5">
                {multi && <h2 className="px-1 pt-1 text-sm font-semibold text-slate-700">{title}</h2>}
                {PHASES.map((p) => {
                  const inPhase = list.filter((r) => r.phase === p.id)
                  return (
                    <section key={p.id} className="card overflow-hidden">
                      <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
                        <span className={`h-2.5 w-2.5 rounded-full ${p.tone}`} />
                        <h2 className="text-sm font-semibold">{p.label}</h2>
                        <span className="text-xs text-slate-400">{inPhase.length}</span>
                        <div className="flex-1" />
                        {!readOnly && (
                          <Button size="sm" variant="ghost" onClick={() => add(0, p.id)}>
                            <Plus size={14} /> Add
                          </Button>
                        )}
                      </header>
                      <List list={inPhase} {...listProps} />
                    </section>
                  )
                })}
              </div>
            )
          const role = dayRole(day, len)
          return (
            <section key={day} className="card overflow-hidden">
              <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
                <span className={`h-2.5 w-2.5 rounded-full ${TONE[role]}`} />
                <h2 className="text-sm font-semibold">{title}</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">{ROLE_LABEL[role]}</span>
                <span className="text-xs text-slate-400">{list.length}</span>
                <div className="flex-1" />
                {!readOnly && (
                  <Button size="sm" variant="ghost" onClick={() => add(day, role)}>
                    <Plus size={14} /> Add
                  </Button>
                )}
              </header>
              <List list={list} {...listProps} />
            </section>
          )
        })}
      </div>
      {!readOnly && (
        <button onClick={() => add(days[days.length - 1] + 1, 'breakdown')} className="mt-4 flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800">
          <Plus size={14} /> Add a pack-down day after
        </button>
      )}
      {rows.some((r, i) => i > 0 && !r.source && !rows[i - 1].source && r.day === rows[i - 1].day && r.phase === rows[i - 1].phase && toMinutes(rows[i - 1].time) + rows[i - 1].duration > toMinutes(r.time) + 1) && (
        <p className="mt-3 text-xs text-amber-700">Some items overlap — that's fine for things happening in parallel.</p>
      )}
    </div>
  )
}
