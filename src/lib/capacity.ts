import type { EventDoc, LayoutItem } from '../types/event'
import { isSeating, pointInPoly, seatsWorld, type Pt } from './geometry'
import { regionFor, regionPoly } from './fill'
import { tentName } from '../data/tents'

/**
 * Square metres per person by layout — common planning figures (gross, allowing for aisles and service).
 * A guide only: local building and fire codes set the real limits.
 */
export const DENSITY = [
  { id: 'banquet', label: 'Banquet', m2: 1.2 },
  { id: 'theatre', label: 'Theatre', m2: 0.7 },
  { id: 'classroom', label: 'Classroom', m2: 1.6 },
  { id: 'cocktail', label: 'Cocktail', m2: 0.5 },
] as const

/** Egress width per person (5 mm, i.e. 0.2 in), and how many exits a crowd needs. */
export const EXIT_MM_PER_PERSON = 5
export const exitsNeeded = (people: number) => (people > 1000 ? 4 : people > 500 ? 3 : people > 50 ? 2 : 1)

export interface Zone {
  id: string
  name: string
  area: number
  poly: Pt[]
  /** Chairs inside it right now. */
  seated: number
  exits: { width: number; count: number }
  capacity: { id: string; label: string; people: number }[]
  /** Exit width needed for the people seated, in metres. */
  needWidth: number
  short: string | null
}

const near = (p: Pt, poly: Pt[], tol: number) => pointInPoly(p, poly) || poly.some((a, i) => {
  const b = poly[(i + 1) % poly.length]
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = dx * dx + dy * dy
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)) <= tol
})

/** Every room and marquee on the floor plan, with capacity at standard densities and an exit check. */
export const zones = (d: EventDoc): Zone[] => {
  const out: Zone[] = []
  const seatPts = d.layout.items.filter(isSeating).flatMap(seatsWorld)
  const exits = d.layout.items.filter((i) => i.kind === 'exit')

  const build = (id: string, name: string, poly: Pt[], area: number, doorWidths: number[]) => {
    const seated = seatPts.filter((p) => pointInPoly(p, poly)).length
    const exitItems = exits.filter((e) => near(e, poly, 0.6))
    const widths = [...exitItems.map((e) => e.w), ...doorWidths]
    const width = widths.reduce((s, w) => s + w, 0)
    const needWidth = (seated * EXIT_MM_PER_PERSON) / 1000
    const needCount = exitsNeeded(seated)
    let short: string | null = null
    if (seated > 0 && widths.length < needCount) short = `${seated} seated needs ${needCount} exits — ${widths.length ? `only ${widths.length}` : 'none marked'}`
    else if (seated > 0 && width < needWidth) short = `${seated} seated needs ${needWidth.toFixed(1)} m of exit width — ${width.toFixed(1)} m marked`
    out.push({
      id,
      name,
      area,
      poly,
      seated,
      exits: { width, count: widths.length },
      capacity: DENSITY.map((k) => ({ id: k.id, label: k.label, people: Math.floor(area / k.m2) })),
      needWidth,
      short,
    })
  }

  for (const s of d.layout.spaces) {
    const poly = [
      { x: s.x - s.w / 2, y: s.y - s.h / 2 },
      { x: s.x + s.w / 2, y: s.y - s.h / 2 },
      { x: s.x + s.w / 2, y: s.y + s.h / 2 },
      { x: s.x - s.w / 2, y: s.y + s.h / 2 },
    ]
    build(s.id, s.name, poly, s.w * s.h, [])
  }
  for (const t of d.layout.items.filter((i): i is LayoutItem & { tent: NonNullable<LayoutItem['tent']> } => !!i.tent)) {
    const poly = regionPoly(regionFor(t))
    const area = t.tent.type === 'tipi' ? Math.PI * (t.w / 2) ** 2 : t.tent.type === 'sailcloth' ? (t.h - t.w) * t.w + Math.PI * (t.w / 2) ** 2 : t.w * t.h
    // Open-sided marquees can be left from anywhere.
    const doors = t.tent.walls === 'open' ? [t.tent.type === 'tipi' ? Math.PI * t.w : 2 * (t.w + t.h)] : t.tent.doors.map((dr) => dr.w)
    build(t.id, t.label || tentName(t.tent.type, t.w, t.h), poly, area, doors)
  }
  return out
}

/** Exit shortfalls across the plan, for the issues list and What's next. */
export const egressIssues = (d: EventDoc) => zones(d).filter((z) => z.short)

/** Centre of a zone's outline, for labelling. */
export const zoneCentre = (z: Zone): Pt => {
  const n = z.poly.length
  return z.poly.reduce((c, p) => ({ x: c.x + p.x / n, y: c.y + p.y / n }), { x: 0, y: 0 })
}

