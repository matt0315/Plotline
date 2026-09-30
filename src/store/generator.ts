import type { BudgetLine, CrewMember, EventDoc, EventType, LayoutItem, SiteItem, Space, Supplier, Venue, Zone } from '../types/event'
import { SCHEMA_VERSION } from '../types/event'
import { uid } from '../lib/id'
import { addMinutes } from '../lib/time'
import { FURNITURE_BY_KEY } from '../data/furniture'
import { SITE_ASSETS } from '../data/siteAssets'
import { EVENT_TEMPLATES } from '../data/eventTemplates'
import { DOC_TEMPLATES, fieldsFrom } from '../data/docTemplates'
import { suggestedRoster } from '../lib/roster'
import { chairBlockSize, offsetLatLng, rectLatLngs } from '../lib/geometry'

export interface GenerateInput {
  type: EventType
  name: string
  date: string
  guestCount: number
  venue: Venue
  startTime?: string
}

export const DEFAULT_VENUE: Venue = { name: '', address: '', lat: 40.7527, lng: -73.9772, zoom: 17 }

const item = (key: string, x: number, y: number, over: Partial<LayoutItem> = {}): LayoutItem => {
  const f = FURNITURE_BY_KEY[key]
  return {
    id: uid('i'),
    kind: f.kind,
    x,
    y,
    w: f.w,
    h: f.h,
    rotation: 0,
    label: '',
    seats: f.seats,
    rows: f.rows,
    cols: f.cols,
    color: f.color,
    layer: f.layer,
    ...(f.decks ? { decks: { ...f.decks }, height: f.height } : {}),
    ...over,
  }
}

const r1 = (n: number) => Math.round(n * 2) / 2

/** Rounds in a grid with an accessible walkway between chair backs. */
const tableGrid = (key: string, count: number, top: number, centerX: number, maxCols: number, labelFrom = 1) => {
  const f = FURNITURE_BY_KEY[key]
  const pitch = f.w + 2 * (0.08 + 0.45) + 1.25
  const cols = Math.max(1, Math.min(maxCols, Math.ceil(Math.sqrt(count * 1.5))))
  const rows = Math.ceil(count / cols)
  const items: LayoutItem[] = []
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols)
    const inRow = r === rows - 1 ? count - r * cols : cols
    const c = i % cols
    const x = centerX + (c - (inRow - 1) / 2) * pitch
    const y = top + pitch / 2 + r * pitch
    items.push(item(key, r1(x * 2) / 2, r1(y * 2) / 2, { label: `Table ${labelFrom + i}` }))
  }
  return { items, width: cols * pitch, height: rows * pitch }
}

const walls = (W: number, H: number): { spaces: Space[]; items: LayoutItem[] } => ({
  spaces: [{ id: uid('s'), name: 'Main room', x: W / 2, y: H / 2, w: W, h: H }],
  items: [
    item('exit', 0.1, H * 0.3, { rotation: 270, label: 'Exit' }),
    item('exit', W - 0.1, H * 0.3, { rotation: 90, label: 'Exit' }),
    item('door', W / 2, H - 0.08, { w: 2, label: 'Entrance' }),
  ],
})

const weddingLayout = (g: number) => {
  const tables = Math.max(1, Math.ceil(g / 10))
  const dance = Math.max(4, r1(Math.sqrt(Math.max(16, g * 0.225))))
  const grid = tableGrid('round-66', tables, 0, 0, 6)
  const W = Math.max(grid.width, dance + 10) + 6
  const top = 1.5 + 1.2 + dance + 1.5
  const H = top + grid.height + 3.5
  const cx = W / 2
  const items: LayoutItem[] = [
    item('dj', cx, 1.2, { label: 'DJ / band' }),
    item('dancefloor', cx, 2.4 + dance / 2, { w: dance, h: dance, label: 'Dance floor' }),
    ...grid.items.map((t) => ({ ...t, x: t.x + cx, y: t.y + top })),
    item('bar', W - 1, top + 2, { rotation: 90, label: 'Bar' }),
    item('cake', 1.2, top + 1, { label: 'Cake' }),
    item('gift', 1.2, top + 3, { rotation: 90, label: 'Gifts' }),
    item('welcome', cx, H - 1.6, { label: 'Welcome & seating chart' }),
  ]
  items[2].label = 'Table 1 · Head table'
  const shell = walls(W, H)
  return { spaces: shell.spaces, items: [...items, ...shell.items] }
}

