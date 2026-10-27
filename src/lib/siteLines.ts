// Fences, barriers, routes and cable runs on the site map: their kinds, lengths and what to hire.
import type { EventDoc, SiteLine, SiteLineKind } from '../types/event'
import { areaM2, fmtArea, pathLengthM } from './geometry'
import { SITE_KIND_LABEL } from '../data/siteAssets'

export const LINE_KINDS: Record<SiteLineKind, { label: string; color: string; panel?: number; unit?: string; dash: string; weight: number }> = {
  // Australian temporary fence panels are 2.4 m; crowd-control barriers about 2.3 m.
  fence: { label: 'Temporary fencing', color: '#f59e0b', panel: 2.4, unit: 'panel', dash: '12 4', weight: 4 },
  barrier: { label: 'Crowd barrier', color: '#ef4444', panel: 2.3, unit: 'barrier', dash: '4 4', weight: 5 },
  route: { label: 'Route', color: '#22c55e', dash: '', weight: 4 },
  cable: { label: 'Cable run', color: '#a855f7', dash: '1 7', weight: 4 },
}

/** The points as drawn, closed back to the start for a loop. */
export const linePath = (l: Pick<SiteLine, 'points' | 'closed'>): [number, number][] => (l.closed && l.points.length > 2 ? [...l.points, l.points[0]] : l.points)

export const lineLength = (l: Pick<SiteLine, 'points' | 'closed'>) => pathLengthM(linePath(l))

/** Panels (or barriers) to cover the length, and the feet that stand them up: one more than panels on an open run. */
export const lineCounts = (l: SiteLine) => {
  const k = LINE_KINDS[l.kind]
  const len = lineLength(l)
  if (!k.panel) return { len, panels: 0, feet: 0 }
  const panels = Math.ceil(len / (l.panel || k.panel) - 0.05)
  return { len, panels, feet: l.kind === 'fence' ? panels + (l.closed ? 0 : 1) : 0 }
}

export const fmtLen = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`)

/** "84 m · 35 panels" */
export const lineSummary = (l: SiteLine) => {
  const c = lineCounts(l)
  const unit = LINE_KINDS[l.kind].unit
  return [fmtLen(c.len), c.panels ? `${c.panels} ${unit}${c.panels === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')
}

/** Fences and barriers for the load list, grouped by panel length. Cable runs by total metres. */
export const lineLoad = (d: EventDoc): [string, number][] => {
  const out = new Map<string, number>()
  const add = (k: string, n: number) => n && out.set(k, (out.get(k) ?? 0) + n)
  for (const l of d.site.lines ?? []) {
    const c = lineCounts(l)
    const panel = l.panel || LINE_KINDS[l.kind].panel
    if (l.kind === 'fence') {
      add(`Temporary fence panels (${panel} m)`, c.panels)
      add('Fence feet', c.feet)
      add('Fence clamps', c.panels - (l.closed ? 0 : 1))
    } else if (l.kind === 'barrier') add(`Crowd barriers (${panel} m)`, c.panels)
    else if (l.kind === 'cable') add('Cable (metres, plus slack)', Math.ceil(c.len * 1.1))
  }
  return [...out.entries()]
}

export interface LegendRow {
  key: string
  swatch: { color: string; shape: 'box' | 'zone' | 'line'; dash?: string }
  label: string
  detail: string
}

/** What's on the site map, for the on-screen legend and the PDF. */
export const siteLegend = (d: EventDoc): LegendRow[] => {
  const rows: LegendRow[] = []
  for (const z of d.site.zones) rows.push({ key: z.id, swatch: { color: z.color, shape: 'zone' }, label: z.name, detail: fmtArea(areaM2(z.points)) })
  const kinds = new Map<string, { color: string; n: number }>()
  for (const i of d.site.items) {
    const k = SITE_KIND_LABEL[i.kind]
    const e = kinds.get(k) ?? { color: i.color, n: 0 }
    e.n++
    kinds.set(k, e)
  }
  for (const [k, e] of kinds) rows.push({ key: `kind-${k}`, swatch: { color: e.color, shape: 'box' }, label: k, detail: e.n > 1 ? `× ${e.n}` : '' })
  const byKind = new Map<SiteLineKind, SiteLine[]>()
  for (const l of d.site.lines ?? []) byKind.set(l.kind, [...(byKind.get(l.kind) ?? []), l])
  for (const [kind, ls] of byKind) {
    const k = LINE_KINDS[kind]
    const len = ls.reduce((s, l) => s + lineLength(l), 0)
    const panels = ls.reduce((s, l) => s + lineCounts(l).panels, 0)
    rows.push({ key: `line-${kind}`, swatch: { color: ls[0].color, shape: 'line', dash: k.dash }, label: k.label, detail: [fmtLen(len), panels ? `${panels} ${k.unit}s` : ''].filter(Boolean).join(' · ') })
  }
  return rows
}
