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

/** Quick picks for the gap between tables (chair back to chair back). */
export const SPACINGS = [
  { id: 'comfortable', label: 'Comfortable', aisle: 1.5 },
  { id: 'standard', label: 'Standard', aisle: 1.2 },
  { id: 'minimum', label: 'Minimum', aisle: 0.915 },
] as const

/**
 * How tables sit relative to each other:
 * grid — straight rows and columns; staggered — every other row shifted half a table (packs the most rounds);
 * diamond — the grid turned 45°, rows wider apart but closer together; auto — whichever fits most.
 */
export type Pattern = 'auto' | 'grid' | 'staggered' | 'diamond'
export const PATTERNS: { id: Pattern; label: string; title: string }[] = [
  { id: 'auto', label: 'Best fit', title: 'Try every pattern and keep the one that fits most' },
  { id: 'grid', label: 'Grid', title: 'Straight rows and columns' },
  { id: 'staggered', label: 'Alternate', title: 'Every other row shifted half a table' },
  { id: 'diamond', label: 'Diamond 45°', title: 'The grid turned 45°' },
]

/** Row and column pitch for a pattern, given the centre-to-centre distance two neighbours need. */
export const latticeFor = (pattern: Exclude<Pattern, 'auto'>, p: number) =>
  pattern === 'grid' ? { px: p, py: p, stagger: false } : pattern === 'staggered' ? { px: p, py: p * Math.sqrt(3) / 2, stagger: true } : { px: p * Math.SQRT2, py: p / Math.SQRT2, stagger: true }

/** The narrowest gap we'll lay out — below an accessible walkway, so it's flagged. */
export const MIN_GAP = 0.6

export interface FillOptions {
  style: FillStyle
  /** Clear gap between neighbouring tables' chairs, metres. */
  gap: number
  pattern: Pattern
  /** Trestle runs straight along the room, or turned 45° across it. */
  runAngle: 0 | 45
  /** Keep exit doors' clear zones empty. */
  keepExits: boolean
  /** Leave this much open in front of stages and around dance floors. */
  stageGap: number
}

export const DEFAULT_FILL: FillOptions = { style: 'round-66', gap: 1.2, pattern: 'auto', runAngle: 0, keepExits: true, stageGap: 2 }

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
  const aisle = Math.max(MIN_GAP, o.gap || 1.2)
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

  /** Lay out in the chosen pattern — or try each and keep the one that fits most (ties go to the tidier grid). */
  const byPattern = (make: (x: number, y: number) => LayoutItem | null, p: number) => {
    const run = (pt: Exclude<Pattern, 'auto'>) => {
      const l = latticeFor(pt, p)
      return best(make, l.px, l.py, l.stagger)
    }
    if (o.pattern !== 'auto') return run(o.pattern)
    let top: LayoutItem[] = []
    for (const pt of ['grid', 'staggered', 'diamond'] as const) {
      const got = run(pt)
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
    result = byPattern(make, p)
    for (const t of result) t.label = `Table ${n++}`
  } else if (o.style === 'cocktail') {
    // Standing room: the gap is space for people round each table.
    const p = 0.76 + Math.max(1.2, aisle * 1.5)
    result = byPattern((x, y) => base('cocktail-table', x, y, { w: 0.76, h: 0.76, key: 'cocktail' }), p)
  } else if (o.style === 'trestle' && o.runAngle === 45) {
    // Parallel runs turned 45° across the area. Trestles step a whole table along each line so neighbours butt
    // into one run; a blocked spot just breaks that run. A few line offsets are tried and the fullest kept.
    const across = TRESTLE.d + 2 * (CHAIR_GAP + CHAIR) + aisle
    const reach = Math.hypot(hw, hh)
    const c45 = Math.SQRT1_2
    let top: LayoutItem[] = []
    for (const fc of [0, 0.25, 0.5, 0.75])
      for (const ft of [0, 0.5]) {
        const out: LayoutItem[] = []
        for (let c = -reach + fc * across; c <= reach; c += across)
          for (let t = -reach + ft * TRESTLE.w; t <= reach; t += TRESTLE.w) {
            // (t along the run, c across it) → the area's own frame, turned 45°.
            const x = (t - c) * c45
            const y = (t + c) * c45
            if (Math.abs(x) > hw || Math.abs(y) > hh) continue
            const it = base('banquet-table', x, y, { w: TRESTLE.w, h: TRESTLE.d, seats: TRESTLE.seats, joinable: true, key: 'trestle-24', rotation: region.rotation + 45 })
            const fp = footprint(it)
            if (!insideWithMargin(fp, outline, WALL_MARGIN) || !clear(fp, obs, it.x, it.y, TRESTLE.w)) continue
            out.push(it)
          }
        if (out.length > top.length) top = out
      }
    result = top
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

/**
 * Re-space tables already on the plan: same tables, same middle, new pattern and gap.
 * Keeps them in reading order (top-left first) so table numbers stay roughly where they were.
 */
/** Where a selection sits and the shape it makes, captured once so repeated re-spacing doesn't drift. */
export interface ArrangeFrame {
  cx: number
  cy: number
  /** Width ÷ height of the selection's spread. */
  aspect: number
}

export const frameOf = (items: LayoutItem[]): ArrangeFrame => {
  const xs = items.map((i) => i.x)
  const ys = items.map((i) => i.y)
  const bw = Math.max(1, Math.max(...xs) - Math.min(...xs))
  const bh = Math.max(1, Math.max(...ys) - Math.min(...ys))
  return { cx: (Math.max(...xs) + Math.min(...xs)) / 2, cy: (Math.max(...ys) + Math.min(...ys)) / 2, aspect: bw / bh }
}

export const arrangeItems = (items: LayoutItem[], pattern: Exclude<Pattern, 'auto'>, gap: number, frame = frameOf(items)): Map<string, Pt> => {
  const out = new Map<string, Pt>()
  if (items.length < 2) return out
  // Pitch from the biggest table (with chairs) so nothing collides.
  const reach = Math.max(
    ...items.map((i) => {
      const fp = footprint(i)
      const xs = fp.map((q) => q.x)
      const ys = fp.map((q) => q.y)
      return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
    }),
  )
  const l = latticeFor(pattern, reach + Math.max(MIN_GAP, gap))
  const { cx, cy, aspect } = frame
  // Keep roughly the shape the tables made when you started.
  const n = items.length
  const cols = Math.max(1, Math.min(n, Math.round(Math.sqrt((n * aspect * l.py) / l.px)) || 1))
  const rows = Math.ceil(n / cols)
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x)
  const width = (cols - 1) * l.px + (l.stagger && rows > 1 ? l.px / 2 : 0)
  const height = (rows - 1) * l.py
  const lastCount = n - (rows - 1) * cols
  sorted.forEach((it, k) => {
    const r = Math.floor(k / cols)
    const c = k % cols
    // A short last row sits centred under the others.
    const shift = (l.stagger && r % 2 ? l.px / 2 : 0) + (r === rows - 1 && lastCount < cols ? ((cols - lastCount) * l.px) / 2 : 0)
    out.set(it.id, { x: cx - width / 2 + c * l.px + shift, y: cy - height / 2 + r * l.py })
  })
  return out
}
