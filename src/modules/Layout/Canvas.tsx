import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { LayoutItem } from '../../types/event'
import { useEvent, update, doc as getDoc } from '../../store/event'
import { usePlan, savePlan, usePlans } from '../../store/plans'
import { snapToRun } from '../../lib/runs'
import { TENT_TYPES } from '../../data/tents'
import { regionFor, regionPoly } from '../../lib/fill'
import { clearanceIssues, footprint, hitTest, isRound, pointInPoly, rotate, snap as snapTo, toLocal, toWorld, fmtM, fmtFt, type Pt } from '../../lib/geometry'
import { seatMap } from '../../lib/derived'
import { FURNITURE_BY_KEY } from '../../data/furniture'
import { BasePlanImage, Defs, ItemShape, SpaceOutline, drawOrder, planBounds } from './render'
import { SNAP, useLayoutView, type View } from './viewStore'
import { decksForSize, stageSize } from '../../lib/staging'
import { addFurniture, copyItems, deleteItems, duplicateItems, nudge, pasteItems, rotateBy } from './layoutActions'
import { nearestFreeSeat, seatGuest } from '../Guests/guestActions'
import { toast } from '../../components/ui'

type Drag =
  | { mode: 'move'; start: Pt; orig: Map<string, Pt>; anchor: string; key: string; moved: boolean }
  | { mode: 'rotate'; id: string; key: string; start: number }
  | { mode: 'resize'; id: string; key: string; orig: LayoutItem; sx: number; sy: number }
  | { mode: 'pan'; startClient: Pt; origView: View }
  | { mode: 'marquee'; start: Pt; now: Pt; additive: boolean }
  | { mode: 'fillrect'; start: Pt; now: Pt }
  | { mode: 'measure'; start: Pt }
  | { mode: 'moveplan'; start: Pt; orig: Pt; key: string }
  | { mode: 'pinch'; startDist: number; startMid: Pt; origView: View }

const MIN_S = 2
const MAX_S = 400
const NO_RESIZE = new Set(['chair', 'chair-block', 'cocktail-table'])

export const fitView = () => {
  const d = getDoc()
  const { size, set } = useLayoutView.getState()
  const bp = d.layout.basePlan
  const plan = bp ? usePlans.getState().cache[bp.planId] : undefined
  const b = planBounds(d.layout.items, d.layout.spaces, plan && bp ? { plan, placement: bp } : undefined)
  const pad = 32
  const top = 56 // clear the floating toolbar
  const availW = size.w - pad * 2
  const availH = size.h - pad - top - (size.w < 640 ? 40 : 0)
  const s = Math.min(MAX_S, Math.max(MIN_S, Math.min(availW / Math.max(b.w, 1), availH / Math.max(b.h, 1))))
  set({ view: { s, x: b.minX - (pad + (availW - b.w * s) / 2) / s, y: b.minY - (top + (availH - b.h * s) / 2) / s } })
}

export const zoomBy = (factor: number, around?: Pt) => {
  const { view, size, set } = useLayoutView.getState()
  const s = Math.min(MAX_S, Math.max(MIN_S, view.s * factor))
  const cx = around?.x ?? size.w / 2
  const cy = around?.y ?? size.h / 2
  const wx = view.x + cx / view.s
  const wy = view.y + cy / view.s
  set({ view: { s, x: wx - cx / s, y: wy - cy / s } })
}

