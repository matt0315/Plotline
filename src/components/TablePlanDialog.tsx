import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowDownAZ, ChevronLeft, ChevronRight, Crown, Download, LayoutGrid, Loader2, Tent, UtensilsCrossed, Wand2 } from 'lucide-react'
import type { jsPDF } from 'jspdf'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { PaperSize, TablePlanLayout, TablePlanStyle } from '../types/event'
import { useEvent, update } from '../store/event'
import { useUI } from '../store/ui'
import { useAccount } from '../store/account'
import { cssFamily, FONT_KEYS, FONTS, loadCssFonts, STYLES, type FontKey } from '../lib/fonts'
import { LAYOUTS, PAPERS, renderTablePlan, resolveTablePlan, seatingData, tablePlanFilename } from '../lib/tablePlan'
import { autoSeat } from '../modules/Guests/guestActions'
import { Button, Modal, Select, toast } from './ui'
import { startCheckout } from './Account'

const LAYOUT_ICONS: Record<TablePlanLayout, ReactNode> = {
  alpha: <ArrowDownAZ size={18} />,
  tables: <LayoutGrid size={18} />,
  cards: <Tent size={18} />,
  caterer: <UtensilsCrossed size={18} />,
}

const Label = ({ children }: { children: ReactNode }) => <div className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">{children}</div>

const Segmented = <T extends string | number>({ value, options, onChange, disabled }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean }) => (
  <div className={`inline-flex rounded-lg border border-slate-200 bg-white p-0.5 ${disabled ? 'opacity-50' : ''}`}>
    {options.map((o) => (
      <button
        key={String(o.value)}
        disabled={disabled}
        onClick={() => onChange(o.value)}
        className={`rounded-md px-2.5 py-1 text-xs font-medium ${value === o.value ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'}`}
      >
        {o.label}
      </button>
    ))}
  </div>
)

