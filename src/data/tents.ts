import type { TentSpec, TentType } from '../types/event'

interface TentTypeDef {
  label: string
  /** Standard spans; omitted for free-size tents. */
  widths?: number[]
  bay?: number
  eave: number
  ridge: (w: number) => number
  blurb: string
}

/** Typical hire-industry structures. Heights are rough defaults for 3D; edit per tent. */
export const TENT_TYPES: Record<TentType, TentTypeDef> = {
  frame: { label: 'Frame tent', widths: [3, 4, 5, 6, 9, 10, 12], bay: 3, eave: 2.3, ridge: (w) => 2.3 + w * 0.22, blurb: 'No centre poles; legs every bay' },
  clearspan: { label: 'Clearspan', widths: [10, 12, 15, 20, 25, 30], bay: 5, eave: 3, ridge: (w) => 3 + w * 0.16, blurb: 'Aluminium frame, completely clear inside' },
  pole: { label: 'Pole tent', widths: [6, 9, 12, 15], bay: 4.5, eave: 2.2, ridge: (w) => 2.2 + w * 0.3, blurb: 'Centre king poles and guyed sides' },
  sailcloth: { label: 'Sailcloth', widths: [9, 12, 15, 18], bay: 3, eave: 2.3, ridge: (w) => 2.3 + w * 0.35, blurb: 'Peaked tops, rounded ends, wooden poles' },
  stretch: { label: 'Stretch tent', eave: 2, ridge: () => 5, blurb: 'Free-form fabric, king poles inside' },
  tipi: { label: 'Tipi', widths: [6, 8.5, 10, 12], eave: 1.5, ridge: (w) => 3 + w * 0.45, blurb: 'Round, one tall centre pole' },
}

export const tentSpec = (type: TentType, w: number): TentSpec => {
  const t = TENT_TYPES[type]
  return { type, bay: t.bay ?? 0, eave: t.eave, ridge: +t.ridge(w).toFixed(1), walls: type === 'stretch' || type === 'tipi' ? 'open' : 'white', doors: [] }
}

/** [key, type, width, length] — the marquees offered in the library. */
export const TENT_PRESETS: [string, TentType, number, number][] = [
  ['frame-6x9', 'frame', 6, 9],
  ['frame-6x12', 'frame', 6, 12],
  ['frame-9x12', 'frame', 9, 12],
  ['frame-9x18', 'frame', 9, 18],
  ['frame-12x18', 'frame', 12, 18],
  ['clearspan-10x15', 'clearspan', 10, 15],
  ['clearspan-12x20', 'clearspan', 12, 20],
  ['clearspan-15x25', 'clearspan', 15, 25],
  ['clearspan-20x30', 'clearspan', 20, 30],
  ['pole-9x18', 'pole', 9, 18],
  ['pole-12x18', 'pole', 12, 18],
  ['sailcloth-12x18', 'sailcloth', 12, 18],
  ['sailcloth-15x24', 'sailcloth', 15, 24],
  ['stretch-10x15', 'stretch', 10, 15],
  ['stretch-15x20', 'stretch', 15, 20],
  ['tipi-8.5', 'tipi', 8.5, 8.5],
  ['tipi-12', 'tipi', 12, 12],
]

export const tentName = (type: TentType, w: number, h: number) => (type === 'tipi' ? `${TENT_TYPES.tipi.label} ${w} m` : `${TENT_TYPES[type].label} ${+w.toFixed(2)}×${+h.toFixed(2)} m`)

export const TENT_PRESETS_BY_KEY = Object.fromEntries(TENT_PRESETS.map((p) => [p[0], p]))
