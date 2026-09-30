import type { Layer, LayoutKind, StageDecks } from '../types/event'
import { stageSize } from '../lib/staging'

export interface FurnitureDef {
  key: string
  kind: LayoutKind
  name: string
  group: 'Tables' | 'Seating' | 'Staging' | 'Service' | 'Entertainment' | 'Structure' | 'Decor'
  w: number
  h: number
  seats: number
  layer: Layer
  color: string
  rows?: number
  cols?: number
  resizable?: boolean
  decks?: StageDecks
  height?: number
}

/** A stage preset built from whole 2.44 × 1.22 m decks. */
const stage = (key: string, name: string, decks: StageDecks, height: number): FurnitureDef => ({
  key,
  kind: 'stage',
  name,
  group: 'Staging',
  ...stageSize(decks),
  seats: 0,
  layer: 'structure',
  color: '#cbd5e1',
  resizable: true,
  decks,
  height,
})

export const FURNITURE: FurnitureDef[] = [
  { key: 'round-60', kind: 'round-table', name: 'Round 60″ · 8', group: 'Tables', w: 1.52, h: 1.52, seats: 8, layer: 'furniture', color: '#ffffff' },
  { key: 'round-66', kind: 'round-table', name: 'Round 66″ · 10', group: 'Tables', w: 1.68, h: 1.68, seats: 10, layer: 'furniture', color: '#ffffff' },
  { key: 'round-72', kind: 'round-table', name: 'Round 72″ · 12', group: 'Tables', w: 1.83, h: 1.83, seats: 12, layer: 'furniture', color: '#ffffff' },
  { key: 'banquet-6', kind: 'banquet-table', name: 'Banquet 6ft · 6', group: 'Tables', w: 1.83, h: 0.76, seats: 6, layer: 'furniture', color: '#ffffff', resizable: true },
  { key: 'banquet-8', kind: 'banquet-table', name: 'Banquet 8ft · 8', group: 'Tables', w: 2.44, h: 0.76, seats: 8, layer: 'furniture', color: '#ffffff', resizable: true },
  { key: 'head-table', kind: 'banquet-table', name: 'Head table · 12', group: 'Tables', w: 7.3, h: 0.76, seats: 12, layer: 'furniture', color: '#fef3c7', resizable: true },
  { key: 'cocktail', kind: 'cocktail-table', name: 'Cocktail (standing)', group: 'Tables', w: 0.76, h: 0.76, seats: 0, layer: 'furniture', color: '#ffffff' },

  { key: 'chair', kind: 'chair', name: 'Chair', group: 'Seating', w: 0.45, h: 0.45, seats: 1, layer: 'furniture', color: '#e2e8f0' },
  { key: 'ceremony', kind: 'chair-block', name: 'Ceremony rows 10×10', group: 'Seating', w: 6.2, h: 9, seats: 100, rows: 10, cols: 10, layer: 'furniture', color: '#e2e8f0' },
  { key: 'theatre', kind: 'chair-block', name: 'Theatre rows 6×8', group: 'Seating', w: 4, h: 5.4, seats: 48, rows: 6, cols: 8, layer: 'furniture', color: '#e2e8f0' },
  { key: 'lounge', kind: 'lounge', name: 'Lounge set', group: 'Seating', w: 2.4, h: 2, seats: 0, layer: 'furniture', color: '#ede9fe', resizable: true },

  stage('speaker-riser', 'Speaker riser · 1 deck', { across: 1, deep: 1 }, 0.2),
  stage('dj-riser', 'DJ riser · 2 decks', { across: 1, deep: 2 }, 0.4),
  stage('bridal-stage', 'Bridal stage · 6 decks', { across: 3, deep: 2 }, 0.4),
  stage('band-stage', 'Band stage · 12 decks', { across: 3, deep: 4 }, 0.6),
  stage('stage', 'Presentation stage · 12 decks', { across: 4, deep: 3 }, 0.6),
  stage('main-stage', 'Main stage · 24 decks', { across: 4, deep: 6 }, 1.0),
  stage('catwalk', 'Catwalk · 4 decks', { across: 1, deep: 4, turned: true }, 0.6),

  { key: 'bar', kind: 'bar', name: 'Bar', group: 'Service', w: 3, h: 0.8, seats: 0, layer: 'furniture', color: '#fde68a', resizable: true },
  { key: 'buffet', kind: 'buffet', name: 'Buffet station', group: 'Service', w: 3.6, h: 0.9, seats: 0, layer: 'furniture', color: '#fed7aa', resizable: true },
  { key: 'cake', kind: 'cake', name: 'Cake table', group: 'Service', w: 1.2, h: 0.8, seats: 0, layer: 'furniture', color: '#fbcfe8' },
  { key: 'gift', kind: 'gift', name: 'Gift table', group: 'Service', w: 1.8, h: 0.76, seats: 0, layer: 'furniture', color: '#ddd6fe' },
  { key: 'welcome', kind: 'welcome', name: 'Welcome / registration', group: 'Service', w: 2.4, h: 0.76, seats: 0, layer: 'furniture', color: '#bae6fd', resizable: true },

  { key: 'dancefloor', kind: 'dancefloor', name: 'Dance floor', group: 'Entertainment', w: 5, h: 5, seats: 0, layer: 'structure', color: '#f1f5f9', resizable: true },
  { key: 'dj', kind: 'dj', name: 'DJ / band', group: 'Entertainment', w: 2, h: 1, seats: 0, layer: 'furniture', color: '#c7d2fe', resizable: true },
  { key: 'screen', kind: 'screen', name: 'Screen', group: 'Entertainment', w: 3, h: 0.3, seats: 0, layer: 'furniture', color: '#1e293b', resizable: true },
  { key: 'photobooth', kind: 'photobooth', name: 'Photo booth', group: 'Entertainment', w: 2.5, h: 2.5, seats: 0, layer: 'furniture', color: '#fecdd3', resizable: true },

  { key: 'wall', kind: 'wall', name: 'Wall', group: 'Structure', w: 5, h: 0.15, seats: 0, layer: 'structure', color: '#334155', resizable: true },
  { key: 'door', kind: 'door', name: 'Door', group: 'Structure', w: 1, h: 0.15, seats: 0, layer: 'structure', color: '#94a3b8', resizable: true },
  { key: 'exit', kind: 'exit', name: 'Fire exit', group: 'Structure', w: 1.2, h: 0.2, seats: 0, layer: 'structure', color: '#16a34a', resizable: true },
  { key: 'pillar', kind: 'pillar', name: 'Pillar', group: 'Structure', w: 0.5, h: 0.5, seats: 0, layer: 'structure', color: '#64748b' },

  { key: 'plant', kind: 'plant', name: 'Plant / floral', group: 'Decor', w: 0.6, h: 0.6, seats: 0, layer: 'decor', color: '#86efac' },
  { key: 'label', kind: 'label', name: 'Text label', group: 'Decor', w: 3, h: 0.6, seats: 0, layer: 'decor', color: 'transparent', resizable: true },
]

export const FURNITURE_BY_KEY = Object.fromEntries(FURNITURE.map((f) => [f.key, f]))

export const FURNITURE_GROUPS = ['Tables', 'Seating', 'Staging', 'Service', 'Entertainment', 'Structure', 'Decor'] as const

export const KIND_LABEL: Record<LayoutKind, string> = {
  'round-table': 'Round table',
  'banquet-table': 'Banquet table',
  'cocktail-table': 'Cocktail table',
  chair: 'Chair',
  'chair-block': 'Chair rows',
  stage: 'Stage',
  dancefloor: 'Dance floor',
  bar: 'Bar',
  buffet: 'Buffet',
  dj: 'DJ / band',
  photobooth: 'Photo booth',
  cake: 'Cake table',
  gift: 'Gift table',
  welcome: 'Welcome table',
  lounge: 'Lounge',
  screen: 'Screen',
  plant: 'Plant',
  wall: 'Wall',
  door: 'Door',
  exit: 'Fire exit',
  pillar: 'Pillar',
  label: 'Label',
}
