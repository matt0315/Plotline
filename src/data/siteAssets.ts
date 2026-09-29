import type { SiteKind } from '../types/event'

export interface SiteAssetDef {
  key: string
  kind: SiteKind
  name: string
  group: 'Structures' | 'Food & drink' | 'Facilities' | 'Safety' | 'Access'
  w: number
  h: number
  color: string
}

export const SITE_ASSETS: SiteAssetDef[] = [
  { key: 'stage-main', kind: 'stage', name: 'Main stage 12×10m', group: 'Structures', w: 12, h: 10, color: '#6366f1' },
  { key: 'stage-small', kind: 'stage', name: 'Small stage 6×4m', group: 'Structures', w: 6, h: 4, color: '#6366f1' },
  { key: 'marquee-12x18', kind: 'marquee', name: 'Clearspan 12×18m', group: 'Structures', w: 12, h: 18, color: '#f8fafc' },
  { key: 'marquee-15x30', kind: 'marquee', name: 'Clearspan 15×30m', group: 'Structures', w: 15, h: 30, color: '#f8fafc' },
  { key: 'marquee-9x12', kind: 'marquee', name: 'Frame tent 9×12m', group: 'Structures', w: 9, h: 12, color: '#f8fafc' },
  { key: 'stretch', kind: 'marquee', name: 'Stretch tent 10×15m', group: 'Structures', w: 10, h: 15, color: '#e2e8f0' },
  { key: 'gazebo', kind: 'marquee', name: 'Gazebo 3×3m', group: 'Structures', w: 3, h: 3, color: '#f1f5f9' },
  { key: 'screen-led', kind: 'screen', name: 'LED screen', group: 'Structures', w: 6, h: 1, color: '#0f172a' },
  { key: 'seating-area', kind: 'seating', name: 'Seating area', group: 'Structures', w: 10, h: 8, color: '#a5b4fc' },

  { key: 'bar-site', kind: 'bar', name: 'Bar 6×3m', group: 'Food & drink', w: 6, h: 3, color: '#f59e0b' },
  { key: 'food-truck', kind: 'food-truck', name: 'Food truck', group: 'Food & drink', w: 7, h: 2.5, color: '#f97316' },
  { key: 'water', kind: 'water', name: 'Water station', group: 'Food & drink', w: 2, h: 1, color: '#0ea5e9' },

  { key: 'toilets', kind: 'toilets', name: 'Toilet block (4)', group: 'Facilities', w: 5, h: 1.3, color: '#14b8a6' },
  { key: 'toilet-ada', kind: 'toilets', name: 'Accessible toilet', group: 'Facilities', w: 2.2, h: 2.2, color: '#14b8a6' },
  { key: 'generator', kind: 'generator', name: 'Generator', group: 'Facilities', w: 4, h: 1.5, color: '#78716c' },
  { key: 'bins', kind: 'bins', name: 'Waste & recycling', group: 'Facilities', w: 3, h: 1, color: '#65a30d' },
  { key: 'info', kind: 'info', name: 'Info point', group: 'Facilities', w: 3, h: 3, color: '#8b5cf6' },

  { key: 'first-aid', kind: 'first-aid', name: 'First aid / medical', group: 'Safety', w: 6, h: 4, color: '#ef4444' },
  { key: 'security', kind: 'security', name: 'Security post', group: 'Safety', w: 2, h: 2, color: '#1e293b' },

  { key: 'entrance', kind: 'entrance', name: 'Entrance / gate', group: 'Access', w: 8, h: 2, color: '#22c55e' },
  { key: 'parking', kind: 'parking', name: 'Parking area', group: 'Access', w: 40, h: 25, color: '#94a3b8' },
  { key: 'custom', kind: 'custom', name: 'Custom box', group: 'Access', w: 5, h: 5, color: '#ec4899' },
]

export const SITE_GROUPS = ['Structures', 'Food & drink', 'Facilities', 'Safety', 'Access'] as const

export const SITE_KIND_LABEL: Record<SiteKind, string> = {
  stage: 'Stage',
  marquee: 'Marquee',
  bar: 'Bar',
  'food-truck': 'Food truck',
  toilets: 'Toilets',
  'first-aid': 'First aid',
  generator: 'Generator',
  info: 'Info point',
  security: 'Security',
  parking: 'Parking',
  entrance: 'Entrance',
  seating: 'Seating',
  screen: 'Screen',
  bins: 'Waste',
  water: 'Water',
  custom: 'Custom',
}

export const ZONE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899']