const corporateLayout = (g: number) => {
  const blocksAcross = g > 280 ? 3 : 2
  const rows = Math.max(2, Math.ceil(g / (blocksAcross * 10)))
  const size = chairBlockSize(rows, 10)
  const gap = 1.8
  const W = blocksAcross * size.w + (blocksAcross - 1) * gap + 7
  const top = 1 + 4 + 3
  const H = top + size.h + 7
  const cx = W / 2
  const items: LayoutItem[] = [
    item('stage', cx, 3, { label: 'Stage' }),
    item('screen', cx - FURNITURE_BY_KEY.stage.w / 2 - 1.8, 1.8, { rotation: -20, label: 'Screen L' }),
    item('screen', cx + FURNITURE_BY_KEY.stage.w / 2 + 1.8, 1.8, { rotation: 20, label: 'Screen R' }),
  ]
  for (let b = 0; b < blocksAcross; b++) {
    const x = cx + (b - (blocksAcross - 1) / 2) * (size.w + gap)
    items.push(item('theatre', x, top + size.h / 2, { rows, cols: 10, seats: rows * 10, w: size.w, h: size.h, label: `Block ${String.fromCharCode(65 + b)}` }))
  }
  items.push(
    item('welcome', cx - 3, H - 1.5, { label: 'Registration' }),
    item('buffet', cx + 3, H - 1.5, { label: 'Coffee station' }),
  )
  const shell = walls(W, H)
  return { spaces: shell.spaces, items: [...items, ...shell.items] }
}

const partyLayout = (g: number) => {
  const tables = Math.max(1, Math.ceil(g / 8))
  const dance = Math.max(4, r1(Math.sqrt(Math.max(12, g * 0.2))))
  const grid = tableGrid('round-60', tables, 0, 0, 5)
  const W = Math.max(grid.width, dance + 8) + 6
  const top = 1.2 + dance + 1.8
  const H = top + grid.height + 3.5
  const cx = W / 2
  const items: LayoutItem[] = [
    item('dj', cx, 1, { label: 'DJ' }),
    item('dancefloor', cx, 2 + dance / 2, { w: dance, h: dance, label: 'Dance floor' }),
    ...grid.items.map((t) => ({ ...t, x: t.x + cx, y: t.y + top })),
    item('bar', W - 1, top + 2, { rotation: 90, label: 'Bar' }),
    item('buffet', 1, top + 2.5, { rotation: 90, label: 'Buffet' }),
    item('lounge', W - 2, H - 2.5, { label: 'Lounge' }),
  ]
  const shell = walls(W, H)
  return { spaces: shell.spaces, items: [...items, ...shell.items] }
}

/** Festivals are site-first; the floor plan is the hospitality marquee. */
const festivalLayout = (g: number) => {
  const W = 12
  const H = 18
  const cocktails = Math.min(24, Math.max(6, Math.ceil(g / 150)))
  const items: LayoutItem[] = [item('bar', W / 2, 1.2, { w: 5, label: 'Hospitality bar' })]
  const perRow = 4
  for (let i = 0; i < cocktails; i++) {
    const r = Math.floor(i / perRow)
    const c = i % perRow
    items.push(item('cocktail', 2 + c * 2.7, 4 + r * 2.4))
  }
  items.push(item('lounge', 2, H - 2.5, { label: 'Lounge' }), item('lounge', W - 2, H - 2.5, { label: 'Lounge' }))
  const shell = walls(W, H)
  shell.spaces[0].name = 'Hospitality marquee 12×18m'
  return { spaces: shell.spaces, items: [...items, ...shell.items] }
}

const festivalSite = (v: Venue, g: number): { items: SiteItem[]; zones: Zone[] } => {
  const asset = (key: string, dx: number, dy: number, label = '', rotation = 0): SiteItem => {
    const a = SITE_ASSETS.find((s) => s.key === key)!
    const [lat, lng] = offsetLatLng(v.lat, v.lng, dx, dy)
    return { id: uid('x'), kind: a.kind, lat, lng, w: a.w, h: a.h, rotation, label: label || a.name, color: a.color }
  }
  const side = Math.max(40, Math.round(Math.sqrt(g * 1.2)))
  const items: SiteItem[] = [
    asset('stage-main', 0, -side / 2 + 7, 'Main stage'),
    asset('bar-site', -side / 2 + 5, -side / 6, 'Bar 1', 90),
    asset('bar-site', side / 2 - 5, -side / 6, 'Bar 2', 90),
    asset('first-aid', side / 2 - 6, side / 2 - 5, 'First aid'),
    asset('info', -side / 2 + 4, side / 2 - 4, 'Info point'),
    asset('entrance', 0, side / 2 + 3, 'Main gate'),
    asset('security', -6, side / 2 + 3),
    asset('security', 6, side / 2 + 3),
    asset('generator', side / 2 + 8, -side / 2 + 4),
    asset('water', -side / 2 + 4, side / 6),
    asset('marquee-12x18', side / 2 + 14, side / 6, 'Hospitality marquee'),
    asset('parking', 0, side / 2 + 25, 'Parking'),
  ]
  const trucks = Math.min(8, Math.max(3, Math.ceil(g / 500)))
  for (let i = 0; i < trucks; i++) items.push(asset('food-truck', -side / 2 - 6, -side / 2 + 6 + i * 4, `Food truck ${i + 1}`, 90))
  const toiletBlocks = Math.max(2, Math.ceil(g / 100 / 4))
  for (let i = 0; i < toiletBlocks; i++) items.push(asset('toilets', side / 2 - 4 - (i % 3) * 6, side / 2 - 12 - Math.floor(i / 3) * 2.5, `Toilets ${i + 1}`))
  items.push(asset('toilet-ada', side / 2 - 4, side / 2 - 18 - Math.floor(toiletBlocks / 3) * 2.5, 'Accessible toilet'))
  items.push(asset('bins', 0, side / 2 - 4))
  return {
    items,
    zones: [{ id: uid('z'), name: 'Arena', color: '#6366f1', points: rectLatLngs(v.lat, v.lng, side, side, 0) }],
  }
}

