// Packs: one live link per audience. Shared by the Worker (which cuts the event down before sending it)
// and the app (which shows the audience their part). Keep this file free of browser-only code.
import type { DocForm, EventDoc, PackAudience, PackOptions, ScheduleItem } from '../types/event'

/** Lower-case words that identify an audience in free-text run sheet owners and titles. */
const wordsFor = (d: EventDoc, a: PackAudience) => {
  const sup = a.kind === 'supplier' ? d.suppliers.find((s) => s.id === a.id) : undefined
  const person = a.kind === 'crew' ? d.crew.find((c) => c.id === a.id) : undefined
  return [sup?.name, sup?.category, a.kind === 'team' ? a.id : '', person?.name, person?.role].map((w) => (w ?? '').trim().toLowerCase()).filter((w) => w.length > 2)
}

/** Run sheet items that name this audience. */
export const namesThem = (d: EventDoc, a: PackAudience) => {
  const words = wordsFor(d, a)
  return (s: Pick<ScheduleItem, 'owner' | 'title'>) => words.some((w) => `${s.owner} ${s.title}`.toLowerCase().includes(w))
}

/** Crew ids this pack belongs to: the person, or everyone rostered on the team. */
export const packCrew = (d: EventDoc, a: PackAudience) =>
  new Set(a.kind === 'team' ? d.shifts.filter((s) => s.section === a.id).flatMap((s) => s.crewIds) : a.kind === 'crew' ? [a.id] : [])

/** Shifts this audience works: their own, their team's, or their company's. */
export const packShifts = (d: EventDoc, a: PackAudience) =>
  d.shifts.filter((s) => (a.kind === 'supplier' ? s.supplierId === a.id : a.kind === 'team' ? s.section === a.id : s.crewIds.includes(a.id)))

/** The event as one audience should see it: their times, their forms, and only the extras the organiser ticked. */
export const packDoc = (d: EventDoc, p: { audience: PackAudience; opts: PackOptions }): EventDoc => {
  const a = p.audience
  const o = p.opts
  const supId = a.kind === 'supplier' ? a.id : undefined
  const ours = packCrew(d, a)
  const mine = (f: DocForm) => !!f.attachedTo && ((f.attachedTo.kind === 'supplier' && f.attachedTo.id === supId) || (f.attachedTo.kind === 'crew' && ours.has(f.attachedTo.id)))
  const forThem = namesThem(d, a)
  return {
    ...d,
    budget: [],
    budgetTarget: 0,
    // Caterers get dietary needs by seat, never names or contact details.
    guests: o.dietary ? d.guests.filter((g) => g.rsvp !== 'no').map((g) => ({ ...g, name: '', group: '', email: '', phone: '', notes: '', plusOneOf: undefined })) : [],
    suppliers: d.suppliers
      .filter((s) => s.status !== 'declined')
      .map((s) => {
        const own = s.id === supId
        const show = own || o.contacts
        return { ...s, contact: show ? s.contact : '', email: show ? s.email : '', phone: show ? s.phone : '', quote: 0, paid: 0, dueDate: '', notes: own ? s.notes : '', budgetLineId: undefined }
      }),
    crew: d.crew.map((c) => {
      const own = ours.has(c.id)
      const show = own || o.contacts
      return { ...c, phone: show ? c.phone : '', email: show ? c.email : '', rate: 0, notes: own ? c.notes : '' }
    }),
    docs: d.docs.filter(mine).map((f) => ({ ...f, responses: [] })),
    schedule: o.run ? d.schedule : d.schedule.filter(forThem),
    // The load list is worked out from the floor plan, so a load-list-only pack still needs its items.
    layout: o.floor ? d.layout : o.load ? { spaces: d.layout.spaces, items: d.layout.items } : { spaces: [], items: [] },
    site: o.site ? d.site : { items: [], zones: [], measures: [], lines: [] },
  }
}

/** Sensible extras for each audience; the organiser can change them. */
export const defaultOptions = (d: EventDoc, a: PackAudience): PackOptions => {
  if (a.kind !== 'supplier') return { floor: true, site: true, run: false, load: false, dietary: false, contacts: true }
  const s = d.suppliers.find((x) => x.id === a.id)
  const what = `${s?.category} ${s?.name}`.toLowerCase()
  const venue = /venue/.test(what)
  return {
    floor: true,
    site: true,
    run: venue || /coordinat|planner|manage/.test(what),
    load: /hire|rental|marquee|tent|furniture|staging|av\b|audio|lighting/.test(what),
    dietary: /cater|food|chef|kitchen/.test(what),
    contacts: venue,
  }
}

/** Everyone who could get a pack: suppliers, roster teams and crew members. */
export const packAudiences = (d: EventDoc): PackAudience[] => [
  ...d.suppliers.filter((s) => s.status !== 'declined').map((s): PackAudience => ({ kind: 'supplier', id: s.id, label: s.name || s.category })),
  ...[...new Set(d.shifts.filter((s) => !s.supplierId && s.section).map((s) => s.section))].map((t): PackAudience => ({ kind: 'team', id: t, label: `${t} team` })),
  ...d.crew.map((c): PackAudience => ({ kind: 'crew', id: c.id, label: c.name || c.role })),
]
