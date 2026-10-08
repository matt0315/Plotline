import { lazy, Suspense, useState } from 'react'
import { MousePointer2, Hand, Ruler, Magnet, ZoomIn, ZoomOut, Maximize2, Plus, Users, SlidersHorizontal, Upload, FileDown, X, AlertTriangle, Grid2x2Plus } from 'lucide-react'
import { useEvent } from '../../store/event'
import { clearanceIssues } from '../../lib/geometry'
import { seatingStats } from '../../lib/derived'
import { Canvas, fitView, zoomBy } from './Canvas'
import { Library } from './Library'
import { Inspector } from './Inspector'
import { GuestDock } from './GuestDock'
import { FillPanel } from './FillPanel'
import { useLayoutView, type Tool } from './viewStore'
import { IconButton, Button } from '../../components/ui'

const ImportDialog = lazy(() => import('../VenueImport/ImportDialog'))

const TOOLS: { id: Tool; icon: React.ReactNode; label: string }[] = [
  { id: 'select', icon: <MousePointer2 size={16} />, label: 'Select (V)' },
  { id: 'pan', icon: <Hand size={16} />, label: 'Pan (H or hold Space)' },
  { id: 'measure', icon: <Ruler size={16} />, label: 'Measure (M)' },
  { id: 'fill', icon: <Grid2x2Plus size={16} />, label: 'Fill an area with tables (F)' },
]

const HINTS: Partial<Record<Tool, string>> = {
  calibrate: 'Drag along a wall or dimension you know the real length of',
  moveplan: 'Drag to line the venue drawing up with your room',
  measure: 'Drag to measure · hold Shift to keep it straight',
  fill: 'Drag out an area, or click inside a marquee or room, to fill it',
}

