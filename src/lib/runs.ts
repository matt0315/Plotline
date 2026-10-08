import type { LayoutItem } from '../types/event'
import { toWorld, type Pt } from './geometry'

/** How close two ends must be to count as joined, and to snap together while dragging. */
export const JOIN_TOL = 0.02
export const SNAP_CATCH = 0.35

const long = (i: Pick<LayoutItem, 'w' | 'h'>) => Math.max(i.w, i.h)
const depth = (i: Pick<LayoutItem, 'w' | 'h'>) => Math.min(i.w, i.h)

/** The two ends of a table's long centreline, in world coordinates: [−end, +end]. */
export const tableEnds = (i: LayoutItem): [Pt, Pt] => {
  const L = long(i) / 2
  return i.w >= i.h ? [toWorld(i, { x: -L, y: 0 }), toWorld(i, { x: L, y: 0 })] : [toWorld(i, { x: 0, y: -L }), toWorld(i, { x: 0, y: L })]
}

/** Long-axis direction in degrees, folded to 0–180 so a table turned end for end still matches. */
const axis = (i: LayoutItem) => (((i.rotation + (i.w >= i.h ? 0 : 90)) % 180) + 180) % 180

const parallel = (a: LayoutItem, b: LayoutItem) => {
  const d = Math.abs(axis(a) - axis(b))
  return Math.min(d, 180 - d) < 1
}

export const canJoin = (a: LayoutItem, b: LayoutItem) => !!a.joinable && !!b.joinable && a.id !== b.id && Math.abs(depth(a) - depth(b)) < 0.02 && parallel(a, b)

const dist = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y)

/**
 * While dragging a trestle: the nudge that butts it flush against the nearest compatible end,
 * or null when none is close enough. Only end-to-end, never overlapping.
 */
export const snapToRun = (moving: LayoutItem, others: LayoutItem[]): Pt | null => {
  const mine = tableEnds(moving)
  let best: { d: number; dx: number; dy: number } | null = null
  for (const o of others) {
    if (!canJoin(moving, o)) continue
    const theirs = tableEnds(o)
    for (const m of mine)
      for (const t of theirs) {
        const d = dist(m, t)
        if (d > SNAP_CATCH || (best && d >= best.d)) continue
        const dx = t.x - m.x
        const dy = t.y - m.y
        // Butted end to end, the centres sit half of each length apart; anything less overlaps.
        const gap = Math.hypot(moving.x + dx - o.x, moving.y + dy - o.y)
        if (Math.abs(gap - (long(moving) + long(o)) / 2) > 0.05) continue
        best = { d, dx, dy }
      }
  }
  return best && { x: best.dx, y: best.dy }
}

/** Recompute which ends of every joinable table touch another. Mutates in place; cheap no-op without trestles. */
export const fixJoins = (items: LayoutItem[]) => {
  const tables = items.filter((i) => i.joinable)
  for (const t of tables) {
    const ends = tableEnds(t)
    const flags: [boolean, boolean] = [false, false]
    for (const o of tables) {
      if (!canJoin(t, o)) continue
      const theirs = tableEnds(o)
      for (let e = 0; e < 2; e++) if (theirs.some((p) => dist(p, ends[e]) < JOIN_TOL * 5)) flags[e] = true
    }
    if (!t.joined || t.joined[0] !== flags[0] || t.joined[1] !== flags[1]) t.joined = flags.some(Boolean) ? flags : undefined
  }
}

/** Every table joined to this one, end to end, in order along the run. */
export const runOf = (items: LayoutItem[], id: string): LayoutItem[] => {
  const start = items.find((i) => i.id === id)
  if (!start?.joinable) return start ? [start] : []
  const seen = new Set([start.id])
  const queue = [start]
  while (queue.length) {
    const t = queue.pop()!
    const ends = tableEnds(t)
    for (const o of items) {
      if (seen.has(o.id) || !canJoin(t, o)) continue
      if (tableEnds(o).some((p) => ends.some((q) => dist(p, q) < JOIN_TOL * 5))) {
        seen.add(o.id)
        queue.push(o)
      }
    }
  }
  const run = items.filter((i) => seen.has(i.id))
  // Order along the run's axis.
  const a = (axis(start) * Math.PI) / 180
  return run.sort((p, q) => p.x * Math.cos(a) + p.y * Math.sin(a) - (q.x * Math.cos(a) + q.y * Math.sin(a)))
}

/** Where the next trestle goes to extend a run past its + end. */
export const nextInRun = (run: LayoutItem[]): Pt | null => {
  if (!run.length) return null
  const last = run[run.length - 1]
  const first = run[0]
  if (run.length === 1) return toWorld(last, last.w >= last.h ? { x: last.w, y: 0 } : { x: 0, y: last.h })
  const dx = last.x - first.x
  const dy = last.y - first.y
  const len = Math.hypot(dx, dy)
  const step = long(last)
  return { x: last.x + (dx / len) * step, y: last.y + (dy / len) * step }
}
