import type { LayoutItem, StageDecks } from '../types/event'

/** Standard stage deck: 8 ft × 4 ft. */
export const DECK_LONG = 2.44
export const DECK_SHORT = 1.22

/** Common deck leg heights (metres), with the imperial size they're sold as. */
export const STAGE_HEIGHTS: { m: number; label: string }[] = [
  { m: 0.2, label: '200 mm · 8″' },
  { m: 0.3, label: '300 mm · 12″' },
  { m: 0.4, label: '400 mm · 16″' },
  { m: 0.6, label: '600 mm · 24″' },
  { m: 0.8, label: '800 mm · 32″' },
  { m: 1.0, label: '1000 mm · 40″' },
  { m: 1.2, label: '1200 mm · 48″' },
]

export const heightLabel = (m: number) => STAGE_HEIGHTS.find((h) => Math.abs(h.m - m) < 0.01)?.label ?? `${Math.round(m * 1000)} mm`

/** One deck's footprint along the stage's width (x) and depth (y). */
export const deckDims = (d: StageDecks) => (d.turned ? { x: DECK_SHORT, y: DECK_LONG } : { x: DECK_LONG, y: DECK_SHORT })

export const stageSize = (d: StageDecks) => {
  const k = deckDims(d)
  return { w: +(d.across * k.x).toFixed(3), h: +(d.deep * k.y).toFixed(3) }
}

/** Closest deck grid to a dragged size — resizing always lands on whole decks. */
export const decksForSize = (w: number, h: number, turned?: boolean): StageDecks => {
  const k = deckDims({ across: 1, deep: 1, turned })
  return { across: Math.max(1, Math.round(w / k.x)), deep: Math.max(1, Math.round(h / k.y)), turned }
}

export const isDeckStage = (i: Pick<LayoutItem, 'kind' | 'decks'>) => i.kind === 'stage' && !!i.decks

/** What the hire company needs to send for one stage. Assumes the back edge sits against a wall. */
export const stageKit = (i: LayoutItem) => {
  if (!i.decks) return null
  const decks = i.decks.across * i.decks.deep
  const height = i.height ?? 0.4
  return {
    decks,
    legs: decks * 4,
    height,
    // Anything above a single step needs treads; wide stages get a set each side.
    treads: height >= 0.3 ? (i.w >= 7 ? 2 : 1) : 0,
    skirting: +(i.w + 2 * i.h).toFixed(1),
    // Open edges this high generally need guarding — rules vary, so it's a prompt, not a verdict.
    needsRail: height >= 0.6,
  }
}