/** Parse "12", "12m", "40ft", "40'" into metres. */
const parseLength = (s: string): number | null => {
  const m = /^\s*([\d.]+)\s*(m|meters?|metres?|ft|feet|foot|'|in|″|")?\s*$/i.exec(s)
  if (!m) return null
  const v = parseFloat(m[1])
  const u = (m[2] ?? 'm').toLowerCase()
  if (u === 'ft' || u === 'feet' || u === 'foot' || u === "'") return v * 0.3048
  if (u === 'in' || u === '″' || u === '"') return v * 0.0254
  return v
}

export const Canvas = () => {
  const d = useEvent((s) => s.doc)!
  const readOnly = useEvent((s) => s.readOnly)
  const { view, size, selected, tool, snap, hidden, showSeats, measure, set, select, fill, fillPreview } = useLayoutView()
  const basePlan = d.layout.basePlan
  const plan = usePlan(basePlan?.planId)
  const wrap = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<Drag | null>(null)
  const pointers = useRef(new Map<number, Pt>())
  const [marquee, setMarquee] = useState<{ a: Pt; b: Pt } | null>(null)
  const [hoverSeat, setHoverSeat] = useState<{ itemId: string; index: number } | null>(null)
  const [space, setSpace] = useState(false)
  const fitted = useRef(false)

  const seats = useMemo(() => seatMap(d.guests), [d.guests])
  const visible = useMemo(() => d.layout.items.filter((i) => !hidden.includes(i.layer)), [d.layout.items, hidden])
  const ordered = useMemo(() => {
    return drawOrder(visible)
  }, [visible])
  const issues = useMemo(() => clearanceIssues(d.layout.items), [d.layout.items])
  // A pole clash is the furniture's problem — tinting a whole marquee red would hide everything inside.
  const warnIds = useMemo(() => new Set(issues.flatMap((i) => (i.kind === 'pole' ? [i.a] : [i.a, i.b]))), [issues])
  const selItems = d.layout.items.filter((i) => selected.includes(i.id))

  // Track canvas size; fit on first show.
  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      set({ size: { w: el.clientWidth, h: el.clientHeight } })
      if (!fitted.current && el.clientWidth > 0) {
        fitted.current = true
        requestAnimationFrame(fitView)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [set])

  const world = (clientX: number, clientY: number): Pt => {
    const r = svg.current!.getBoundingClientRect()
    const v = useLayoutView.getState().view
    return { x: v.x + (clientX - r.left) / v.s, y: v.y + (clientY - r.top) / v.s }
  }

  const itemAt = (p: Pt): LayoutItem | undefined => {
    for (let i = ordered.length - 1; i >= 0; i--) {
      const it = ordered[i]
      if (hitTest(it, p)) return it
      // Chairs count as part of the table for picking.
      if (it.seats && (it.kind === 'round-table' || it.kind === 'banquet-table') && pointInPoly(p, footprint(it))) return it
    }
    return undefined
  }

  /* ---------- Wheel: pinch/ctrl zooms, trackpad scroll pans, mouse wheel zooms ---------- */
  useEffect(() => {
    const el = svg.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const around = { x: e.clientX - r.left, y: e.clientY - r.top }
      const trackpadPan = !e.ctrlKey && e.deltaMode === 0 && (Math.abs(e.deltaX) > 0 || Math.abs(e.deltaY) < 40)
      if (trackpadPan && !e.ctrlKey) {
        const v = useLayoutView.getState().view
        set({ view: { ...v, x: v.x + e.deltaX / v.s, y: v.y + e.deltaY / v.s } })
      } else {
        zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0022)), around)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [set])

  /* ---------- Keyboard ---------- */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input,textarea,select,[contenteditable]')) return
      const sel = useLayoutView.getState().selected
      const mod = e.metaKey || e.ctrlKey
      if (e.code === 'Space') {
        setSpace(true)
        return
      }
      if (readOnly) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel.length) (e.preventDefault(), deleteItems(sel))
      else if (mod && e.key.toLowerCase() === 'd' && sel.length) (e.preventDefault(), duplicateItems(sel))
      else if (mod && e.key.toLowerCase() === 'c' && sel.length) copyItems(sel)
      else if (mod && e.key.toLowerCase() === 'v') (e.preventDefault(), pasteItems())
      else if (mod && e.key.toLowerCase() === 'a') (e.preventDefault(), select(getDoc().layout.items.map((i) => i.id)))
      else if (e.key === 'Escape') (select([]), set({ tool: 'select', measure: null }))
      else if (e.key.toLowerCase() === 'r' && !mod && sel.length) rotateBy(sel, e.shiftKey ? -15 : 15)
      else if (e.key.toLowerCase() === 'v' && !mod) set({ tool: 'select' })
      else if (e.key.toLowerCase() === 'h' && !mod) set({ tool: 'pan' })
      else if (e.key.toLowerCase() === 'm' && !mod) set({ tool: 'measure' })
      else if (e.key.toLowerCase() === 'f' && !mod && !readOnly) set({ tool: 'fill', fill: null, fillPreview: [] })
      else if (e.key === '0' && mod) (e.preventDefault(), fitView())
      else if (e.key.startsWith('Arrow') && sel.length) {
        e.preventDefault()
        const step = e.shiftKey ? 1 : 0.1
        nudge(sel, e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0)
      }
    }
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpace(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [readOnly, select, set])

  /* ---------- Pointer ---------- */
  const onPointerDown = (e: React.PointerEvent) => {
    try {
      svg.current!.setPointerCapture(e.pointerId)
    } catch {
      /* not an active pointer — dragging still works via move events */
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const v = useLayoutView.getState().view

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      drag.current = { mode: 'pinch', startDist: Math.hypot(a.x - b.x, a.y - b.y), startMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, origView: v }
      setMarquee(null)
      return
    }

    const p = world(e.clientX, e.clientY)
    const handle = (e.target as Element).closest('[data-handle]')?.getAttribute('data-handle')

    if (e.button === 1 || space || tool === 'pan') {
      drag.current = { mode: 'pan', startClient: { x: e.clientX, y: e.clientY }, origView: v }
      return
    }
    if (tool === 'measure' || tool === 'calibrate') {
      drag.current = { mode: 'measure', start: p }
      set({ measure: { a: p, b: p } })
      return
    }
    if (tool === 'moveplan' && basePlan && !readOnly) {
      drag.current = { mode: 'moveplan', start: p, orig: { x: basePlan.x, y: basePlan.y }, key: `plan-${Date.now()}` }
      return
    }
    if (handle && selItems.length === 1 && !readOnly) {
      const it = selItems[0]
      const key = `${handle}-${Date.now()}`
      if (handle === 'rotate') drag.current = { mode: 'rotate', id: it.id, key, start: it.rotation }
      else {
        const [sx, sy] = handle.split(',').map(Number)
        drag.current = { mode: 'resize', id: it.id, key, orig: { ...it }, sx, sy }
      }
      return
    }

    // Fill: drag out an area, or click inside a marquee or room.
    if (tool === 'fill' && !readOnly) {
      drag.current = { mode: 'fillrect', start: p, now: p }
      setMarquee({ a: p, b: p })
      return
    }

    const hit = itemAt(p)
    const armed = useLayoutView.getState().armed
    if (armed && !readOnly) {
      const seat = nearestFreeSeat(p, armed)
      if (seat && seat.dist < 2) {
        seatGuest(armed, { itemId: seat.itemId, index: seat.index })
        set({ armed: null })
      } else toast('Tap a table with a free seat')
      return
    }
    if (hit) {
      let sel = selected
      if (e.shiftKey || e.metaKey) sel = selected.includes(hit.id) ? selected.filter((x) => x !== hit.id) : [...selected, hit.id]
      else if (!selected.includes(hit.id)) sel = [hit.id]
      select(sel)
      if (readOnly) return
      const items = getDoc().layout.items.filter((i) => sel.includes(i.id) && !i.locked)
      drag.current = { mode: 'move', start: p, orig: new Map(items.map((i) => [i.id, { x: i.x, y: i.y }])), anchor: hit.id, key: `move-${Date.now()}`, moved: false }
      return
    }

    // Empty space: touch pans, mouse draws a selection box.
    if (e.pointerType === 'touch') {
      drag.current = { mode: 'pan', startClient: { x: e.clientX, y: e.clientY }, origView: v }
      if (!e.shiftKey) select([])
      return
    }
    drag.current = { mode: 'marquee', start: p, now: p, additive: e.shiftKey }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const dr = drag.current
    if (!dr) return
    const p = world(e.clientX, e.clientY)

    switch (dr.mode) {
      case 'pinch': {
        const pts = [...pointers.current.values()]
        if (pts.length < 2) return
        const [a, b] = pts
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const r = svg.current!.getBoundingClientRect()
        const ov = dr.origView
        const s = Math.min(MAX_S, Math.max(MIN_S, ov.s * (dist / dr.startDist)))
        const wx = ov.x + (dr.startMid.x - r.left) / ov.s
        const wy = ov.y + (dr.startMid.y - r.top) / ov.s
        set({ view: { s, x: wx - (mid.x - r.left) / s, y: wy - (mid.y - r.top) / s } })
        return
      }
      case 'pan': {
        const ov = dr.origView
        set({ view: { ...ov, x: ov.x - (e.clientX - dr.startClient.x) / ov.s, y: ov.y - (e.clientY - dr.startClient.y) / ov.s } })
        return
      }
      case 'move': {
        let dx = p.x - dr.start.x
        let dy = p.y - dr.start.y
        if (!dr.moved && Math.hypot(dx, dy) * useLayoutView.getState().view.s < 3) return
        dr.moved = true
        const a = dr.orig.get(dr.anchor)
        if (snap && a && !e.altKey) {
          dx = snapTo(a.x + dx, SNAP) - a.x
          dy = snapTo(a.y + dy, SNAP) - a.y
        }
        // A lone trestle butts flush against the end of another (Alt to place freely).
        if (a && dr.orig.size === 1 && !e.altKey) {
          const all = getDoc().layout.items
          const me = all.find((i) => i.id === dr.anchor)
          if (me?.joinable) {
            const pull = snapToRun({ ...me, x: a.x + dx, y: a.y + dy }, all)
            if (pull) (dx += pull.x), (dy += pull.y)
          }
        }
        update((d) => {
          for (const i of d.layout.items) {
            const o = dr.orig.get(i.id)
            if (o) (i.x = o.x + dx), (i.y = o.y + dy)
          }
        }, dr.key)
        return
      }
      case 'rotate': {
        const it = getDoc().layout.items.find((i) => i.id === dr.id)!
        let deg = (Math.atan2(p.y - it.y, p.x - it.x) * 180) / Math.PI + 90
        if (!e.altKey) deg = Math.round(deg / 15) * 15
        deg = ((deg % 360) + 360) % 360
        update((d) => {
          const i = d.layout.items.find((x) => x.id === dr.id)
          if (i) i.rotation = deg
        }, dr.key)
        return
      }
      case 'resize': {
        const o = dr.orig
        const l = toLocal(o, p)
        const anchor = { x: (-dr.sx * o.w) / 2, y: (-dr.sy * o.h) / 2 }
        let w = Math.max(0.3, Math.abs(l.x - anchor.x))
        let h = Math.max(0.1, Math.abs(l.y - anchor.y))
        if (snap && !e.altKey) (w = Math.max(SNAP, snapTo(w, SNAP / 2))), (h = Math.max(0.1, snapTo(h, SNAP / 2)))
        if (isRound(o)) w = h = Math.max(w, h)
        // Deck stages grow and shrink a whole deck at a time.
        const decks = o.decks ? decksForSize(w, h, o.decks.turned) : null
        if (decks) ({ w, h } = stageSize(decks))
        // Marquees come in standard spans and whole bays.
        if (o.tent) {
          const def = TENT_TYPES[o.tent.type]
          if (def.widths) w = def.widths.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a))
          if (o.tent.type === 'tipi') h = w
          else if (o.tent.bay) h = Math.max(1, Math.round(h / o.tent.bay)) * o.tent.bay
        }
        const c = toWorld(o, { x: anchor.x + (dr.sx * w) / 2, y: anchor.y + (dr.sy * h) / 2 })
        update((d) => {
          const i = d.layout.items.find((x) => x.id === dr.id)
          if (!i) return
          Object.assign(i, { w, h, x: c.x, y: c.y })
          if (decks) i.decks = decks
          if (i.tent) {
            i.tent.ridge = +TENT_TYPES[i.tent.type].ridge(w).toFixed(1)
            const s = i.tent.siteId ? d.site.items.find((x) => x.id === i.tent!.siteId) : undefined
            if (s) Object.assign(s, { w, h })
          }
          if (i.kind === 'banquet-table') i.seats = 2 * Math.max(1, Math.floor(Math.max(w, h) / 0.61))
        }, dr.key)
        return
      }
      case 'marquee':
      case 'fillrect':
        dr.now = p
        setMarquee({ a: dr.start, b: p })
        return
      case 'measure':
        set({ measure: { a: dr.start, b: e.shiftKey ? axisLock(dr.start, p) : p } })
        return
      case 'moveplan': {
        const nx = dr.orig.x + p.x - dr.start.x
        const ny = dr.orig.y + p.y - dr.start.y
        update((d) => {
          if (d.layout.basePlan) (d.layout.basePlan.x = nx), (d.layout.basePlan.y = ny)
        }, dr.key)
        return
      }
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    const dr = drag.current
    if (dr?.mode === 'pinch' && pointers.current.size) return
    drag.current = null
    if (!dr) return
    if (dr.mode === 'marquee') {
      setMarquee(null)
      const x1 = Math.min(dr.start.x, dr.now.x)
      const x2 = Math.max(dr.start.x, dr.now.x)
      const y1 = Math.min(dr.start.y, dr.now.y)
      const y2 = Math.max(dr.start.y, dr.now.y)
      if ((x2 - x1) * useLayoutView.getState().view.s < 4 && (y2 - y1) * useLayoutView.getState().view.s < 4) {
        if (!dr.additive) select([])
        return
      }
      const inBox = visible.filter((i) => i.x >= x1 && i.x <= x2 && i.y >= y1 && i.y <= y2).map((i) => i.id)
      select(dr.additive ? [...new Set([...selected, ...inBox])] : inBox)
    }
    if (dr.mode === 'measure' && tool === 'calibrate') calibrate()
    if (dr.mode === 'fillrect') {
      setMarquee(null)
      const w = Math.abs(dr.now.x - dr.start.x)
      const h = Math.abs(dr.now.y - dr.start.y)
      if (w > 1.5 && h > 1.5) return set({ fill: { x: (dr.start.x + dr.now.x) / 2, y: (dr.start.y + dr.now.y) / 2, w, h, rotation: 0 } })
      // A click: the marquee or room under it.
      const items = getDoc().layout.items
      const tent = [...items].reverse().find((i) => i.kind === 'tent' && pointInPoly(dr.start, regionPoly(regionFor(i))))
      if (tent) return set({ fill: regionFor(tent) })
      const room = getDoc().layout.spaces.find((sp) => Math.abs(dr.start.x - sp.x) <= sp.w / 2 && Math.abs(dr.start.y - sp.y) <= sp.h / 2)
      if (room) return set({ fill: { x: room.x, y: room.y, w: room.w, h: room.h, rotation: 0 } })
      toast('Drag out an area, or click inside a marquee or room')
    }
  }

  const calibrate = async () => {
    const m = useLayoutView.getState().measure
    set({ tool: 'select' })
    if (!m || !plan || !basePlan) return
    const drawn = Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y)
    if (drawn < 0.05) return toast('Drag across a wall or dimension you know')
    const input = prompt(`That line is ${drawn.toFixed(2)} m on the plan right now.\nHow long is it in real life? (e.g. 12m or 40ft)`)
    const real = input ? parseLength(input) : null
    if (!real) return set({ measure: null })
    const k = real / drawn
    await savePlan({ ...plan, metersPerPx: plan.metersPerPx * k, calibratedBy: 'manual' })
    update((d) => {
      const bp = d.layout.basePlan
      if (!bp) return
      bp.x = m.a.x - (m.a.x - bp.x) * k
      bp.y = m.a.y - (m.a.y - bp.y) * k
    })
    set({ measure: null })
    toast(`Scale set — plan is now ${(plan.natW * plan.metersPerPx * k).toFixed(1)} m wide`)
  }

  /* ---------- Drag & drop from library / guest list ---------- */
  const onDragOver = (e: React.DragEvent) => {
    if (readOnly) return
    const types = e.dataTransfer.types
    if (types.includes('text/furniture') || types.includes('text/guest')) e.preventDefault()
    if (types.includes('text/guest')) {
      const s = nearestFreeSeat(world(e.clientX, e.clientY))
      setHoverSeat(s && s.dist < 1.5 ? { itemId: s.itemId, index: s.index } : null)
    }
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setHoverSeat(null)
    const p = world(e.clientX, e.clientY)
    const f = e.dataTransfer.getData('text/furniture')
    if (f && FURNITURE_BY_KEY[f]) return void addFurniture(f, p)
    const g = e.dataTransfer.getData('text/guest')
    if (g) {
      const s = nearestFreeSeat(p, g)
      if (s && s.dist < 1.5) seatGuest(g, { itemId: s.itemId, index: s.index })
      else toast('Drop onto a chair or table')
    }
  }

  const px = 1 / view.s
  const cursor = space || tool === 'pan' ? 'grab' : tool === 'measure' || tool === 'calibrate' ? 'crosshair' : tool === 'moveplan' ? 'move' : 'default'
  // Generous so the grid never ends mid-canvas, whatever the measured size.
  const vw = Math.max(size.w, 3000) / view.s
  const vh = Math.max(size.h, 2000) / view.s

  return (
    <div ref={wrap} className="absolute inset-0 bg-slate-100">
      <svg
        ref={svg}
        className="h-full w-full touch-none select-none"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDragOver={onDragOver}
        onDragLeave={() => setHoverSeat(null)}
        onDrop={onDrop}
        onDoubleClick={(e) => {
          const hit = itemAt(world(e.clientX, e.clientY))
          if (hit) (select([hit.id]), set({ panel: 'inspector' }), window.dispatchEvent(new CustomEvent('focus-label')))
        }}
        fontFamily="Inter, system-ui, sans-serif"
      >
        <Defs />
        <defs>
          <pattern id="grid-minor" width={0.5} height={0.5} patternUnits="userSpaceOnUse">
            <path d="M 0.5 0 L 0 0 0 0.5" fill="none" stroke="#e2e8f0" strokeWidth={px} />
          </pattern>
          <pattern id="grid-major" width={5} height={5} patternUnits="userSpaceOnUse">
            <rect width={5} height={5} fill={view.s > 12 ? 'url(#grid-minor)' : 'none'} />
            <path d="M 5 0 L 0 0 0 5" fill="none" stroke="#cbd5e1" strokeWidth={px} />
          </pattern>
        </defs>
        <g transform={`scale(${view.s}) translate(${-view.x} ${-view.y})`}>
          <rect x={view.x} y={view.y} width={vw} height={vh} fill="url(#grid-major)" />
          {d.layout.spaces.map((s) => (
            <SpaceOutline key={s.id} space={s} />
          ))}
          {plan && basePlan && <BasePlanImage plan={plan} placement={basePlan} />}
          {ordered.map((i) => (
            <ItemShape key={i.id} item={i} seats={seats} showSeats={showSeats} highlightSeat={hoverSeat?.itemId === i.id ? hoverSeat.index : undefined} />
          ))}

          {/* Spacing warnings */}
          {ordered
            .filter((i) => warnIds.has(i.id))
            .map((i) => (
              <polygon key={`w-${i.id}`} points={footprint(i).map((q) => `${q.x},${q.y}`).join(' ')} fill="#ef4444" fillOpacity={0.06} stroke="#ef4444" strokeWidth={1.5 * px} strokeDasharray={`${4 * px} ${3 * px}`} style={{ pointerEvents: 'none' }} />
            ))}

          {/* Fill preview: the area and the layout it would place */}
          {fill && (
            <g style={{ pointerEvents: 'none' }}>
              <polygon points={regionPoly(fill).map((q) => `${q.x},${q.y}`).join(' ')} fill="#6366f1" fillOpacity={0.05} stroke="#6366f1" strokeWidth={px * 1.5} strokeDasharray={`${px * 6} ${px * 4}`} />
              <g opacity={0.55}>
                {fillPreview.map((i) => (
                  <ItemShape key={i.id} item={i} />
                ))}
              </g>
            </g>
          )}

          {/* Selection */}
          {selItems.map((i) => (
            <SelectionOutline key={`s-${i.id}`} item={i} px={px} handles={selItems.length === 1 && !readOnly && !i.locked} resizable={!NO_RESIZE.has(i.kind)} />
          ))}

          {marquee && (
            <rect
              x={Math.min(marquee.a.x, marquee.b.x)}
              y={Math.min(marquee.a.y, marquee.b.y)}
              width={Math.abs(marquee.b.x - marquee.a.x)}
              height={Math.abs(marquee.b.y - marquee.a.y)}
              fill="#6366f1"
              fillOpacity={0.08}
              stroke="#6366f1"
              strokeWidth={px}
            />
          )}

          {measure && <MeasureLine a={measure.a} b={measure.b} px={px} calibrating={tool === 'calibrate'} />}
        </g>
      </svg>
      <ScaleBar s={view.s} />
    </div>
  )
}

