import type { LayoutItem } from '../types/event'
import { CHAIR, CHAIR_GAP, EXIT_CLEAR, chairBlockSize, corners, footprint, pointInPoly, polyGap, tentPoles, toWorld, type Pt } from './geometry'
import { uid } from './id'

/** An area to fill, in world metres. Rectangles carry rotation; tipis and sailcloth ends come through as polygons. */
export interface FillRegion {
  x: number
  y: number
  w: number
  h: number
  rotation: number
  /** World outline when not a plain rectangle (tipi circle, sailcloth ends). */
  poly?: Pt[]
  /** The marquee or room being filled — never treated as an obstacle. */
  sourceId?: string
}

export type FillStyle = 'round-60' | 'round-66' | 'round-72' | 'trestle' | 'theatre' | 'cocktail'

export const FILL_STYLES: { id: FillStyle; label: string }[] = [
  { id: 'round-66', label: 'Rounds 66″ · 10' },
  { id: 'round-60', label: 'Rounds 60″ · 8' },
  { id: 'round-72', label: 'Rounds 72″ · 12' },
  { id: 'trestle', label: 'Trestle runs' },
  { id: 'theatre', label: 'Theatre rows' },
  { id: 'cocktail', label: 'Cocktail / standing' },
]

export const SPACINGS = [
  { id: 'comfortable', label: 'Comfortable', aisle: 1.5 },
  { id: 'standard', label: 'Standard', aisle: 1.2 },
  { id: 'minimum', label: 'Minimum', aisle: 0.915 },
] as const
export type Spacing = (typeof SPACINGS)[number]['id']

export interface FillOptions {
  style: FillStyle
  spacing: Spacing
  /** Keep exit doors' clear zones empty. */
  keepExits: boolean
  /** Leave this much open in front of stages and around dance floors. */
  stageGap: number
}

export const DEFAULT_FILL: FillOptions = { style: 'round-66', spacing: 'standard', keepExits: true, stageGap: 2 }

const ROUND: Record<string, { d: number; seats: number }> = { 'round-60': { d: 1.52, seats: 8 }, 'round-66': { d: 1.68, seats: 10 }, 'round-72': { d: 1.83, seats: 12 } }
const TRESTLE = { w: 2.4, d: 0.75, seats: 8 }
const WALL_MARGIN = 0.6

/** The region's outline in world coordinates. */
export const regionPoly = (r: FillRegion): Pt[] => r.poly ?? corners(r)

const segDist = (p: Pt, a: Pt, b: Pt) => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = dx * dx + dy * dy
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Every point inside the outline, and at least `margin` from its edges. */
const insideWithMargin = (pts: Pt[], poly: Pt[], margin: number) =>
  pts.every((p) => pointInPoly(p, poly) && poly.every((a, i) => segDist(p, a, poly[(i + 1) % poly.length]) >= margin))

interface Obstacle {
  poly: Pt[]
  gap: number
}

/** What new furniture must keep clear of, and by how much. */
const obstacles = (items: LayoutItem[], region: FillRegion, o: FillOptions, aisle: number): Obstacle[] => {
  const out: Obstacle[] = []
  for (const i of items) {
    if (i.id === region.sourceId || i.kind === 'label' || i.kind === 'door') continue
    if (i.kind === 'tent') {
      // Marquee poles are solid; the canopy itself isn't.
      for (const q of tentPoles(i)) {
        const p = toWorld(i, q)
        out.push({ poly: [p], gap: 0.35 })
      }
      continue
    }
    if (i.kind === 'exit') {
      if (o.keepExits) out.push({ poly: corners({ ...i, h: i.h + EXIT_CLEAR * 2 }), gap: 0.2 })
      continue
    }
    const open = i.kind === 'stage' || i.kind === 'dancefloor' || i.kind === 'screen' || i.kind === 'dj'
    out.push({ poly: footprint(i), gap: open ? Math.max(aisle, o.stageGap) : i.kind === 'wall' || i.kind === 'pillar' ? 0.6 : aisle })
  }
  // The region's own poles count too.
  const src = items.find((i) => i.id === region.sourceId)
  if (src?.kind === 'tent') for (const q of tentPoles(src)) out.push({ poly: [toWorld(src, q)], gap: 0.35 })
  return out
}

