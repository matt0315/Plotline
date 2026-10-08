import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, MessageSquarePlus, Package, Search } from 'lucide-react'
import type { LayoutItem } from '../../types/event'
import { KIT_GROUP, LIBRARY_GROUPS, libraryWith, type LibEntry } from '../../data/library'
import { useKit } from '../../store/kit'
import { addFurniture, makeItem } from './layoutActions'
import { StaticPlan } from './render'
import { KitDialog } from './KitDialog'
import { RequestItemDialog } from './RequestItem'

const RECENT_KEY = 'plotline:recent-items'
const readRecent = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
  } catch {
    return []
  }
}
const pushRecent = (key: string) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([key, ...readRecent().filter((k) => k !== key)].slice(0, 8)))
  } catch {
    /* storage blocked */
  }
}

const Thumb = ({ item }: { item: LayoutItem }) => <StaticPlan items={[{ ...item, label: item.kind === 'label' ? 'Aa' : '' }]} spaces={[]} guests={[]} pad={0.25} className="h-10 w-10" />

const Tile = ({ e, item, onAdd }: { e: LibEntry; item: LayoutItem; onAdd: (key: string) => void }) => (
  <button
    draggable
    onDragStart={(ev) => {
      ev.dataTransfer.setData('text/furniture', e.key)
      ev.dataTransfer.effectAllowed = 'copy'
    }}
    onClick={() => onAdd(e.key)}
    className="flex cursor-grab flex-col items-center gap-1 rounded-lg border border-transparent p-1.5 text-center hover:border-slate-200 hover:bg-slate-50 active:cursor-grabbing"
    title={`${e.name} — ${e.w}×${e.h} m${e.z ? ` · ${e.z < 1 ? `${Math.round(e.z * 1000)} mm` : `${e.z} m`} high` : ''}`}
  >
    <Thumb item={item} />
    <span className="text-[11px] leading-tight text-slate-600">{e.name}</span>
  </button>
)

export const Library = ({ onAdded }: { onAdded?: () => void }) => {
  const kit = useKit((s) => s.entries)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Set<string>>(() => new Set([KIT_GROUP, 'Tables']))
  const [kitOpen, setKitOpen] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [recent, setRecent] = useState(readRecent)

  const all = useMemo(() => libraryWith(kit), [kit])
  // Preview items for thumbnails, built once per library change.
  const previews = useMemo(() => {
    const m = new Map<string, LayoutItem>()
    for (const e of all)
      try {
        m.set(e.key, makeItem(e.key, 0, 0))
      } catch {
        /* a kit item mid-delete */
      }
    return m
  }, [all])

  const needle = q.trim().toLowerCase()
  const list = needle ? all.filter((e) => `${e.name} ${e.tags} ${e.group}`.toLowerCase().includes(needle)) : all
  const add = (key: string) => {
    addFurniture(key)
    pushRecent(key)
    setRecent(readRecent())
    onAdded?.()
  }
  const toggle = (g: string) =>
    setOpen((s) => {
      const n = new Set(s)
      if (n.has(g)) n.delete(g)
      else n.add(g)
      return n
    })
  const recentEntries = needle ? [] : recent.map((k) => all.find((e) => e.key === k)).filter((e): e is LibEntry => !!e && previews.has(e.key))

  const grid = (entries: LibEntry[]) => (
    <div className="grid grid-cols-2 gap-1">
      {entries.map((e) => (
        <Tile key={e.key} e={e} item={previews.get(e.key)!} onAdd={add} />
      ))}
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-slate-100 p-3">
        <div className="relative">
          <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
          <input className="input py-1.5 pl-8 text-xs" placeholder={`Search ${all.length} items`} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex items-center gap-3 text-[11px] whitespace-nowrap">
          <button onClick={() => setKitOpen(true)} className="flex items-center gap-1 font-medium text-brand-600">
            <Package size={12} /> Your kit
          </button>
          <button onClick={() => setRequesting(true)} className="flex items-center gap-1 font-medium text-slate-500 hover:text-brand-600">
            <MessageSquarePlus size={12} /> Request item
          </button>
        </div>
      </div>
      <div className="scroll-thin flex-1 overflow-y-auto p-2">
        {recentEntries.length > 0 && (
          <div className="mb-3">
            <div className="px-1 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">Recently used</div>
            {grid(recentEntries.slice(0, 4))}
          </div>
        )}
        {LIBRARY_GROUPS.map((g) => {
          const items = list.filter((e) => e.group === g && previews.has(e.key))
          if (!items.length) return null
          const isOpen = !!needle || open.has(g)
          return (
            <div key={g} className="mb-1">
              <button onClick={() => toggle(g)} className="flex w-full items-center gap-1 rounded px-1 py-1.5 text-left text-[11px] font-semibold tracking-wide text-slate-500 uppercase hover:bg-slate-50">
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span className="flex-1">{g}</span>
                <span className="font-normal text-slate-400 tabular-nums">{items.length}</span>
              </button>
              {isOpen && <div className="pt-1 pb-2">{grid(items)}</div>}
            </div>
          )
        })}
        {needle && !list.length && (
          <div className="px-2 py-6 text-center text-xs text-slate-500">
            Can’t find “{q.trim()}”?
            <button onClick={() => setRequesting(true)} className="mt-2 block w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 font-medium text-brand-600 hover:bg-brand-50">
              Request it — send a photo and size
            </button>
          </div>
        )}
        {!needle && (
          <button onClick={() => setRequesting(true)} className="mt-2 w-full rounded-lg border border-dashed border-slate-200 px-3 py-2 text-[11px] text-slate-500 hover:border-brand-300 hover:text-brand-600">
            Missing something? Request an item
          </button>
        )}
      </div>
      {kitOpen && <KitDialog onClose={() => setKitOpen(false)} />}
      {requesting && <RequestItemDialog initialName={needle && !list.length ? q.trim() : ''} onClose={() => setRequesting(false)} />}
    </div>
  )
}