export default function Layout() {
  const { tool, snap, view, panel, set, armed, fill } = useLayoutView()
  const d = useEvent((s) => s.doc)!
  const readOnly = useEvent((s) => s.readOnly)
  const [importing, setImporting] = useState(false)
  const [lib, setLib] = useState(() => window.innerWidth >= 1024)
  const issues = clearanceIssues(d.layout.items).length
  const st = seatingStats(d)
  const armedGuest = armed ? d.guests.find((g) => g.id === armed) : null

  const exportPdf = async () => {
    const { exportPack } = await import('../../lib/pdf')
    await exportPack(d, ['layout'])
  }

  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024

  return (
    <div className="absolute inset-0 flex">
      {/* Library */}
      {lib && !readOnly && (
        <aside className="absolute inset-x-0 bottom-0 z-30 h-[55%] rounded-t-2xl border-t border-slate-200 bg-white shadow-2xl lg:static lg:h-auto lg:w-56 lg:rounded-none lg:border-t-0 lg:border-r lg:shadow-none">
          <div className="flex items-center justify-between px-3 pt-2 lg:hidden">
            <span className="text-sm font-semibold">Add to plan</span>
            <IconButton onClick={() => setLib(false)}>
              <X size={16} />
            </IconButton>
          </div>
          <Library onAdded={() => !isDesktop && setLib(false)} />
        </aside>
      )}

      {/* Canvas */}
      <div className="relative min-w-0 flex-1">
        <Canvas />

        <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-sm backdrop-blur">
          {!readOnly && (
            <Button size="sm" variant={lib ? 'secondary' : 'primary'} onClick={() => setLib(!lib)}>
              <Plus size={14} /> Add
            </Button>
          )}
          <div className="mx-0.5 h-5 w-px bg-slate-200" />
          {TOOLS.map((t) => (
            <IconButton key={t.id} title={t.label} active={tool === t.id} onClick={() => set({ tool: t.id, measure: null, fill: null, fillPreview: [] })}>
              {t.icon}
            </IconButton>
          ))}
          <IconButton title="Snap to grid" active={snap} onClick={() => set({ snap: !snap })}>
            <Magnet size={16} />
          </IconButton>
          <div className="mx-0.5 hidden h-5 w-px bg-slate-200 sm:block" />
          <IconButton title="Zoom out" onClick={() => zoomBy(1 / 1.25)} className="max-sm:hidden">
            <ZoomOut size={16} />
          </IconButton>
          <span className="hidden w-12 text-center text-xs text-slate-500 tabular-nums sm:inline">{Math.round((view.s / 20) * 100)}%</span>
          <IconButton title="Zoom in" onClick={() => zoomBy(1.25)} className="max-sm:hidden">
            <ZoomIn size={16} />
          </IconButton>
          <IconButton title="Fit to screen (⌘0)" onClick={fitView}>
            <Maximize2 size={16} />
          </IconButton>
        </div>

        <div className="absolute right-3 bottom-3 flex items-center gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-sm backdrop-blur sm:top-3 sm:bottom-auto">
          {issues > 0 && (
            <button onClick={() => set({ panel: 'inspector', selected: [] })} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">
              <AlertTriangle size={14} /> {issues}
            </button>
          )}
          {!readOnly && (
            <IconButton title="Import venue drawing" onClick={() => setImporting(true)}>
              <Upload size={16} />
            </IconButton>
          )}
          <IconButton title="Floor plan PDF" onClick={exportPdf}>
            <FileDown size={16} />
          </IconButton>
          <IconButton title="Guests & seating" active={panel === 'guests'} onClick={() => set({ panel: panel === 'guests' ? null : 'guests' })}>
            <Users size={16} />
            {st.unseated > 0 && <span className="ml-0.5 text-[10px] font-semibold text-brand-600 tabular-nums">{st.unseated}</span>}
          </IconButton>
          <IconButton title="Properties" active={panel === 'inspector'} onClick={() => set({ panel: panel === 'inspector' ? null : 'inspector' })}>
            <SlidersHorizontal size={16} />
          </IconButton>
        </div>

        <FillPanel />

        {((HINTS[tool] && !(tool === 'fill' && fill)) || armedGuest) && (
          <div className="absolute bottom-16 left-1/2 flex max-w-[92%] -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900 py-1.5 pr-1.5 pl-4 text-xs text-white shadow-lg sm:bottom-4">
            {armedGuest ? `Tap a table to seat ${armedGuest.name}` : HINTS[tool]}
            <button onClick={() => set({ tool: 'select', measure: null, armed: null, fill: null, fillPreview: [] })} className="rounded-full bg-white/15 px-2.5 py-1 hover:bg-white/25">
              {tool === 'measure' ? 'Done' : 'Cancel'}
            </button>
          </div>
        )}

        {!d.layout.items.length && !d.layout.basePlan && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="pointer-events-auto max-w-sm rounded-2xl bg-white p-6 text-center shadow-lg">
              <h3 className="font-semibold">Start your floor plan</h3>
              <p className="mt-1 text-sm text-slate-500">Import the venue's drawing, or drag tables in from the left.</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button onClick={() => setImporting(true)}>
                  <Upload size={16} /> Import drawing
                </Button>
                <Button variant="primary" onClick={() => setLib(true)}>
                  <Plus size={16} /> Add furniture
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right panel */}
      {panel && (
        <aside className="absolute inset-x-0 bottom-0 z-30 h-[60%] rounded-t-2xl border-t border-slate-200 bg-white shadow-2xl lg:static lg:h-auto lg:w-72 lg:rounded-none lg:border-t-0 lg:border-l lg:shadow-none">
          <div className="flex items-center border-b border-slate-100 px-2">
            {(['inspector', 'guests'] as const).map((p) => (
              <button key={p} onClick={() => set({ panel: p })} className={`border-b-2 px-3 py-2.5 text-sm font-medium ${panel === p ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500'}`}>
                {p === 'inspector' ? 'Properties' : `Seating${st.unseated ? ` · ${st.unseated}` : ''}`}
              </button>
            ))}
            <div className="flex-1" />
            <IconButton onClick={() => set({ panel: null })} className="lg:hidden">
              <X size={16} />
            </IconButton>
          </div>
          <div className="h-[calc(100%-45px)]">{panel === 'inspector' ? <Inspector onImport={() => setImporting(true)} /> : <GuestDock />}</div>
        </aside>
      )}

      <Suspense>{importing && <ImportDialog onClose={() => setImporting(false)} />}</Suspense>
    </div>
  )
}
