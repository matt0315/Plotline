import type { BudgetLine, EventDoc, Guest, Phase } from '../types/event'
import { formatMoney } from './money'
import { toMinutes } from './time'
import { crewCost, doubleBookings, openPositions } from './roster'
import { KIND_LABEL } from '../data/furniture'
import { SITE_KIND_LABEL } from '../data/siteAssets'
import { clearanceIssues, isSeating } from './geometry'
import { stageKit } from './staging'

/* ---------- Budget ---------- */

export { crewCost } from './roster'

/** A line linked to a supplier or crew reads its numbers live from there. */
export const lineActual = (l: BudgetLine, d: EventDoc): number => {
  if (l.supplierId) {
    const s = d.suppliers.find((x) => x.id === l.supplierId)
    return s && s.status !== 'declined' ? s.quote : 0
  }
  if (l.source === 'crew') return crewCost(d)
  return l.actual
}

export const linePaid = (l: BudgetLine, d: EventDoc): number => {
  if (l.supplierId) return d.suppliers.find((x) => x.id === l.supplierId)?.paid ?? 0
  return l.paid
}

export const budgetTotals = (d: EventDoc) => {
  let estimate = 0
  let actual = 0
  let paid = 0
  for (const l of d.budget) {
    estimate += l.estimate
    actual += lineActual(l, d)
    paid += linePaid(l, d)
  }
  /** What we expect to spend: real figures where we have them, estimates otherwise. */
  const forecast = d.budget.reduce((s, l) => {
    const a = lineActual(l, d)
    return s + (a > 0 ? a : l.estimate)
  }, 0)
  return { estimate, actual, paid, due: actual - paid, forecast, target: d.budgetTarget, variance: d.budgetTarget - forecast }
}

/* ---------- Seating ---------- */

export const seatKey = (itemId: string, index: number) => `${itemId}:${index}`

export const seatMap = (guests: Guest[]) => {
  const m = new Map<string, Guest>()
  for (const g of guests) if (g.seat) m.set(seatKey(g.seat.itemId, g.seat.index), g)
  return m
}

