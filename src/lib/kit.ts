import type { EventDoc, KitEntry, LayoutItem } from '../types/event'
import { FURNITURE, FURNITURE_BY_KEY, KIND_LABEL } from '../data/furniture'
import { ASSETS_BY_KEY } from '../data/assets'
import { isSeating, seatsLocal } from './geometry'
import { stageKit } from './staging'
import { convert } from './money'

/**
 * Your kit lives outside the event (it's yours, across every event), so derived numbers read it from here.
 * The kit store keeps this in step.
 */
let KIT: KitEntry[] = []
export const setKitRegistry = (entries: KitEntry[]) => {
  KIT = entries
}
export const kitEntries = () => KIT

const near = (a: number, b: number) => Math.abs(a - b) < 0.03

/** The library key an item came from, inferred for items placed before keys were recorded. */
export const libKey = (i: LayoutItem): string => {
  if (i.key) return i.key
  if (i.asset?.kitId) return `kit:${i.asset.kitId}`
  if (i.asset?.key) return i.asset.key
  if (i.kind === 'round-table') return FURNITURE.find((f) => f.kind === 'round-table' && near(f.w, i.w))?.key ?? `round-${Math.round(i.w * 39.37)}`
  if (i.kind === 'banquet-table') {
    const L = Math.max(i.w, i.h)
    return FURNITURE.find((f) => f.kind === 'banquet-table' && !!f.joinable === !!i.joinable && near(f.w, L))?.key ?? `banquet-${L.toFixed(2)}`
  }
  return FURNITURE.find((f) => f.kind === i.kind)?.key ?? i.kind
}

/** What a load-list line is called. */
const labelFor = (i: LayoutItem, key: string): string => {
  if (i.asset) return i.asset.name
  if (i.kind === 'round-table') return `Round table ${Math.round(i.w * 39.37)}″`
  if (i.kind === 'banquet-table') return i.joinable ? `Trestle ${Math.max(i.w, i.h).toFixed(1)}m` : `Banquet table ${(Math.max(i.w, i.h) * 3.28).toFixed(0)}ft`
  return FURNITURE_BY_KEY[key]?.name.split(' · ')[0] ?? KIND_LABEL[i.kind]
}

/** The kit entry that prices or defines this library key, if any. */
export const kitFor = (key: string): KitEntry | undefined =>
  key.startsWith('kit:') ? KIT.find((k) => `kit:${k.id}` === key) : KIT.find((k) => k.libraryKey === key)

export interface KitRow {
  key: string
  label: string
  qty: number
  owned?: number
  /** How many more you need than you own. */
  short: number
  /** Unit price in the event's currency, when your kit prices it. */
  unit?: number
  cost: number
}

const SKIP = new Set(['label', 'wall', 'door', 'pillar', 'exit'])

/** Everything the floor plan needs, counted, with your stock and prices against each line. */
export const kitRows = (d: EventDoc): KitRow[] => {
  const rows = new Map<string, { label: string; qty: number }>()
  const add = (key: string, label: string, n = 1) => {
    const r = rows.get(key)
    if (r) r.qty += n
    else rows.set(key, { label, qty: n })
  }
  for (const i of d.layout.items) {
    if (SKIP.has(i.kind)) continue
    const st = stageKit(i)
    if (st) {
      add('stage-deck', 'Stage decks 2.44 × 1.22 m', st.decks)
      add(`stage-legs-${Math.round(st.height * 1000)}`, `Deck legs ${Math.round(st.height * 1000)} mm`, st.legs)
      if (st.treads) add('stage-stairs', 'Stage stairs (sets)', st.treads)
      add('stage-skirting', 'Stage skirting (m)', st.skirting)
      continue
    }
    const key = libKey(i)
    if (i.kind !== 'chair' && i.kind !== 'chair-block') add(key, labelFor(i, key))
    if (isSeating(i)) add('chair', 'Chairs', seatsLocal(i).length)
  }
  return [...rows.entries()]
    .map(([key, r]) => {
      const k = kitFor(key)
      const qty = +r.qty.toFixed(1)
      const unit = k && k.price > 0 ? convert(k.price, k.currency, d.currency) : undefined
      return { key, label: r.label, qty, owned: k?.owned, short: k ? Math.max(0, Math.ceil(qty - k.owned)) : 0, unit, cost: unit ? unit * qty : 0 }
    })
    .sort((a, b) => b.qty - a.qty)
}

/** Floor-plan items × your kit prices, in the event's currency. Feeds a budget line with source 'kit'. */
export const kitCost = (d: EventDoc) => kitRows(d).reduce((s, r) => s + r.cost, 0)

/** Height for a library or kit key, when known. */
export const keyHeight = (key: string) => (key.startsWith('kit:') ? kitFor(key)?.z : ASSETS_BY_KEY[key]?.z)
