import type { LayoutItem } from '../../types/event'
import { FURNITURE_BY_KEY } from '../../data/furniture'
import { doc, update } from '../../store/event'
import { uid } from '../../lib/id'
import { bbox, footprint, isSeating, snap as snapTo } from '../../lib/geometry'
import { SNAP, useLayoutView, viewCenter } from './viewStore'

export const makeItem = (key: string, x: number, y: number): LayoutItem => {
  const f = FURNITURE_BY_KEY[key]
  const d = doc()
  const tables = d.layout.items.filter((i) => i.kind === 'round-table' || i.kind === 'banquet-table').length
  return {
    id: uid('i'),
    kind: f.kind,
    x: snapTo(x, SNAP),
    y: snapTo(y, SNAP),
    w: f.w,
    h: f.h,
    rotation: 0,
    label: f.kind === 'round-table' || (f.kind === 'banquet-table' && key !== 'head-table') ? `Table ${tables + 1}` : f.key === 'head-table' ? 'Head table' : f.kind === 'label' ? 'Label' : '',
    seats: f.seats,
    rows: f.rows,
    cols: f.cols,
    color: f.color,
    layer: f.layer,
  }
}

/** Add at a point, or at the centre of the current view. */
export const addFurniture = (key: string, at?: { x: number; y: number }) => {
  const p = at ?? viewCenter()
  const item = makeItem(key, p.x, p.y)
  update((d) => void d.layout.items.push(item))
  useLayoutView.getState().select([item.id])
  return item
}

export const deleteItems = (ids: string[]) => {
  if (!ids.length) return
  const set = new Set(ids)
  update((d) => {
    d.layout.items = d.layout.items.filter((i) => !set.has(i.id))
    for (const g of d.guests) if (g.seat && set.has(g.seat.itemId)) delete g.seat
  })
  useLayoutView.getState().select([])
}

let clipboard: LayoutItem[] = []

export const copyItems = (ids: string[]) => {
  clipboard = doc().layout.items.filter((i) => ids.includes(i.id))
}

export const pasteItems = (offset = 1) => {
  if (!clipboard.length) return
  const copies = clipboard.map((i) => ({ ...i, id: uid('i'), x: i.x + offset, y: i.y + offset }))
  const tables = doc().layout.items.filter((i) => i.kind === 'round-table' || i.kind === 'banquet-table').length
  let n = tables
  for (const c of copies) if (/^Table \d+/.test(c.label)) c.label = `Table ${++n}`
  update((d) => void d.layout.items.push(...copies))
  useLayoutView.getState().select(copies.map((c) => c.id))
  clipboard = copies
}

export const duplicateItems = (ids: string[]) => {
  copyItems(ids)
  pasteItems()
}

export const nudge = (ids: string[], dx: number, dy: number) =>
  update((d) => {
    for (const i of d.layout.items) if (ids.includes(i.id) && !i.locked) (i.x += dx), (i.y += dy)
  }, 'nudge')

export const rotateBy = (ids: string[], deg: number) =>
  update((d) => {
    for (const i of d.layout.items) if (ids.includes(i.id) && !i.locked) i.rotation = (((i.rotation + deg) % 360) + 360) % 360
  }, 'rotate')

type Align = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'

export const align = (ids: string[], how: Align) => {
  const items = doc().layout.items.filter((i) => ids.includes(i.id))
  if (items.length < 2) return
  const boxes = new Map(items.map((i) => [i.id, bbox(footprint(i))]))
  const all = bbox(items.flatMap((i) => footprint(i)))
  update((d) => {
    for (const i of d.layout.items) {
      const b = boxes.get(i.id)
      if (!b || i.locked) continue
      if (how === 'left') i.x += all.minX - b.minX
      if (how === 'right') i.x += all.maxX - b.maxX
      if (how === 'hcenter') i.x += (all.minX + all.maxX) / 2 - (b.minX + b.maxX) / 2
      if (how === 'top') i.y += all.minY - b.minY
      if (how === 'bottom') i.y += all.maxY - b.maxY
      if (how === 'vcenter') i.y += (all.minY + all.maxY) / 2 - (b.minY + b.maxY) / 2
    }
  })
}

export const distribute = (ids: string[], axis: 'x' | 'y') => {
  const items = doc().layout.items.filter((i) => ids.includes(i.id)).sort((a, b) => a[axis] - b[axis])
  if (items.length < 3) return
  const first = items[0][axis]
  const step = (items[items.length - 1][axis] - first) / (items.length - 1)
  const pos = new Map(items.map((i, k) => [i.id, first + step * k]))
  update((d) => {
    for (const i of d.layout.items) if (pos.has(i.id)) i[axis] = pos.get(i.id)!
  })
}

/** Seats needed vs seats placed; used to offer "add tables for the rest". */
export const addTablesForShortfall = () => {
  const d = doc()
  const capacity = d.layout.items.filter(isSeating).reduce((s, i) => s + i.seats, 0)
  const short = d.guestCount - capacity
  if (short <= 0) return 0
  const n = Math.ceil(short / 10)
  const items = d.layout.items
  const b = items.length ? bbox(items.flatMap(footprint)) : { minX: 0, maxX: 10, maxY: 0 }
  const pitch = 4
  const cols = Math.max(1, Math.floor((b.maxX - b.minX) / pitch)) || 4
  const made: LayoutItem[] = []
  let count = items.filter((i) => i.kind === 'round-table' || i.kind === 'banquet-table').length
  for (let k = 0; k < n; k++) {
    const it = makeItem('round-66', b.minX + pitch / 2 + (k % cols) * pitch, b.maxY + pitch / 2 + 0.5 + Math.floor(k / cols) * pitch)
    it.label = `Table ${++count}`
    made.push(it)
  }
  update((dd) => void dd.layout.items.push(...made))
  useLayoutView.getState().select(made.map((m) => m.id))
  return n
}
