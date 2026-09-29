import type { LayoutItem } from '../types/event'

export type Pt = { x: number; y: number }

export const CHAIR = 0.45 // chair footprint, metres
export const CHAIR_GAP = 0.08 // chair edge to table edge
export const WALKWAY_MIN = 0.915 // 36in accessible route
export const EXIT_CLEAR = 1.2

const rad = (deg: number) => (deg * Math.PI) / 180

export const rotate = (p: Pt, deg: number): Pt => {
  const c = Math.cos(rad(deg))
  const s = Math.sin(rad(deg))
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }
}

export const toWorld = (item: Pick<LayoutItem, 'x' | 'y' | 'rotation'>, p: Pt): Pt => {
  const r = rotate(p, item.rotation)
  return { x: item.x + r.x, y: item.y + r.y }
}

export const toLocal = (item: Pick<LayoutItem, 'x' | 'y' | 'rotation'>, p: Pt): Pt =>
  rotate({ x: p.x - item.x, y: p.y - item.y }, -item.rotation)

export const snap = (v: number, step: number) => Math.round(v / step) * step

export const isRound = (item: Pick<LayoutItem, 'kind'>) =>
  item.kind === 'round-table' || item.kind === 'cocktail-table' || item.kind === 'pillar' || item.kind === 'plant'

export const isSeating = (item: Pick<LayoutItem, 'kind'>) =>
  item.kind === 'round-table' || item.kind === 'banquet-table' || item.kind === 'chair' || item.kind === 'chair-block'

/** Seat positions in the item's local frame (centre origin, unrotated). */
export const seatsLocal = (item: LayoutItem): Pt[] => {
  const n = Math.max(0, Math.floor(item.seats))
  if (!n) return []
  switch (item.kind) {
    case 'round-table': {
      const r = item.w / 2 + CHAIR_GAP + CHAIR / 2
      return Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2
        return { x: Math.cos(a) * r, y: Math.sin(a) * r }
      })
    }
    case 'banquet-table': {
      // Chairs along both long sides, extras at the ends.
      const long = item.w >= item.h
      const L = long ? item.w : item.h
      const off = (long ? item.h : item.w) / 2 + CHAIR_GAP + CHAIR / 2
      const perSide = Math.max(1, Math.min(Math.ceil(n / 2), Math.floor(L / 0.6)))
      const pts: Pt[] = []
      for (let side = 0; side < 2 && pts.length < n; side++) {
        for (let i = 0; i < perSide && pts.length < n; i++) {
          const t = -L / 2 + (L / perSide) * (i + 0.5)
          const d = side === 0 ? -off : off
          pts.push(long ? { x: t, y: d } : { x: d, y: t })
        }
      }
      const endOff = L / 2 + CHAIR_GAP + CHAIR / 2
      for (let e = 0; pts.length < n && e < 2; e++) {
        const d = e === 0 ? -endOff : endOff
        pts.push(long ? { x: d, y: 0 } : { x: 0, y: d })
      }
      return pts
    }
    case 'chair':
      return [{ x: 0, y: 0 }]
    case 'chair-block': {
      const rows = Math.max(1, item.rows ?? 1)
      const cols = Math.max(1, item.cols ?? n)
      const pts: Pt[] = []
      const aisle = cols > 8 ? 1.2 : 0 // centre aisle on wide blocks
      const pitchX = (item.w - aisle) / cols
      const pitchY = item.h / rows
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols && pts.length < n; c++) {
          const extra = aisle && c >= cols / 2 ? aisle : 0
          pts.push({ x: -item.w / 2 + pitchX * (c + 0.5) + extra, y: -item.h / 2 + pitchY * (r + 0.5) })
        }
      return pts
    }
    default:
      return []
  }
}

export const seatsWorld = (item: LayoutItem): Pt[] => seatsLocal(item).map((p) => toWorld(item, p))

/** Size a chair-block from rows × cols at standard 0.5m × 0.9m pitch. */
export const chairBlockSize = (rows: number, cols: number) => ({
  w: cols * 0.5 + (cols > 8 ? 1.2 : 0),
  h: rows * 0.9,
})

/** Rectangle corners of the item body in world coordinates. */
export const corners = (item: Pick<LayoutItem, 'x' | 'y' | 'w' | 'h' | 'rotation'>, pad = 0): Pt[] => {
  const hw = item.w / 2 + pad
  const hh = item.h / 2 + pad
  return [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ].map((p) => toWorld(item, p))
}

/** Outline including chairs — what actually takes up floor. */
export const footprint = (item: LayoutItem): Pt[] => {
  if (item.kind === 'round-table' || item.kind === 'cocktail-table') {
    const r = item.w / 2 + (item.seats ? CHAIR_GAP + CHAIR : 0)
    return Array.from({ length: 16 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2
      return { x: item.x + Math.cos(a) * r, y: item.y + Math.sin(a) * r }
    })
  }
  if (item.kind === 'banquet-table' && item.seats) {
    const long = item.w >= item.h
    const pad = CHAIR_GAP + CHAIR
    const withEnds = item.seats > 2 * Math.floor((long ? item.w : item.h) / 0.6)
    const w = item.w + (long ? (withEnds ? pad * 2 : 0) : pad * 2)
    const h = item.h + (long ? pad * 2 : withEnds ? pad * 2 : 0)
    return corners({ ...item, w, h })
  }
  return corners(item)
}

