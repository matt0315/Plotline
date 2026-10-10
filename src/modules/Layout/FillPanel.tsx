import { useEffect, useMemo } from 'react'
import { LayoutGrid, X } from 'lucide-react'
import { useEvent, update } from '../../store/event'
import { FILL_STYLES, MIN_GAP, PATTERNS, SPACINGS, fillArea, type FillStyle } from '../../lib/fill'
import { DENSITY } from '../../lib/capacity'
import { fmtArea } from '../../lib/geometry'
import { Button, Select, toast } from '../../components/ui'
import { useLayoutView } from './viewStore'

/** Choose how to fill the picked area, see the ghost layout live, then place it. */
export const FillPanel = () => {
  const { fill, fillOpts: o, set } = useLayoutView()
  const items = useEvent((s) => s.doc!.layout.items)
  const nextTable = items.filter((i) => i.kind === 'round-table' || (i.kind === 'banquet-table' && !i.joinable)).length + 1
  const preview = useMemo(() => (fill ? fillArea(fill, o, items, nextTable) : []), [fill, o, items, nextTable])
  useEffect(() => set({ fillPreview: preview }), [preview, set])

  if (!fill) return null
  const seats = preview.reduce((n, i) => n + (i.seats || 0), 0)
  const area = fill.poly ? null : fill.w * fill.h
  const cancel = () => set({ fill: null, fillPreview: [] })
  const apply = () => {
    if (!preview.length) return
    update((d) => void d.layout.items.push(...preview))
    useLayoutView.getState().select(preview.map((i) => i.id))
    toast(`Placed ${preview.length} ${o.style === 'theatre' ? 'blocks' : 'tables'}${seats ? ` · ${seats} seats` : ''}`)
    set({ fill: null, fillPreview: [], tool: 'select' })
  }
  const setO = (p: Partial<typeof o>) => set({ fillOpts: { ...o, ...p } })

  return (
    <div className="absolute inset-x-3 bottom-16 z-20 mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-3 shadow-xl sm:bottom-4">
      <div className="mb-2 flex items-center gap-2 text-sm">
        <LayoutGrid size={16} className="text-brand-600" />
        <span className="flex-1 font-semibold">
          {preview.length ? `${preview.length} ${o.style === 'theatre' ? 'blocks' : o.style === 'trestle' ? 'trestles' : 'tables'}${seats ? ` · ${seats} seats` : ''}` : 'Nothing fits — try tighter spacing or a smaller table'}
        </span>
        {area != null && <span className="text-xs text-slate-500">{fmtArea(area)}</span>}
        <button onClick={cancel} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Cancel fill">
          <X size={16} />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Select<FillStyle> value={o.style} options={FILL_STYLES.map((s) => ({ value: s.id, label: s.label }))} onChange={(style) => setO({ style })} />
        <div className="inline-flex items-center rounded-lg border border-slate-200 p-0.5">
          {SPACINGS.map((s) => (
            <button key={s.id} onClick={() => setO({ gap: s.aisle })} className={`rounded-md px-2 py-1 ${Math.abs(o.gap - s.aisle) < 0.001 ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-600'}`} title={`${s.aisle} m between tables`}>
              {s.label}
            </button>
          ))}
          <label className="ml-1 flex items-center gap-1 pr-1 text-slate-500" title="Clear gap between neighbouring tables' chairs">
            Gap
            <input
              type="number"
              min={MIN_GAP}
              max={5}
              step={0.05}
              className="w-16 rounded border border-slate-200 px-1.5 py-0.5 text-right text-slate-800 tabular-nums"
              value={o.gap}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                if (Number.isFinite(v)) setO({ gap: Math.max(MIN_GAP, Math.min(5, v)) })
              }}
            />
            m
          </label>
        </div>
        {(o.style.startsWith('round') || o.style === 'cocktail') && (
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
            {PATTERNS.map((pt) => (
              <button key={pt.id} onClick={() => setO({ pattern: pt.id })} title={pt.title} className={`rounded-md px-2 py-1 ${o.pattern === pt.id ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-600'}`}>
                {pt.label}
              </button>
            ))}
          </div>
        )}
        <label className="flex items-center gap-1 text-slate-600">
          <input type="checkbox" className="accent-brand-600" checked={o.keepExits} onChange={(e) => setO({ keepExits: e.target.checked })} />
          Keep exits clear
        </label>
        <label className="flex items-center gap-1 text-slate-600">
          Stage gap
          <Select value={String(o.stageGap)} options={['0', '1', '2', '3', '4'].map((v) => ({ value: v, label: `${v} m` }))} onChange={(v) => setO({ stageGap: +v })} />
        </label>
        <div className="flex-1" />
        <Button size="sm" variant="primary" onClick={apply} disabled={!preview.length}>
          Place them
        </Button>
      </div>
      {o.gap < 0.915 && <p className="mt-2 text-[11px] text-amber-700">Under 0.915 m isn’t an accessible walkway — these gaps will show as spacing warnings.</p>}
      {area != null && (
        <p className="mt-2 text-[11px] text-slate-500">
          Rough capacity: {DENSITY.map((k) => `${k.label.toLowerCase()} ${Math.floor(area / k.m2)}`).join(' · ')} — a guide only; check your venue’s licence and local code.
        </p>
      )}
    </div>
  )
}