export default function TablePlanDialog() {
  const d = useEvent((s) => s.doc)!
  const readOnly = useEvent((s) => s.readOnly)
  const isPro = useAccount((s) => s.isPro)
  const close = () => useUI.getState().set({ tablePlanOpen: false })
  const [s, setS] = useState<TablePlanStyle>(() => resolveTablePlan(d))
  const [busy, setBusy] = useState(true)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const pageRef = useRef(1)
  pageRef.current = page
  const canvas = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const built = useRef<{ key: string; pdf: jsPDF } | null>(null)
  const viewer = useRef<PDFDocumentProxy | null>(null)
  const data = useMemo(() => seatingData(d), [d])

  const set = (patch: Partial<TablePlanStyle>) => {
    const next = { ...s, ...patch }
    setS(next)
    if (!readOnly) update((x) => void (x.tablePlan = next), 'tablePlan')
  }

  useEffect(() => {
    void loadCssFonts([...new Set(STYLES.map((x) => x.heading))])
  }, [])

  const draw = async (pdf: PDFDocumentProxy, n: number) => {
    const c = canvas.current
    const b = box.current
    if (!c || !b) return
    const pg = await pdf.getPage(Math.min(n, pdf.numPages))
    const base = pg.getViewport({ scale: 1 })
    const fit = Math.min((b.clientWidth - 24) / base.width, (b.clientHeight - 24) / base.height)
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    const vp = pg.getViewport({ scale: fit * dpr })
    c.width = Math.round(vp.width)
    c.height = Math.round(vp.height)
    c.style.width = `${Math.round(vp.width / dpr)}px`
    c.style.height = `${Math.round(vp.height / dpr)}px`
    await pg.render({ canvasContext: c.getContext('2d')!, viewport: vp, canvas: c }).promise
  }

  // Rebuild the real PDF shortly after each change, so the preview is exactly what downloads.
  const gen = useRef(0)
  useEffect(() => {
    const my = ++gen.current
    setBusy(true)
    const t = setTimeout(async () => {
      try {
        const pdf = await renderTablePlan(d, s, !isPro)
        if (my !== gen.current) return
        built.current = { key: JSON.stringify([s, isPro]), pdf }
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
        const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf.output('arraybuffer')) }).promise
        if (my !== gen.current) return void doc.destroy()
        void viewer.current?.destroy()
        viewer.current = doc
        setPages(doc.numPages)
        const n = Math.min(page, doc.numPages)
        setPage(n)
        await draw(doc, n)
      } catch (e) {
        // A newer preview (or closing the dialog) cancels this one — not an error.
        if (my !== gen.current || (e as Error)?.name === 'RenderingCancelledException') return
        console.error(e)
        toast('Preview failed — try another font')
      } finally {
        if (my === gen.current) setBusy(false)
      }
    }, 280)
    return () => clearTimeout(t)
    // Page changes redraw separately; d changes when guests or tables move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, isPro, d.guests, d.layout.items])

  useEffect(
    () => () => {
      gen.current++
      void viewer.current?.destroy()
    },
    [],
  )

  // Redraw at the new size when the preview box changes (window resize, rotating a phone).
  useEffect(() => {
    const b = box.current
    if (!b) return
    let t: ReturnType<typeof setTimeout> | undefined
    const ro = new ResizeObserver(() => {
      clearTimeout(t)
      t = setTimeout(() => viewer.current && draw(viewer.current, pageRef.current).catch(() => {}), 150)
    })
    ro.observe(b)
    return () => (ro.disconnect(), clearTimeout(t))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const turn = (n: number) => {
    setPage(n)
    if (viewer.current) draw(viewer.current, n).catch(() => {})
  }

  const download = async () => {
    try {
      const hit = built.current?.key === JSON.stringify([s, isPro]) ? built.current.pdf : await renderTablePlan(d, s, !isPro)
      hit.save(tablePlanFilename(d, s))
    } catch (e) {
      console.error(e)
      toast('Export failed')
    }
  }

  const fontOptions = FONT_KEYS.map((k) => ({ value: k, label: `${FONTS[k].label}${FONTS[k].kind === 'script' ? ' (script)' : ''}` }))
  const guestFacing = s.layout !== 'caterer'

  return (
    <Modal
      open
      onClose={close}
      title="Table plan"
      width="max-w-5xl"
      footer={
        <>
          {!isPro && (
            <button onClick={startCheckout} className="mr-auto flex items-center gap-1.5 text-xs text-brand-700">
              <Crown size={14} /> <span className="max-sm:hidden">Free exports carry a small watermark. </span>Upgrade to remove it
            </button>
          )}
          <Button variant="primary" onClick={download} disabled={!data.seated.length}>
            <Download size={16} /> Download PDF
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          {data.unseated > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <span className="flex-1">
                {data.unseated} attending guest{data.unseated === 1 ? " isn't" : "s aren't"} seated, so they won't appear.
              </span>
              {!readOnly && (
                <Button
                  size="sm"
                  onClick={() => {
                    const r = autoSeat()
                    toast(r.left ? `Seated ${r.seated}. ${r.left} need more seats.` : `Seated ${r.seated}`)
                  }}
                >
                  <Wand2 size={14} /> Auto-seat
                </Button>
              )}
            </div>
          )}

          <div>
            <Label>Layout</Label>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(LAYOUTS) as TablePlanLayout[]).map((k) => (
                <button
                  key={k}
                  onClick={() => set({ layout: k })}
                  className={`rounded-lg border px-2.5 py-2 text-left ${s.layout === k ? 'border-brand-300 bg-brand-50 ring-1 ring-brand-200' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  <div className={`flex items-center gap-1.5 text-sm font-medium ${s.layout === k ? 'text-brand-700' : ''}`}>
                    {LAYOUT_ICONS[k]} {LAYOUTS[k].label}
                  </div>
                  <div className="mt-0.5 text-[11px] leading-tight text-slate-500">{LAYOUTS[k].blurb}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Style</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {STYLES.map((st) => (
                <button
                  key={st.id}
                  onClick={() => set({ style: st.id, headingFont: st.heading, bodyFont: st.body, accent: st.accent })}
                  className={`flex h-16 flex-col items-center justify-center rounded-lg border px-1 ${s.style === st.id ? 'border-brand-300 bg-brand-50 ring-1 ring-brand-200' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  <span className="truncate leading-none" style={{ fontFamily: cssFamily(st.heading), color: st.accent, fontSize: 20 * FONTS[st.heading].scale }}>
                    {st.label}
                  </span>
                  <span className="mt-1 text-[10px] text-slate-500">{FONTS[st.body].label}</span>
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
              <label className="text-xs text-slate-500">
                Heading
                <Select<FontKey> className="mt-0.5 w-full" value={s.headingFont as FontKey} options={fontOptions} onChange={(v) => set({ headingFont: v })} />
              </label>
              <label className="text-xs text-slate-500">
                Names
                <Select<FontKey> className="mt-0.5 w-full" value={s.bodyFont as FontKey} options={fontOptions} onChange={(v) => set({ bodyFont: v })} />
              </label>
              <label className="text-xs text-slate-500" title="Accent colour">
                Colour
                <input type="color" className="mt-0.5 block h-8 w-10 cursor-pointer rounded border border-slate-200 bg-white p-0.5" value={s.accent} onChange={(e) => set({ accent: e.target.value })} />
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Wording</Label>
            <input className="input" placeholder="Title" value={s.title} onChange={(e) => set({ title: e.target.value })} />
            <input className="input" placeholder="Subtitle, e.g. the date" value={s.subtitle} onChange={(e) => set({ subtitle: e.target.value })} />
            {guestFacing && s.layout !== 'cards' && <input className="input" placeholder="Note, e.g. Please find your seat" value={s.note} onChange={(e) => set({ note: e.target.value })} />}
          </div>

          <div className="space-y-2.5">
            <Label>Paper</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Select<PaperSize> value={s.paper} options={(Object.keys(PAPERS) as PaperSize[]).map((k) => ({ value: k, label: PAPERS[k].label }))} onChange={(v) => set({ paper: v })} />
              <Segmented
                value={guestFacing ? s.orientation : 'portrait'}
                disabled={!guestFacing}
                options={[
                  { value: 'portrait', label: 'Portrait' },
                  { value: 'landscape', label: 'Landscape' },
                ]}
                onChange={(v) => set({ orientation: v })}
              />
            </div>
            {s.layout === 'alpha' && (
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-slate-600">Sort by</span>
                <Segmented
                  value={s.sortBy}
                  options={[
                    { value: 'last', label: 'Surname' },
                    { value: 'first', label: 'First name' },
                  ]}
                  onChange={(v) => set({ sortBy: v })}
                />
              </div>
            )}
            {s.layout === 'cards' && (
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-slate-600">Cards per page</span>
                <Segmented
                  value={s.cardsPerPage}
                  options={[
                    { value: 1, label: 'One' },
                    { value: 2, label: 'Two' },
                  ]}
                  onChange={(v) => set({ cardsPerPage: v })}
                />
              </div>
            )}
            {guestFacing && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" className="accent-brand-600" checked={s.dietary} onChange={(e) => set({ dietary: e.target.checked })} />
                Show dietary notes
              </label>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col lg:sticky lg:top-0 lg:self-start">
          <div ref={box} className="relative flex h-[55vh] items-center justify-center overflow-hidden rounded-xl bg-slate-100 lg:h-[64vh]">
            <canvas ref={canvas} className={`max-h-full max-w-full bg-white object-contain shadow-md transition-opacity ${busy ? 'opacity-60' : ''}`} />
            {busy && <Loader2 size={22} className="absolute animate-spin text-slate-400" />}
            {!data.seated.length && !busy && (
              <div className="absolute inset-x-0 bottom-3 text-center text-xs text-slate-500">
                Seat guests on the{' '}
                <button className="text-brand-600 underline" onClick={() => (close(), useUI.getState().go('layout'))}>
                  floor plan
                </button>{' '}
                to fill this in.
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-500">
            <button disabled={page <= 1} onClick={() => turn(page - 1)} className="rounded p-1 hover:bg-slate-100 disabled:opacity-30" aria-label="Previous page">
              <ChevronLeft size={16} />
            </button>
            <span className="tabular-nums">
              Page {page} of {pages} · {PAPERS[s.paper].label}
            </span>
            <button disabled={page >= pages} onClick={() => turn(page + 1)} className="rounded p-1 hover:bg-slate-100 disabled:opacity-30" aria-label="Next page">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
