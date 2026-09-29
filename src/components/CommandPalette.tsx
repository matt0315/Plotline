import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Search, Plus, Download, Share2, Home as HomeIcon, Sparkles, Undo2, Redo2, User, Store as StoreIcon } from 'lucide-react'
import { useUI } from '../store/ui'
import { useEvent, update } from '../store/event'
import { canCreateEvent } from '../store/actions'
import { uid } from '../lib/id'
import { TABS } from './Shell'
import { newGuest } from '../modules/Guests/guestActions'
import { addFurniture } from '../modules/Layout/layoutActions'
import { newSupplier } from '../modules/Suppliers/supplierActions'
import { addMinutes } from '../lib/time'

interface Cmd {
  id: string
  label: string
  hint?: string
  icon: ReactNode
  run: () => void
}

export const CommandPalette = () => {
  const open = useUI((s) => s.palette)
  const set = useUI((s) => s.set)
  const go = useUI((s) => s.go)
  const doc = useEvent((s) => s.doc)
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Reset on close, so nothing typed straight after ⌘K gets wiped.
    if (!open) {
      setQ('')
      setIdx(0)
    }
  }, [open])

  const cmds = useMemo<Cmd[]>(() => {
    if (!doc) return []
    const close = () => set({ palette: false })
    const base: Cmd[] = [
      ...TABS.map((t) => ({ id: `go-${t.id}`, label: `Go to ${t.label}`, icon: t.icon, run: () => go(t.id) })),
      {
        id: 'add-guest',
        label: 'Add guest',
        icon: <Plus size={16} />,
        run: () => {
          update((d) => void d.guests.push(newGuest()))
          go('guests')
        },
      },
      { id: 'add-table', label: 'Add round table', icon: <Plus size={16} />, run: () => (go('layout'), addFurniture('round-66')) },
      { id: 'add-bar', label: 'Add bar', icon: <Plus size={16} />, run: () => (go('layout'), addFurniture('bar')) },
      {
        id: 'add-supplier',
        label: 'Add supplier',
        icon: <Plus size={16} />,
        run: () => {
          const s = newSupplier()
          update((d) => void d.suppliers.push(s))
          go('suppliers', s.id)
        },
      },
      {
        id: 'add-run',
        label: 'Add run sheet item',
        icon: <Plus size={16} />,
        run: () => {
          const last = doc.schedule[doc.schedule.length - 1]
          update((d) => void d.schedule.push({ id: uid('r'), time: last ? addMinutes(last.time, last.duration) : d.startTime, duration: 15, title: '', owner: '', location: '', notes: '', phase: 'event' }))
          go('run')
        },
      },
      { id: 'export', label: 'Export event pack (PDF)', icon: <Download size={16} />, run: () => set({ exportOpen: true, palette: false }) },
      { id: 'share', label: 'Share', icon: <Share2 size={16} />, run: () => set({ shareOpen: true, palette: false }) },
      { id: 'undo', label: 'Undo', hint: '⌘Z', icon: <Undo2 size={16} />, run: () => (useEvent.getState().undo(), close()) },
      { id: 'redo', label: 'Redo', hint: '⇧⌘Z', icon: <Redo2 size={16} />, run: () => (useEvent.getState().redo(), close()) },
      {
        id: 'new',
        label: 'New event',
        icon: <Sparkles size={16} />,
        run: async () => {
          close()
          if (await canCreateEvent()) useUI.getState().setScreen('onboarding')
        },
      },
      { id: 'home', label: 'All events', icon: <HomeIcon size={16} />, run: () => (close(), useUI.getState().setScreen('home')) },
    ]
    if (q.trim().length < 2) return base
    const needle = q.toLowerCase()
    const people: Cmd[] = doc.guests
      .filter((g) => g.name.toLowerCase().includes(needle))
      .slice(0, 6)
      .map((g) => ({ id: g.id, label: g.name, hint: g.group || 'Guest', icon: <User size={16} />, run: () => go('guests', g.id) }))
    const sups: Cmd[] = doc.suppliers
      .filter((s) => `${s.name} ${s.category}`.toLowerCase().includes(needle))
      .slice(0, 4)
      .map((s) => ({ id: s.id, label: s.name, hint: s.category, icon: <StoreIcon size={16} />, run: () => go('suppliers', s.id) }))
    return [...base.filter((c) => c.label.toLowerCase().includes(needle)), ...people, ...sups]
  }, [doc, q, go, set])

  if (!open) return null
  const run = (c?: Cmd) => c && c.run()

  return (
    <div className="fixed inset-0 z-[1500] flex items-start justify-center bg-slate-900/30 p-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && set({ palette: false })}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4">
          <Search size={18} className="text-slate-400" />
          <input
            ref={input}
            autoFocus
            className="h-12 flex-1 bg-transparent text-sm outline-none"
            placeholder="Jump to, add, or search guests and suppliers…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setIdx(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') (e.preventDefault(), setIdx((i) => Math.min(cmds.length - 1, i + 1)))
              else if (e.key === 'ArrowUp') (e.preventDefault(), setIdx((i) => Math.max(0, i - 1)))
              else if (e.key === 'Enter') run(cmds[idx])
              else if (e.key === 'Escape') set({ palette: false })
            }}
          />
        </div>
        <ul className="scroll-thin max-h-[50vh] overflow-y-auto py-1">
          {cmds.map((c, i) => (
            <li key={c.id}>
              <button onMouseEnter={() => setIdx(i)} onClick={() => run(c)} className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${i === idx ? 'bg-brand-50 text-brand-700' : ''}`}>
                <span className="text-slate-400">{c.icon}</span>
                <span className="flex-1 truncate">{c.label}</span>
                {c.hint && <span className="text-xs text-slate-400">{c.hint}</span>}
              </button>
            </li>
          ))}
          {!cmds.length && <li className="px-4 py-6 text-center text-sm text-slate-400">Nothing matches “{q}”</li>}
        </ul>
      </div>
    </div>
  )
}
