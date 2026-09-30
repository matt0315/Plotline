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
  /** Platform height in metres (stages). */
  height?: number
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
  source?: 'crew'
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
  callTime: string
  finishTime: string
  rate: number
  notes: string
}

export interface Venue {
  name: string
  address: string
  lat: number
  lng: number
  zoom: number
}

export interface EventDoc {
  id: ID
  name: string
  type: EventType
  date: string
  startTime: string
  guestCount: number
  currency: 'USD'
  budgetTarget: number
  venue: Venue

  site: { items: SiteItem[]; zones: Zone[]; measures: Measure[] }
  layout: { spaces: Space[]; items: LayoutItem[]; basePlan?: BasePlanPlacement }
  guests: Guest[]
  schedule: ScheduleItem[]
  suppliers: Supplier[]
  docs: DocForm[]
  crew: CrewMember[]
  budget: BudgetLine[]

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
