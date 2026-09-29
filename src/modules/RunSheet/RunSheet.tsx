import { Plus, Trash2, Link2, FileDown, ChevronUp, ChevronDown } from 'lucide-react'
import type { Phase, ScheduleItem } from '../../types/event'
import { useEvent, update } from '../../store/event'
import { useUI } from '../../store/ui'
import { runSheet, type RunRow } from '../../lib/derived'
import { addMinutes, fmt12, toMinutes } from '../../lib/time'
import { uid } from '../../lib/id'
import { Button, Cell, IconButton, PageHeader, focusSoon } from '../../components/ui'

const PHASES: { id: Phase; label: string; tone: string }[] = [
  { id: 'setup', label: 'Set-up', tone: 'bg-sky-500' },
  { id: 'event', label: 'Event', tone: 'bg-brand-500' },
  { id: 'breakdown', label: 'Pack-down', tone: 'bg-slate-400' },
]

const edit = (id: string, fn: (s: ScheduleItem) => void, key: string) =>
  update((d) => {
    const s = d.schedule.find((x) => x.id === id)
    if (s) fn(s)
  }, `run-${key}-${id}`)

/** Move a row and everything after it in the same phase. */
const shiftFrom = (row: RunRow, delta: number, rows: RunRow[]) => {
  const after = rows.filter((r) => r.phase === row.phase && !r.source)
  const from = after.findIndex((r) => r.id === row.id)
  const ids = new Set(after.slice(from).map((r) => r.id))
  update((d) => {
    for (const s of d.schedule) if (ids.has(s.id)) s.time = addMinutes(s.time, delta)
  })
}

export default function RunSheet() {
  const d = useEvent((s) => s.doc)!
  const readOnly = useEvent((s) => s.readOnly)
  const go = useUI((s) => s.go)
  const rows = runSheet(d)

  const add = (phase: Phase) => {
    const inPhase = rows.filter((r) => r.phase === phase && !r.source)
    const last = inPhase[inPhase.length - 1]
    const item: ScheduleItem = { id: uid('r'), time: last ? addMinutes(last.time, last.duration || 15) : d.startTime, duration: 15, title: '', owner: '', location: '', notes: '', phase }
    update((x) => void x.schedule.push(item))
    focusSoon(`#run-${item.id} input[data-title]`)
  }

  const first = rows[0]?.time
  const last = rows[rows.length - 1]
  const exportPdf = async () => (await import('../../lib/pdf')).exportPack(d, ['run'])

  return (
    <div>
      <PageHeader
        title="Run sheet"
        sub={first ? `${fmt12(first)} – ${fmt12(addMinutes(last.time, last.duration))} · ${rows.length} items · supplier arrivals and crew calls appear automatically` : 'Every beat of the day, in order'}
        actions={
          <Button onClick={exportPdf}>
            <FileDown size={16} /> Print / PDF
          </Button>
        }
      />
      <div className="space-y-5">
        {PHASES.map((p) => {
          const list = rows.filter((r) => r.phase === p.id)
          return (
            <section key={p.id} className="card overflow-hidden">
              <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
                <span className={`h-2.5 w-2.5 rounded-full ${p.tone}`} />
                <h2 className="text-sm font-semibold">{p.label}</h2>
                <span className="text-xs text-slate-400">{list.length}</span>
                <div className="flex-1" />
                {!readOnly && (
                  <Button size="sm" variant="ghost" onClick={() => add(p.id)}>
                    <Plus size={14} /> Add
                  </Button>
                )}
              </header>
              <div className="divide-y divide-slate-100">
                {list.map((r) =>
                  r.source ? (
                    <div key={r.id} className="flex items-center gap-2 bg-slate-50/60 px-2 py-1.5 text-sm text-slate-600">
                      <span className="w-[122px] shrink-0 px-2 tabular-nums">{fmt12(r.time)}</span>
                      <span className="w-14 shrink-0" />
                      <span className="min-w-0 flex-1 truncate px-2 italic">{r.title}</span>
                      <span className="hidden w-40 truncate px-2 text-xs md:block">{r.owner}</span>
                      <button onClick={() => go(r.source!.kind === 'supplier' ? 'suppliers' : 'crew', r.source!.id)} className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-brand-600 hover:bg-brand-50">
                        <Link2 size={12} /> {r.source.kind === 'supplier' ? 'Supplier' : 'Crew'}
                      </button>
                    </div>
                  ) : (
                    <div key={r.id} id={`run-${r.id}`} className={`group flex flex-wrap items-center gap-x-2 px-2 py-1 md:flex-nowrap ${readOnly ? 'pointer-events-none' : ''}`}>
                      <input
                        type="time"
                        className="cell w-[122px] shrink-0 tabular-nums"
                        value={r.time}
                        onChange={(e) => edit(r.id, (s) => void (s.time = e.target.value), 'time')}
                      />
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
                      <div className="flex shrink-0 opacity-0 transition group-hover:opacity-100 max-md:opacity-100">
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
                  ),
                )}
                {!list.length && <p className="px-4 py-4 text-sm text-slate-400">Nothing yet.</p>}
              </div>
            </section>
          )
        })}
      </div>
      {rows.some((r, i) => i > 0 && !r.source && !rows[i - 1].source && r.phase === rows[i - 1].phase && toMinutes(rows[i - 1].time) + rows[i - 1].duration > toMinutes(r.time) + 1) && (
        <p className="mt-3 text-xs text-amber-700">Some items overlap — that's fine for things happening in parallel.</p>
      )}
    </div>
  )
}
