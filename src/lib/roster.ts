import type { EventDoc, EventType, Shift, Supplier } from '../types/event'
import { ROSTER_TEMPLATES } from '../data/roster'
import { addMinutes, fromMinutes, toMinutes } from './time'
import { uid } from './id'

/** Shift length in hours; an end before the start means it runs past midnight. */
export const shiftHours = (s: Pick<Shift, 'start' | 'end'>) => {
  const a = toMinutes(s.start)
  const b = toMinutes(s.end)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return ((b - a + 1440) % 1440 || 1440) / 60
}

export const relLabel = (day: number) =>
  day === 0 ? 'Event day' : day === -1 ? 'Day before' : day === 1 ? 'Day after' : day < 0 ? `${-day} days before` : `${day} days after`

/** "Thu 10 Jun" for a day relative to the event date, or null with no date set. */
export const dateLabel = (eventDate: string, day: number) => {
  if (!eventDate) return null
  const d = new Date(eventDate + 'T00:00')
  d.setDate(d.getDate() + day)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export const dayTitle = (eventDate: string, day: number) => {
  const date = dateLabel(eventDate, day)
  return date ? `${date} · ${relLabel(day)}` : relLabel(day)
}

export const filled = (s: Shift) => (s.supplierId ? s.needed : s.crewIds.length)
export const openPositions = (d: EventDoc) => d.shifts.filter((s) => !s.supplierId).reduce((n, s) => n + Math.max(0, s.needed - s.crewIds.length), 0)

/** Own-team labour: hours × each rostered person's rate. Supplier teams are in their quotes. */
export const crewCost = (d: EventDoc) => {
  const rate = new Map(d.crew.map((c) => [c.id, c.rate || 0]))
  return d.shifts.reduce((sum, s) => (s.supplierId ? sum : sum + shiftHours(s) * s.crewIds.reduce((r, id) => r + (rate.get(id) ?? 0), 0)), 0)
}

export const crewHours = (d: EventDoc, crewId: string) => d.shifts.filter((s) => s.crewIds.includes(crewId)).reduce((h, s) => h + shiftHours(s), 0)

/** Absolute minutes from the event day's midnight, so shifts on different days compare correctly. */
const span = (s: Shift) => {
  const a = s.day * 1440 + toMinutes(s.start)
  return [a, a + shiftHours(s) * 60] as const
}

/** People rostered on two shifts that overlap in time. */
export const doubleBookings = (d: EventDoc) => {
  const out: { crewId: string; a: Shift; b: Shift }[] = []
  for (const c of d.crew) {
    const mine = d.shifts.filter((s) => s.crewIds.includes(c.id)).sort((x, y) => span(x)[0] - span(y)[0])
    for (let i = 0; i < mine.length; i++)
      for (let j = i + 1; j < mine.length; j++) {
        const [, a1] = span(mine[i])
        const [b0] = span(mine[j])
        if (b0 < a1) out.push({ crewId: c.id, a: mine[i], b: mine[j] })
      }
  }
  return out
}

export const sortShifts = (list: Shift[]) => [...list].sort((a, b) => a.day - b.day || span(a)[0] - span(b)[0] || a.section.localeCompare(b.section))

export const newShift = (over: Partial<Shift> = {}): Shift => ({
  id: uid('s'),
  section: 'General',
  task: '',
  day: 0,
  start: '09:00',
  end: '13:00',
  crewIds: [],
  needed: 1,
  location: '',
  notes: '',
  ...over,
})

/** A starting roster for the event type, linked to matching suppliers where a supplier's team does the work. */
export const suggestedRoster = (type: EventType, startTime: string, suppliers: Supplier[]): Shift[] =>
  ROSTER_TEMPLATES[type].map(([section, task, day, start, hours, needed, supplierCategory]) => {
    const from = typeof start === 'number' ? addMinutes(startTime, start) : start
    const supplier = supplierCategory ? suppliers.find((s) => s.category === supplierCategory && s.status !== 'declined') : undefined
    return newShift({
      section,
      task,
      day,
      start: from,
      end: fromMinutes(toMinutes(from) + hours * 60),
      needed,
      supplierId: supplier?.id,
    })
  })
