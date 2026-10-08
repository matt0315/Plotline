export type ID = string

export type EventType = 'wedding' | 'festival' | 'corporate' | 'private'

export type Layer = 'structure' | 'furniture' | 'decor'

export type LayoutKind =
  | 'round-table'
  | 'banquet-table'
  | 'cocktail-table'
  | 'chair'
  | 'chair-block'
  | 'stage'
  | 'dancefloor'
  | 'bar'
  | 'buffet'
  | 'dj'
  | 'photobooth'
  | 'cake'
  | 'gift'
  | 'welcome'
  | 'lounge'
  | 'screen'
  | 'plant'
  | 'wall'
  | 'door'
  | 'exit'
  | 'pillar'
  | 'label'
  | 'asset'
  | 'tent'

/** A thing on the floor plan. All geometry in metres; x/y is the centre. */
export interface LayoutItem {
  id: ID
  kind: LayoutKind
  x: number
  y: number
  w: number
  h: number
  rotation: number
  label: string
  /** Seating capacity. 0 for things you can't sit at. */
  seats: number
  /** chair-block only */
  rows?: number
  cols?: number
  color?: string
  layer: Layer
  locked?: boolean
  /** Stages built from 2.44 × 1.22 m decks: how many across and deep. Size follows from this. */
  decks?: StageDecks
  /** Height in metres: stage platforms, and how tall an asset stands (for 3D and sightlines). */
  height?: number
  /** Library or kit item this was placed from. A snapshot, so plans render without the library entry. */
  asset?: AssetRef
  /** Trestles that butt end to end into one long run; touching ends lose their end chairs. */
  joinable?: boolean
  /** Which ends (−, + along the long side) touch another table in the run. Kept up to date by the store. */
  joined?: [boolean, boolean]
  /** Library key it was placed from (furniture, asset or `kit:<id>`), for pricing and the load list. */
  key?: string
  /** Marquees: w is the span (width), h the length along the bays. */
  tent?: TentSpec
}

export type TentType = 'frame' | 'clearspan' | 'pole' | 'sailcloth' | 'stretch' | 'tipi'

/** A doorway in a tent wall. Sides in the tent's own frame: 0 = −y end, 1 = +x side, 2 = +y end, 3 = −x side. `at` is the offset of its centre from the middle of that side, metres. */
export interface TentDoor {
  side: 0 | 1 | 2 | 3
  at: number
  w: number
}

export interface TentSpec {
  type: TentType
  /** Bay length, metres (frame/clearspan/pole/sailcloth). Length is always a whole number of bays. */
  bay: number
  /** Wall height and peak height, metres — for 3D and sightlines. */
  eave: number
  ridge: number
  walls: 'open' | 'clear' | 'white'
  doors: TentDoor[]
  /** The matching marquee on the site map, when linked. */
  siteId?: ID
}

export interface AssetRef {
  /** Library key (src/data/assets.ts) or kit entry id. */
  key?: string
  kitId?: string
  name: string
  shape: 'rect' | 'round'
  /** Lucide icon name drawn inside the footprint. */
  icon?: string
}

/** One thing in a user's own kit: a custom item they can place, or their stock and hire price for a library item. */
export interface KitEntry {
  id: ID
  name: string
  group: string
  /** Footprint (w across, d deep) and height, metres. */
  w: number
  d: number
  z: number
  shape: 'rect' | 'round'
  color: string
  icon?: string
  /** How many you own. 0 = you hire everything. */
  owned: number
  /** Hire or cost price per unit, in `currency`. */
  price: number
  currency: string
  /** Set when this entry prices a library item rather than defining a new one. */
  libraryKey?: string
  notes?: string
  /** Added from an item request while the real one is drawn. */
  requestId?: string
  updated: string
}

export interface StageDecks {
  across: number
  deep: number
  /** Decks turned so their 1.22 m side runs across the front (e.g. catwalks). */
  turned?: boolean
}

/** A room or marquee outline on the floor plan. */
export interface Space {
  id: ID
  name: string
  x: number
  y: number
  w: number
  h: number
}

export interface BasePlanPlacement {
  planId: ID
  x: number
  y: number
  opacity: number
}

export type SiteKind =
  | 'stage'
  | 'marquee'
  | 'bar'
  | 'food-truck'
  | 'toilets'
  | 'first-aid'
  | 'generator'
  | 'info'
  | 'security'
  | 'parking'
  | 'entrance'
  | 'seating'
  | 'screen'
  | 'bins'
  | 'water'
  | 'custom'

/** A thing on the satellite site map. Real-world size in metres. */
export interface SiteItem {
  id: ID
  kind: SiteKind
  lat: number
  lng: number
  w: number
  h: number
  rotation: number
  label: string
  color: string
}

export interface Zone {
  id: ID
  name: string
  color: string
  points: [number, number][]
}

export interface Measure {
  id: ID
  points: [number, number][]
}

export type Rsvp = 'pending' | 'yes' | 'no' | 'maybe'

export interface Seat {
  itemId: ID
  index: number
}