export const seatingStats = (d: EventDoc) => {
  const capacity = d.layout.items.filter(isSeating).reduce((s, i) => s + i.seats, 0)
  const attending = d.guests.filter((g) => g.rsvp !== 'no')
  const seated = attending.filter((g) => g.seat).length
  return { capacity, attending: attending.length, seated, unseated: attending.length - seated, invited: d.guests.length }
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')

/* ---------- Run sheet ---------- */

export interface RunRow {
  id: string
  time: string
  duration: number
  title: string
  owner: string
  location: string
  notes: string
  phase: Phase
  /** Where a derived row comes from — edit it there. */
  source?: { kind: 'supplier' | 'crew'; id: string }
}

/** Minutes relative to the start time, wrapped to ±12h so overnight builds and 1am pack-downs sort correctly. */
const relMinutes = (d: EventDoc, t: string) => {
  const m = toMinutes(t)
  if (Number.isNaN(m)) return 9999
  return ((m - toMinutes(d.startTime) + 1440 + 720) % 1440) - 720
}

const phaseFor = (d: EventDoc, time: string): Phase => {
  const t = relMinutes(d, time)
  const ev = d.schedule.filter((s) => s.phase === 'event')
  const lo = ev.length ? Math.min(...ev.map((s) => relMinutes(d, s.time))) : 0
  const hi = ev.length ? Math.max(...ev.map((s) => relMinutes(d, s.time) + s.duration)) : 240
  return t < lo ? 'setup' : t >= hi ? 'breakdown' : 'event'
}

export const runSheet = (d: EventDoc): RunRow[] => {
  const rows: RunRow[] = d.schedule.map((s) => ({ ...s }))
  for (const s of d.suppliers) {
    if (s.status === 'declined') continue
    const who = s.name || s.category
    if (s.arrival)
      rows.push({ id: `sa-${s.id}`, time: s.arrival, duration: 0, title: `${who} arrives`, owner: s.contact, location: '', notes: s.phone, phase: phaseFor(d, s.arrival), source: { kind: 'supplier', id: s.id } })
    if (s.departure)
      rows.push({ id: `sd-${s.id}`, time: s.departure, duration: 0, title: `${who} departs`, owner: s.contact, location: '', notes: '', phase: phaseFor(d, s.departure), source: { kind: 'supplier', id: s.id } })
  }
  // Event-day roster shifts appear on the run sheet; other days are listed separately.
  const names = new Map(d.crew.map((c) => [c.id, c.name || c.role]))
  for (const sh of d.shifts) {
    if (sh.day !== 0) continue
    const sup = sh.supplierId ? d.suppliers.find((s) => s.id === sh.supplierId) : undefined
    const who = sup ? sup.name || sup.category : sh.crewIds.map((id) => names.get(id)).filter(Boolean).join(', ') || 'Unassigned'
    const gap = !sup && sh.crewIds.length < sh.needed ? ` · ${sh.needed - sh.crewIds.length} to fill` : ''
    rows.push({ id: `sh-${sh.id}`, time: sh.start, duration: 0, title: `${sh.section}: ${sh.task || 'crew'}`, owner: who, location: sh.location, notes: `until ${sh.end}${gap}`, phase: phaseFor(d, sh.start), source: { kind: 'crew', id: sh.id } })
  }
  const order: Record<Phase, number> = { setup: 0, event: 1, breakdown: 2 }
  return rows.sort((a, b) => order[a.phase] - order[b.phase] || relMinutes(d, a.time) - relMinutes(d, b.time))
}

/* ---------- Load list ---------- */

export const loadList = (d: EventDoc) => {
  const counts = new Map<string, number>()
  const add = (k: string, n = 1) => counts.set(k, (counts.get(k) ?? 0) + n)
  for (const i of d.layout.items) {
    if (i.kind === 'label' || i.kind === 'wall' || i.kind === 'door' || i.kind === 'pillar' || i.kind === 'exit') continue
    const kit = stageKit(i)
    if (kit) {
      add('Stage decks 2.44 × 1.22 m', kit.decks)
      add(`Deck legs ${Math.round(kit.height * 1000)} mm`, kit.legs)
      if (kit.treads) add('Stage stairs (sets)', kit.treads)
      add('Stage skirting (m)', kit.skirting)
      continue
    }
    if (i.kind === 'round-table') add(`Round table ${Math.round(i.w * 39.37)}″`)
    else if (i.kind === 'banquet-table') add(`Banquet table ${(i.w * 3.28).toFixed(0)}ft`)
    else if (i.kind !== 'chair' && i.kind !== 'chair-block') add(KIND_LABEL[i.kind])
    if (isSeating(i)) add('Chairs', i.seats)
  }
  for (const s of d.site.items) add(`${SITE_KIND_LABEL[s.kind]} (site)`)
  return [...counts.entries()].map(([k, n]) => [k, +n.toFixed(1)] as [string, number]).sort((a, b) => b[1] - a[1])
}

/* ---------- What to do next ---------- */

export type Tab = 'overview' | 'layout' | 'site' | 'guests' | 'run' | 'suppliers' | 'budget' | 'docs' | 'crew'

export const nextSteps = (d: EventDoc): { text: string; tab: Tab }[] => {
  const out: { text: string; tab: Tab }[] = []
  const st = seatingStats(d)
  if (!d.guests.length && d.type !== 'festival') out.push({ text: 'Add your guest list — paste names straight in', tab: 'guests' })
  else if (st.unseated > 0) out.push({ text: `${st.unseated} attending guest${st.unseated === 1 ? '' : 's'} not seated yet`, tab: 'layout' })
  // Festivals are standing crowds — seat counts don't apply.
  if (d.type !== 'festival' && st.capacity < d.guestCount) out.push({ text: `Seats for ${st.capacity} but expecting ${d.guestCount}`, tab: 'layout' })
  const issues = clearanceIssues(d.layout.items)
  if (issues.length) out.push({ text: `${issues.length} spacing issue${issues.length === 1 ? '' : 's'} on the floor plan`, tab: 'layout' })
  const open = d.suppliers.filter((s) => s.status === 'researching' || s.status === 'quoted')
  if (open.length) out.push({ text: `${open.length} supplier${open.length === 1 ? '' : 's'} still to book`, tab: 'suppliers' })
  const b = budgetTotals(d)
  if (b.target > 0 && b.variance < 0) out.push({ text: `Forecast is ${formatMoney(-b.variance, d.currency)} over budget`, tab: 'budget' })
  const pending = d.guests.filter((g) => g.rsvp === 'pending').length
  if (pending) out.push({ text: `${pending} RSVP${pending === 1 ? '' : 's'} outstanding`, tab: 'guests' })
  if (!d.docs.some((f) => /risk/i.test(f.title)) && d.guestCount >= 100)
    out.push({ text: 'No risk assessment yet — recommended for 100+ guests', tab: 'docs' })
  if (!d.shifts.length) out.push({ text: 'Build your crew roster — set-up, service and pack-down', tab: 'crew' })
  const unfilled = openPositions(d)
  if (unfilled) out.push({ text: `${unfilled} rostered position${unfilled === 1 ? '' : 's'} still to fill`, tab: 'crew' })
  const clashes = doubleBookings(d)
  if (clashes.length) out.push({ text: `${clashes.length} crew double-booking${clashes.length === 1 ? '' : 's'} on the roster`, tab: 'crew' })
  return out
}
