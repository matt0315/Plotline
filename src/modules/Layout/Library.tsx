import { useState } from 'react'
import { Search } from 'lucide-react'
import { FURNITURE, FURNITURE_GROUPS, type FurnitureDef } from '../../data/furniture'
import { addFurniture } from './layoutActions'
import { StaticPlan } from './render'

const Thumb = ({ f }: { f: FurnitureDef }) => (
  <StaticPlan
    items={[{ id: f.key, kind: f.kind, x: 0, y: 0, w: f.w, h: f.h, rotation: 0, label: f.kind === 'label' ? 'Aa' : '', seats: f.seats, rows: f.rows, cols: f.cols, color: f.color, layer: f.layer }]}
    spaces={[]}
    guests={[]}
    pad={0.25}
    className="h-10 w-10"
  />
)

export const Library = ({ onAdded }: { onAdded?: () => void }) => {
  const [q, setQ] = useState('')
  const list = FURNITURE.filter((f) => !q || f.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-100 p-3">
        <div className="relative">
          <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
          <input className="input py-1.5 pl-8 text-xs" placeholder="Find furniture" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Drag onto the plan, or tap to add in view.</p>
      </div>
      <div className="scroll-thin flex-1 overflow-y-auto p-2">
        {FURNITURE_GROUPS.map((g) => {
          const items = list.filter((f) => f.group === g)
          if (!items.length) return null
          return (
            <div key={g} className="mb-3">
              <div className="px-1 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">{g}</div>
              <div className="grid grid-cols-2 gap-1">
                {items.map((f) => (
                  <button
                    key={f.key}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/furniture', f.key)
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    onClick={() => {
                      addFurniture(f.key)
                      onAdded?.()
                    }}
                    className="flex cursor-grab flex-col items-center gap-1 rounded-lg border border-transparent p-1.5 text-center hover:border-slate-200 hover:bg-slate-50 active:cursor-grabbing"
                    title={`${f.name} — ${f.w}×${f.h} m`}
                  >
                    <Thumb f={f} />
                    <span className="text-[11px] leading-tight text-slate-600">{f.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