const clear = (poly: Pt[], obs: Obstacle[], cx: number, cy: number, reach: number) =>
  obs.every((ob) => {
    // Cheap reject on distance before the polygon test.
    const p = ob.poly[0]
    if (ob.poly.length > 1 && Math.hypot(p.x - cx, p.y - cy) > reach + 40) return true
    return polyGap(poly, ob.poly) >= ob.gap
  })

/** Lay furniture out across a region, keeping walkways, exits, stages and poles clear. Returns new items, not yet added. */
export const fillArea = (region: FillRegion, o: FillOptions, items: LayoutItem[], firstTable = 1): LayoutItem[] => {
  const aisle = SPACINGS.find((s) => s.id === o.spacing)!.aisle
  const outline = regionPoly(region)
  const obs = obstacles(items, region, o, aisle)
  const local = (x: number, y: number) => toWorld(region, { x, y })
  const hw = region.w / 2
  const hh = region.h / 2
  let n = firstTable

  const tryLattice = (make: (x: number, y: number) => LayoutItem | null, px: number, py: number, stagger: boolean, ox: number, oy: number) => {
    const out: LayoutItem[] = []
    const placed: Obstacle[] = []
    let row = 0
    for (let y = -hh + oy; y <= hh; y += py, row++) {
      const shift = stagger && row % 2 ? px / 2 : 0
      for (let x = -hw + ox + shift; x <= hw; x += px) {
        const it = make(x, y)
        if (!it) continue
        const fp = footprint(it)
        if (!insideWithMargin(fp, outline, WALL_MARGIN)) continue
        if (!clear(fp, obs, it.x, it.y, Math.max(it.w, it.h))) continue
        if (!placed.every((pl) => polyGap(fp, pl.poly) >= pl.gap - 0.01)) continue
        out.push(it)
        placed.push({ poly: fp, gap: aisle })
      }
    }
    return out
  }

  /** Best of a few lattice offsets — small shifts often fit another row. */
  const best = (make: (x: number, y: number) => LayoutItem | null, px: number, py: number, stagger: boolean) => {
    // Fixed fractions of a pitch, plus lattices centred in the region and lined up on its centreline
    // (the latter matters when there's a row of king poles down the middle).
    const mod = (a: number, m: number) => ((a % m) + m) % m
    const xs = [px * 0.5, px * 0.25, px * 0.75, mod(2 * hw, px) / 2, mod(hw, px), mod(hw + px / 2, px)]
    const ys = [py * 0.5, py * 0.25, py * 0.75, mod(2 * hh, py) / 2, mod(hh, py)]
    let top: LayoutItem[] = []
    for (const ox of xs)
      for (const oy of ys) {
        const got = tryLattice(make, px, py, stagger, ox, oy)
        if (got.length > top.length) top = got
      }
    return top
  }

  const base = (kind: LayoutItem['kind'], x: number, y: number, extra: Partial<LayoutItem>): LayoutItem => {
    const c = local(x, y)
    return { id: uid('i'), kind, x: c.x, y: c.y, w: 1, h: 1, rotation: region.rotation, label: '', seats: 0, layer: 'furniture', color: '#ffffff', ...extra }
  }

  let result: LayoutItem[] = []
  if (o.style in ROUND) {
    const r = ROUND[o.style]
    const reach = r.d + 2 * (CHAIR_GAP + CHAIR)
    const p = reach + aisle
    const make = (x: number, y: number) => base('round-table', x, y, { w: r.d, h: r.d, seats: r.seats, key: o.style, label: '' })
    // Staggered rows often pack more than a square grid; take whichever fits more here.
    const stag = best(make, p, p * 0.866, true)
    const grid = best(make, p, p, false)
    result = stag.length > grid.length ? stag : grid // a tie goes to the tidier grid
    for (const t of result) t.label = `Table ${n++}`
  } else if (o.style === 'cocktail') {
    const p = 0.76 + 1.8
    result = best((x, y) => base('cocktail-table', x, y, { w: 0.76, h: 0.76, key: 'cocktail' }), p, p * 0.866, true)
  } else if (o.style === 'trestle') {
    // Long runs of joined trestles along the region's length, chairs both sides.
    const across = TRESTLE.d + 2 * (CHAIR_GAP + CHAIR) + aisle
    const long = region.h >= region.w
    const L = (long ? region.h : region.w) - 2 * (WALL_MARGIN + 0.6)
    const per = Math.max(1, Math.floor(L / TRESTLE.w))
    const runLen = per * TRESTLE.w
    const make = (x: number, y: number) => base('banquet-table', x, y, { w: TRESTLE.w, h: TRESTLE.d, seats: TRESTLE.seats, joinable: true, key: 'trestle-24', rotation: region.rotation + (long ? 90 : 0) })
    const rows: LayoutItem[] = []
    const span = long ? region.w : region.h
    const count = Math.max(0, Math.floor((span - 2 * WALL_MARGIN + aisle) / across))
    const start = -((count - 1) * across) / 2
    for (let k = 0; k < count; k++) {
      const c = start + k * across
      const run: LayoutItem[] = []
      for (let t = 0; t < per; t++) {
        const along = -runLen / 2 + TRESTLE.w * (t + 0.5)
        const it = long ? make(c, along) : make(along, c)
        const fp = footprint(it)
        if (!insideWithMargin(fp, outline, WALL_MARGIN) || !clear(fp, obs, it.x, it.y, TRESTLE.w)) {
          // A blocked trestle breaks the run; keep what's either side.
          continue
        }
        run.push(it)
      }
      rows.push(...run)
    }
    result = rows
  } else if (o.style === 'theatre') {
    // Blocks of up to 10 × 10 with aisles between, so poles and exits only cost a block, not the room.
    const rowsPer = 10
    const colsPer = 10
    const size = chairBlockSize(rowsPer, colsPer)
    result = best(
      (x, y) => base('chair-block', x, y, { ...size, rows: rowsPer, cols: colsPer, seats: rowsPer * colsPer, key: 'theatre', color: '#e2e8f0' }),
      size.w + aisle,
      size.h + aisle,
      false,
    )
  }
  return result
}