const axisLock = (a: Pt, b: Pt): Pt => (Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? { x: b.x, y: a.y } : { x: a.x, y: b.y })

const SelectionOutline = ({ item, px, handles, resizable }: { item: LayoutItem; px: number; handles: boolean; resizable: boolean }) => {
  const pad = 4 * px
  const hs = 9 * px
  const round = isRound(item)
  return (
    <g transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}>
      {round ? (
        <circle r={item.w / 2 + pad} fill="none" stroke="#4f46e5" strokeWidth={1.5 * px} />
      ) : (
        <rect x={-item.w / 2 - pad} y={-item.h / 2 - pad} width={item.w + pad * 2} height={item.h + pad * 2} fill="none" stroke="#4f46e5" strokeWidth={1.5 * px} />
      )}
      {handles && (
        <>
          <line x1={0} y1={-item.h / 2 - pad} x2={0} y2={-item.h / 2 - pad - 22 * px} stroke="#4f46e5" strokeWidth={1.5 * px} />
          <circle data-handle="rotate" cx={0} cy={-item.h / 2 - pad - 22 * px} r={6 * px} fill="#fff" stroke="#4f46e5" strokeWidth={1.5 * px} style={{ cursor: 'grab' }} />
          {resizable &&
            [
              [1, 1],
              [-1, 1],
              [1, -1],
              [-1, -1],
            ].map(([sx, sy]) => (
              <rect
                key={`${sx},${sy}`}
                data-handle={`${sx},${sy}`}
                x={(sx * item.w) / 2 + sx * pad - hs / 2}
                y={(sy * item.h) / 2 + sy * pad - hs / 2}
                width={hs}
                height={hs}
                fill="#fff"
                stroke="#4f46e5"
                strokeWidth={1.5 * px}
                style={{ cursor: sx === sy ? 'nwse-resize' : 'nesw-resize' }}
              />
            ))}
        </>
      )}
    </g>
  )
}