export const bbox = (pts: Pt[]) => {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  for (const p of pts) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY }
}

export const hitTest = (item: LayoutItem, p: Pt): boolean => {
  const l = toLocal(item, p)
  if (isRound(item)) return Math.hypot(l.x, l.y) <= item.w / 2 + 0.05
  const pad = item.kind === 'wall' ? 0.15 : 0.02
  return Math.abs(l.x) <= item.w / 2 + pad && Math.abs(l.y) <= item.h / 2 + pad
}

const segDist = (p: Pt, a: Pt, b: Pt) => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = dx * dx + dy * dy
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

export const pointInPoly = (p: Pt, poly: Pt[]) => {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

/** Shortest gap between two polygons; 0 if they touch or overlap. */
export const polyGap = (A: Pt[], B: Pt[]): number => {
  if (A.some((p) => pointInPoly(p, B)) || B.some((p) => pointInPoly(p, A))) return 0
  let d = Infinity
  for (let i = 0; i < A.length; i++) {
    const a1 = A[i]
    const a2 = A[(i + 1) % A.length]
    for (let j = 0; j < B.length; j++) {
      const b1 = B[j]
      const b2 = B[(j + 1) % B.length]
      d = Math.min(d, segDist(a1, b1, b2), segDist(a2, b1, b2), segDist(b1, a1, a2), segDist(b2, a1, a2))
    }
  }
  return d
}

export type Clash = { a: string; b: string; gap: number; kind: 'walkway' | 'exit' | 'overlap' }

const FLOOR_KINDS = new Set(['wall', 'label', 'door', 'dancefloor', 'pillar'])

/**
 * Walkway and exit checks. Furniture closer than an accessible walkway
 * width is flagged; anything inside an exit's clear zone is flagged.
 */
export const clearanceIssues = (items: LayoutItem[]): Clash[] => {
  const out: Clash[] = []
  const solids = items.filter((i) => !FLOOR_KINDS.has(i.kind) && i.kind !== 'exit' && i.kind !== 'chair')
  const polys = new Map(solids.map((i) => [i.id, footprint(i)]))
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const A = solids[i]
      const B = solids[j]
      // Cheap reject before the polygon test.
      if (Math.hypot(A.x - B.x, A.y - B.y) > Math.max(A.w, A.h) + Math.max(B.w, B.h) + 3) continue
      const gap = polyGap(polys.get(A.id)!, polys.get(B.id)!)
      if (gap === 0) out.push({ a: A.id, b: B.id, gap, kind: 'overlap' })
      else if (gap < WALKWAY_MIN && isSeating(A) && isSeating(B)) out.push({ a: A.id, b: B.id, gap, kind: 'walkway' })
    }
  }
  for (const exit of items.filter((i) => i.kind === 'exit')) {
    const zone = corners({ ...exit, h: exit.h + EXIT_CLEAR * 2 })
    for (const s of solids) {
      if (polyGap(zone, polys.get(s.id)!) === 0) out.push({ a: exit.id, b: s.id, gap: 0, kind: 'exit' })
    }
  }
  return out
}

/* ---------- Geo helpers for the site map ---------- */

const R = 6378137

export const offsetLatLng = (lat: number, lng: number, dx: number, dy: number): [number, number] => [
  lat - (dy / R) * (180 / Math.PI),
  lng + (dx / (R * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI),
]

/** Corners of a real-size rotated rectangle centred on lat/lng. y grows southwards. */
export const rectLatLngs = (lat: number, lng: number, w: number, h: number, rotation: number): [number, number][] =>
  [
    { x: -w / 2, y: -h / 2 },
    { x: w / 2, y: -h / 2 },
    { x: w / 2, y: h / 2 },
    { x: -w / 2, y: h / 2 },
  ].map((p) => {
    const r = rotate(p, rotation)
    return offsetLatLng(lat, lng, r.x, r.y)
  })

export const distanceM = (a: [number, number], b: [number, number]): number => {
  const toR = Math.PI / 180
  const dLat = (b[0] - a[0]) * toR
  const dLng = (b[1] - a[1]) * toR
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export const pathLengthM = (pts: [number, number][]) =>
  pts.slice(1).reduce((s, p, i) => s + distanceM(pts[i], p), 0)

/** Planar polygon area — accurate at event-site scale. */
export const areaM2 = (pts: [number, number][]): number => {
  if (pts.length < 3) return 0
  const lat0 = pts[0][0]
  const k = Math.cos((lat0 * Math.PI) / 180)
  const xy = pts.map(([la, ln]) => ({ x: ((ln * Math.PI) / 180) * R * k, y: ((la * Math.PI) / 180) * R }))
  let s = 0
  for (let i = 0; i < xy.length; i++) {
    const a = xy[i]
    const b = xy[(i + 1) % xy.length]
    s += a.x * b.y - b.x * a.y
  }
  return Math.abs(s / 2)
}

export const fmtM = (m: number) => (m >= 100 ? `${Math.round(m)} m` : `${m.toFixed(m < 10 ? 2 : 1)} m`)
export const fmtFt = (m: number) => `${(m * 3.28084).toFixed(m < 3 ? 1 : 0)} ft`
export const fmtArea = (m2: number) =>
  `${Math.round(m2).toLocaleString()} m² · ${Math.round(m2 * 10.7639).toLocaleString()} ft²`
