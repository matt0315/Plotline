import { useState } from 'react'
import { Wand2, Search, Users, FileDown } from 'lucide-react'
import { useEvent } from '../../store/event'
import { useUI } from '../../store/ui'
import { seatingStats } from '../../lib/derived'
import { autoSeat, seatGuest } from '../Guests/guestActions'
import { useLayoutView } from './viewStore'
import { Button, toast } from '../../components/ui'

export const GuestDock = () => {
  const d = useEvent((s) => s.doc)!
  const readOnly = useEvent((s) => s.readOnly)
  const armed = useLayoutView((s) => s.armed)
  const [q, setQ] = useState('')
  const [all, setAll] = useState(false)
  const st = seatingStats(d)
  const tableName = (id: string) => d.layout.items.find((i) => i.id === id)?.label || 'Table'

  const list = d.guests
    .filter((g) => g.rsvp !== 'no' && (all || !g.seat) && (!q || g.name.toLowerCase().includes(q.toLowerCase()) || g.group.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name))

  if (!d.guests.length)
    return (
      <div className="p-5 text-center text-sm text-slate-500">
        <Users className="mx-auto mb-2 text-slate-300" />
        No guests yet.
        <Button size="sm" className="mt-3" onClick={() => useUI.getState().go('guests')}>
          Add guests
        </Button>
      </div>
    )

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-slate-100 p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold">
            {st.seated} / {st.attending} seated
          </span>
          <div className="flex items-center gap-3">
            {st.seated > 0 && (
              <button onClick={() => useUI.getState().set({ tablePlanOpen: true })} className="flex items-center gap-1 text-xs text-brand-600" title="Design and download a table plan">
                <FileDown size={13} /> Table plan
              </button>
            )}
            <button onClick={() => setAll(!all)} className="text-xs text-brand-600">
              {all ? 'Show unseated' : 'Show all'}
            </button>
          </div>
        </div>
        {!readOnly && st.unseated > 0 && (
          <Button
            size="sm"
            variant="primary"
            className="w-full"
            onClick={() => {
              const r = autoSeat()
              toast(r.left ? `Seated ${r.seated}. ${r.left} need more seats.` : `Seated ${r.seated} — groups kept together`)
            }}
          >
            <Wand2 size={14} /> Auto-seat {st.unseated} by group
          </Button>
        )}
        <div className="relative">
          <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
          <input className="input py-1.5 pl-8 text-xs" placeholder="Find guest or group" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <p className="text-[11px] text-slate-500">Drag a guest onto a chair. On a phone, tap a guest, then tap a table.</p>
      </div>
      <ul className="scroll-thin flex-1 overflow-y-auto p-1.5">
        {list.map((g, i) => {
          const header = i === 0 || list[i - 1].group !== g.group
          return (
            <li key={g.id}>
              {header && <div className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">{g.group || 'No group'}</div>}
              <div
                draggable={!readOnly}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/guest', g.id)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onClick={() => {
                  if (readOnly) return
                  if (g.seat) useLayoutView.getState().select([g.seat.itemId])
                  useLayoutView.getState().set({ armed: armed === g.id ? null : g.id })
                }}
                className={`flex cursor-grab items-center gap-2 rounded-lg px-2 py-1.5 text-sm active:cursor-grabbing ${armed === g.id ? 'bg-brand-600 text-white' : 'hover:bg-slate-50'}`}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${g.rsvp === 'yes' ? 'bg-emerald-500' : g.rsvp === 'maybe' ? 'bg-amber-400' : 'bg-slate-300'}`} title={g.rsvp} />
                <span className="min-w-0 flex-1 truncate">{g.name}</span>
                {g.seat ? (
                  <span className={`truncate text-[11px] ${armed === g.id ? 'text-brand-100' : 'text-slate-400'}`}>
                    {tableName(g.seat.itemId)}
                    <button
                      className="ml-1 hover:text-red-500"
                      onClick={(e) => {
                        e.stopPropagation()
                        seatGuest(g.id, undefined)
                      }}
                    >
                      ×
                    </button>
                  </span>
                ) : (
                  g.dietary && <span className="truncate text-[10px] text-amber-700">{g.dietary}</span>
                )}
              </div>
            </li>
          )
        })}
        {!list.length && <li className="p-4 text-center text-xs text-slate-500">{st.unseated ? 'No matches' : 'Everyone attending has a seat 🎉'}</li>}
      </ul>
    </div>
  )
}