export const blankEvent = (over: Partial<EventDoc> = {}): EventDoc => {
  const now = new Date().toISOString()
  return {
    id: uid('e'),
    name: 'Untitled event',
    type: 'private',
    date: '',
    startTime: '18:00',
    guestCount: 50,
    currency: 'USD',
    budgetTarget: 0,
    venue: { ...DEFAULT_VENUE },
    site: { items: [], zones: [], measures: [] },
    layout: { spaces: [], items: [] },
    guests: [],
    schedule: [],
    suppliers: [],
    docs: [],
    crew: [],
    shifts: [],
    budget: [],
    meta: { created: now, updated: now, schemaVersion: SCHEMA_VERSION },
    ...over,
  }
}

/** Template crew roles become people, each placed on the shift that fits their role. */
const rosterWithCrew = (type: EventType, start: string, suppliers: Supplier[], roles: string[]) => {
  const shifts = suggestedRoster(type, start, suppliers)
  const crew: CrewMember[] = roles.map((role) => ({ id: uid('c'), name: '', role, phone: '', email: '', rate: 0, notes: '' }))
  const sectionFor = (role: string) =>
    /registration/i.test(role) ? 'Registration' : /stage|production/i.test(role) ? 'Equipment setup' : /safety|steward|security/i.test(role) ? 'Security' : 'Event management'
  for (const c of crew) {
    const target = shifts.find((s) => !s.supplierId && s.section === sectionFor(c.role)) ?? shifts.find((s) => !s.supplierId && s.section === 'Event management')
    if (!target) continue
    target.crewIds.push(c.id)
    target.needed = Math.max(target.needed, target.crewIds.length)
  }
  return { crew, shifts }
}

export const generateEvent = (input: GenerateInput): EventDoc => {
  const t = EVENT_TEMPLATES[input.type]
  const g = Math.max(1, Math.round(input.guestCount))
  const start = input.startTime || t.startTime

  const layout =
    input.type === 'wedding' ? weddingLayout(g) : input.type === 'corporate' ? corporateLayout(g) : input.type === 'festival' ? festivalLayout(g) : partyLayout(g)

  const site = input.type === 'festival' ? festivalSite(input.venue, g) : { items: [], zones: [] }

  // Budget: typical US costs, contingency as a share of everything else.
  const budget: BudgetLine[] = t.budget.map(([category, name, fn]) => ({
    id: uid('b'),
    category,
    name,
    estimate: fn(g),
    actual: 0,
    paid: 0,
  }))
  const cont = budget.find((b) => b.category === 'Contingency')
  if (cont) {
    const pct = parseInt(/\((\d+)%\)/.exec(cont.name)?.[1] ?? '8') / 100
    cont.estimate = Math.round((budget.reduce((s, b) => s + b.estimate, 0) * pct) / 50) * 50
  }
  const staffing = budget.find((b) => b.category === 'Staffing')
  if (staffing) staffing.source = 'crew'

  // Suppliers — each linked to the matching budget line so costs flow through.
  const suppliers: Supplier[] = t.suppliers.map(([category, name, arr, dep]) => {
    const s: Supplier = {
      id: uid('v'),
      name: `${name} (TBC)`,
      category,
      contact: '',
      email: '',
      phone: '',
      status: 'researching',
      quote: 0,
      paid: 0,
      dueDate: '',
      arrival: addMinutes(start, arr),
      departure: addMinutes(start, dep),
      notes: '',
    }
    const line = budget.find((b) => b.category === category && !b.supplierId && !b.source)
    if (line) {
      line.supplierId = s.id
      s.budgetLineId = line.id
    }
    return s
  })

  return blankEvent({
    name: input.name.trim() || `${t.label} ${input.date ? new Date(input.date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}`.trim(),
    type: input.type,
    date: input.date,
    startTime: start,
    guestCount: g,
    budgetTarget: Math.round(budget.reduce((s, b) => s + b.estimate, 0) / 500) * 500,
    venue: input.venue,
    layout,
    site: { ...site, measures: [] },
    schedule: t.beats.map(([off, duration, title, phase, owner]) => ({
      id: uid('r'),
      time: addMinutes(start, off),
      duration,
      title,
      owner: owner ?? '',
      location: '',
      notes: '',
      phase,
    })),
    suppliers,
    budget,
    docs: t.docs.map((key) => {
      const tpl = DOC_TEMPLATES.find((d) => d.key === key)!
      return { id: uid('d'), title: tpl.title, description: tpl.description, fields: fieldsFrom(tpl), responses: [] }
    }),
    ...rosterWithCrew(input.type, start, suppliers, t.crew.map(([role]) => role)),
  })
}