/** A region for a marquee's inside (its own frame) or a room. */
export const regionFor = (i: Pick<LayoutItem, 'id' | 'x' | 'y' | 'w' | 'h' | 'rotation' | 'tent' | 'kind'>): FillRegion => {
  if (i.tent?.type === 'tipi') {
    const r = i.w / 2
    return { x: i.x, y: i.y, w: i.w, h: i.h, rotation: i.rotation, sourceId: i.id, poly: Array.from({ length: 24 }, (_, k) => ({ x: i.x + Math.cos((k / 24) * Math.PI * 2) * r, y: i.y + Math.sin((k / 24) * Math.PI * 2) * r })) }
  }
  if (i.tent?.type === 'sailcloth') {
    const r = i.w / 2
    const s = Math.max(0, i.h / 2 - r)
    const pts: Pt[] = []
    for (let k = 0; k <= 12; k++) pts.push({ x: Math.cos(Math.PI + (k / 12) * Math.PI) * r, y: -s + Math.sin(Math.PI + (k / 12) * Math.PI) * r })
    for (let k = 0; k <= 12; k++) pts.push({ x: Math.cos((k / 12) * Math.PI) * r, y: s + Math.sin((k / 12) * Math.PI) * r })
    return { x: i.x, y: i.y, w: i.w, h: i.h, rotation: i.rotation, sourceId: i.id, poly: pts.map((p) => toWorld(i, p)) }
  }
  return { x: i.x, y: i.y, w: i.w, h: i.h, rotation: i.rotation, sourceId: i.kind === 'tent' ? i.id : undefined }
}