export interface Guest {
  id: ID
  name: string
  group: string
  rsvp: Rsvp
  dietary: string
  email: string
  phone: string
  notes: string
  plusOneOf?: ID
  seat?: Seat
}

export type Phase = 'setup' | 'event' | 'breakdown'

export interface ScheduleItem {
  id: ID
  time: string // HH:MM
  duration: number // minutes
  title: string
  owner: string
  location: string
  notes: string
  phase: Phase
}

export type SupplierStatus = 'researching' | 'quoted' | 'booked' | 'paid' | 'declined'

export interface Supplier {
  id: ID
  name: string
  category: string
  contact: string
  email: string
  phone: string
  status: SupplierStatus
  quote: number
  paid: number
  dueDate: string
  /** Arrival / departure on event day — these appear on the run sheet automatically. */
  arrival: string
  departure: string
  notes: string
  budgetLineId?: ID
}

export interface BudgetLine {
  id: ID
  category: string
  name: string
  estimate: number
  /** Ignored when linked to a supplier or crew — those are read through live. */
  actual: number
  paid: number
  supplierId?: ID
  /** Read live: crew = rostered hours × rates; kit = floor-plan items × your kit prices. */
  source?: 'crew' | 'kit'
}

export type FieldType =
  | 'heading'
  | 'text'
  | 'longtext'
  | 'choice'
  | 'checkbox'
  | 'date'
  | 'photo'
  | 'signature'

export interface DocField {
  id: ID
  type: FieldType
  label: string
  options?: string[]
  required?: boolean
}

export type FieldValue = string | boolean

export interface DocResponse {
  id: ID
  submittedAt: string
  by: string
  values: Record<ID, FieldValue>
}

export interface DocForm {
  id: ID
  title: string
  description: string
  fields: DocField[]
  responses: DocResponse[]
  attachedTo?: { kind: 'supplier' | 'crew' | 'site'; id: ID }
}

export interface CrewMember {
  id: ID
  name: string
  role: string
  phone: string
  email: string
  /** Hourly rate in the event's currency. Hours come from the shifts they're rostered on. */
  rate: number
  notes: string
  /** Legacy single call time — converted into a shift on load. */
  callTime?: string
  finishTime?: string
}

/**
 * One block of work on the roster: a section (bump in, table setup…), on a day relative to
 * the event, done either by our own crew or by a supplier's team.
 */
export interface Shift {
  id: ID
  section: string
  task: string
  /** Days relative to the event: -3 = three days before, 0 = event day, 1 = the day after. */
  day: number
  start: string // HH:MM
  end: string // HH:MM — may pass midnight
  /** Our own people on this shift. */
  crewIds: ID[]
  /** Set when a supplier's team does this work (e.g. the marquee company's build crew). */
  supplierId?: ID
  /** Positions to fill — "2 of 4 filled". */
  needed: number
  location: string
  notes: string
}

export interface Venue {
  name: string
  address: string
  lat: number
  lng: number
  zoom: number
}

export type TablePlanLayout = 'alpha' | 'tables' | 'cards' | 'caterer'
export type PaperSize = 'a4' | 'a3' | 'letter' | 'a2' | 'a1' | 'p18x24' | 'p24x36'

/** How the guest-facing table plan export looks. Saved per event. */
export interface TablePlanStyle {
  layout: TablePlanLayout
  style: string
  headingFont: string
  bodyFont: string
  accent: string
  paper: PaperSize
  orientation: 'portrait' | 'landscape'
  title: string
  subtitle: string
  note: string
  dietary: boolean
  sortBy: 'first' | 'last'
  cardsPerPage: 1 | 2
}

export interface EventDoc {
  id: ID
  name: string
  type: EventType
  date: string
  startTime: string
  guestCount: number
  /** ISO code for planning amounts (budget, quotes, rates). Billing for Plotline itself is always USD. */
  currency: string
  budgetTarget: number
  venue: Venue

  site: { items: SiteItem[]; zones: Zone[]; measures: Measure[] }
  layout: { spaces: Space[]; items: LayoutItem[]; basePlan?: BasePlanPlacement }
  guests: Guest[]
  schedule: ScheduleItem[]
  suppliers: Supplier[]
  docs: DocForm[]
  crew: CrewMember[]
  shifts: Shift[]
  budget: BudgetLine[]
  tablePlan?: TablePlanStyle

  meta: { created: string; updated: string; schemaVersion: number }
}

export interface EventSummary {
  id: ID
  name: string
  type: EventType
  date: string
  updated: string
}

export type PlanSource = 'dxf' | 'dwg' | 'pdf' | 'image'

/** An imported venue drawing. Stored separately so one plan serves many events. */
export interface VenuePlan {
  id: ID
  name: string
  source: PlanSource
  /** PNG data URL (local) or public URL (cloud). */
  image: string
  /** Natural pixel size of `image`. */
  natW: number
  natH: number
  metersPerPx: number
  calibratedBy: 'units' | 'manual' | 'guess'
  visibility: 'private' | 'public'
  venueName: string
  city: string
  ownerId?: string
  created: string
}

export const SCHEMA_VERSION = 1
