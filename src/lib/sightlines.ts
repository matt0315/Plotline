import type { LayoutItem } from '../types/event'
import { footprint, isSeating, pointInPoly, seatsWorld, tentPoles, toWorld, type Pt } from './geometry'
import { itemHeight } from '../data/library'

/** Eye height of a seated guest, metres. */
export const EYE_SEATED = 1.2
export const EYE_STANDING = 1.6

export interface Focus {
  id: string
  /** Where guests look: a performer's head on a stage, the middle of a screen. */
  at: Pt
  z: number
  label: string
}

const SCREEN_KEYS = new Set(['led-wall-3x2', 'led-wall-5x3', 'projector', 'tv-stand'])

/** The main thing guests face, in priority order: stage, screen, DJ, dance floor, head table. */
export const focusOf = (items: LayoutItem[]): Focus | null => {
  const pick = (f: (i: LayoutItem) => boolean) => items.filter(f).sort((a, b) => b.w * b.h - a.w * a.h)[0]
  const stage = pick((i) => i.kind === 'stage' && (i.height ?? 0) >= 0.2 && Math.max(i.w, i.h) >= 2)
  if (stage) return { id: stage.id, at: toWorld(stage, { x: 0, y: stage.h / 2 - 0.6 }), z: (stage.height ?? 0.4) + 1.5, label: stage.label || 'the stage' }
  const screen = pick((i) => i.kind === 'screen' || (i.kind === 'asset' && SCREEN_KEYS.has(i.key ?? i.asset?.key ?? '')))
  if (screen) return { id: screen.id, at: { x: screen.x, y: screen.y }, z: itemHeight(screen) * 0.65, label: screen.label || 'the screen' }
  const dj = pick((i) => i.kind === 'dj' || i.key === 'dj-booth')
  if (dj) return { id: dj.id, at: { x: dj.x, y: dj.y }, z: 1.7, label: dj.label || 'the DJ' }
  const floor = pick((i) => i.kind === 'dancefloor')
  if (floor) return { id: floor.id, at: { x: floor.x, y: floor.y }, z: 1.2, label: 'the dance floor' }
  const head = items.find((i) => i.kind === 'banquet-table' && /head/i.test(i.label))
  if (head) return { id: head.id, at: { x: head.x, y: head.y }, z: 1.2, label: head.label || 'the head table' }
  return null
}

interface Blocker {
  id: string
  poly: Pt[]
  z: number
  min: Pt
  max: Pt
}

const bounds = (poly: Pt[]) => ({
  min: { x: Math.min(...poly.map((p) => p.x)), y: Math.min(...poly.map((p) => p.y)) },
  max: { x: Math.max(...poly.map((p) => p.x)), y: Math.max(...poly.map((p) => p.y)) },
})

/** Everything taller than a seated eye line that could stand between a guest and the focus. */
const blockersFor = (items: LayoutItem[], focusId: string): Blocker[] => {
  const out: Blocker[] = []
  for (const i of items) {
    if (i.id === focusId) continue
    if (i.kind === 'tent' && i.tent) {
      for (const q of tentPoles(i)) {
        const c = toWorld(i, q)
        const poly = Array.from({ length: 6 }, (_, k) => ({ x: c.x + Math.cos((k / 6) * Math.PI * 2) * 0.1, y: c.y + Math.sin((k / 6) * Math.PI * 2) * 0.1 }))
        out.push({ id: i.id, poly, z: Math.hypot(q.x, q.y) < Math.min(i.w, i.h) / 2 - 0.5 ? i.tent.ridge : i.tent.eave, ...bounds(poly) })
      }
      continue
    }
    if (isSeating(i) || i.kind === 'label' || i.kind === 'exit' || i.kind === 'door' || i.kind === 'dancefloor') continue
    const z = itemHeight(i)
    if (z <= EYE_SEATED) continue
    const poly = i.kind === 'stage' ? footprint({ ...i, seats: 0 }) : footprint(i)
    out.push({ id: i.id, poly, z, ...bounds(poly) })
  }
  return out
}

export interface BlockedSeat {
  itemId: string
  index: number
  by: string
}

/** Seats whose view of the focus is cut by something taller than the line of sight at that point. */
export const blockedSeats = (items: LayoutItem[], focus = focusOf(items)): BlockedSeat[] => {
  if (!focus) return []
  const blockers = blockersFor(items, focus.id)
  if (!blockers.length) return []
  const out: BlockedSeat[] = []
  for (const t of items) {
    if (!isSeating(t)) continue
    seatsWorld(t).forEach((s, index) => {
      const dx = focus.at.x - s.x
      const dy = focus.at.y - s.y
      const len = Math.hypot(dx, dy)
      if (len < 0.5) return
      const min = { x: Math.min(s.x, focus.at.x), y: Math.min(s.y, focus.at.y) }
      const max = { x: Math.max(s.x, focus.at.x), y: Math.max(s.y, focus.at.y) }
      const steps = Math.ceil(len / 0.15)
      for (const b of blockers) {
        if (b.max.x < min.x || b.min.x > max.x || b.max.y < min.y || b.min.y > max.y) continue
        // Walk the sight line; blocked where the obstacle is taller than the line at that point.
        for (let k = 1; k < steps; k++) {
          const f = k / steps
          const line = EYE_SEATED + (focus.z - EYE_SEATED) * f
          if (b.z <= line) continue
          const p = { x: s.x + dx * f, y: s.y + dy * f }
          if (p.x < b.min.x || p.x > b.max.x || p.y < b.min.y || p.y > b.max.y) continue
          if (pointInPoly(p, b.poly)) {
            out.push({ itemId: t.id, index, by: b.id })
            return
          }
        }
      }
    })
  }
  return out
}

/** Blocked seats grouped by table, for the issues list. */
export const sightlineSummary = (items: LayoutItem[]) => {
  const focus = focusOf(items)
  const blocked = blockedSeats(items, focus)
  const byTable = new Map<string, number>()
  for (const b of blocked) byTable.set(b.itemId, (byTable.get(b.itemId) ?? 0) + 1)
  return { focus, blocked, byTable }
}