const MeasureLine = ({ a, b, px, calibrating }: { a: Pt; b: Pt; px: number; calibrating: boolean }) => {
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const n = rotate({ x: (b.x - a.x) / (len || 1), y: (b.y - a.y) / (len || 1) }, 90)
  const color = calibrating ? '#db2777' : '#0ea5e9'
  return (
    <g style={{ pointerEvents: 'none' }}>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={2 * px} />
      {[a, b].map((q, i) => (
        <line key={i} x1={q.x - n.x * 6 * px} y1={q.y - n.y * 6 * px} x2={q.x + n.x * 6 * px} y2={q.y + n.y * 6 * px} stroke={color} strokeWidth={2 * px} />
      ))}
      {len > 0.01 && (
        <g transform={`translate(${mid.x + n.x * 14 * px} ${mid.y + n.y * 14 * px})`}>
          <rect x={-46 * px} y={-10 * px} width={92 * px} height={20 * px} rx={4 * px} fill={color} />
          <text textAnchor="middle" dominantBaseline="central" fontSize={11 * px} fill="#fff" fontWeight={600}>
            {fmtM(len)} · {fmtFt(len)}
          </text>
        </g>
      )}
    </g>
  )
}

const ScaleBar = ({ s }: { s: number }) => {
  const nice = [0.5, 1, 2, 5, 10, 20, 50, 100]
  const m = nice.find((n) => n * s >= 60) ?? 100
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-white/90 px-2 py-1 text-[10px] font-medium text-slate-600 shadow-sm">
      <div className="h-1.5 border-x-2 border-b-2 border-slate-600" style={{ width: m * s }} />
      {m} m · {(m * 3.28084).toFixed(0)} ft
    </div>
  )
}
