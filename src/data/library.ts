import type { KitEntry, LayoutItem } from '../types/event'
import { FURNITURE, FURNITURE_BY_KEY, type FurnitureDef } from './furniture'
import { ASSETS, ASSETS_BY_KEY, type AssetDef } from './assets'

/** Everything the Library panel offers, in one shape. */
export interface LibEntry {
  key: string
  name: string
  group: string
  w: number
  h: number
  /** Height in metres when known (3D, sightlines). */
  z?: number
  tags: string
  source: 'furniture' | 'asset' | 'kit'
}

export const KIT_GROUP = 'Your kit'

export const LIBRARY_GROUPS = [
  KIT_GROUP,
  'Tables',
  'Seating',
  'Staging',
  'Entertainment',
  'AV & lighting',
  'Bars & catering',
  'Décor',
  'Facilities',
  'Barriers & structure',
  'Games & kids',
  'Vehicles',
]

/** The original furniture groups, folded into the wider library's. */
const FURNITURE_GROUP: Record<FurnitureDef['group'], string> = {
  Tables: 'Tables',
  Seating: 'Seating',
  Staging: 'Staging',
  Service: 'Bars & catering',
  Entertainment: 'Entertainment',
  Structure: 'Barriers & structure',
  Decor: 'Décor',
}

const fromFurniture = (f: FurnitureDef): LibEntry => ({ key: f.key, name: f.name, group: FURNITURE_GROUP[f.group], w: f.w, h: f.h, z: f.height, tags: f.tags ?? '', source: 'furniture' })
const fromAsset = (a: AssetDef): LibEntry => ({ key: a.key, name: a.name, group: a.group, w: a.w, h: a.d, z: a.z, tags: a.tags ?? '', source: 'asset' })
export const kitKey = (id: string) => `kit:${id}`
const fromKit = (k: KitEntry): LibEntry => ({ key: kitKey(k.id), name: k.name, group: KIT_GROUP, w: k.w, h: k.d, z: k.z, tags: `${k.group} ${k.notes ?? ''}`, source: 'kit' })

export const BUILT_IN: LibEntry[] = [...FURNITURE.map(fromFurniture), ...ASSETS.map(fromAsset)]

/** The full library: your own kit items first, then the built-in catalogue. Priced library items stay where they are. */
export const libraryWith = (kit: KitEntry[]): LibEntry[] => [...kit.filter((k) => !k.libraryKey).map(fromKit), ...BUILT_IN]

export const findBuiltIn = (key: string) => FURNITURE_BY_KEY[key] ?? ASSETS_BY_KEY[key]

/** Default height for an item in 3D when nothing more specific is known. */
export const itemHeight = (i: LayoutItem): number => {
  if (i.height != null) return i.height
  if (i.key && ASSETS_BY_KEY[i.key]) return ASSETS_BY_KEY[i.key].z
  switch (i.kind) {
    case 'round-table':
    case 'banquet-table':
    case 'cake':
    case 'gift':
    case 'welcome':
    case 'buffet':
      return 0.76
    case 'cocktail-table':
      return 1.1
    case 'bar':
      return 1.1
    case 'chair':
    case 'chair-block':
      return 0.9
    case 'lounge':
      return 0.8
    case 'dj':
      return 1.1
    case 'screen':
      return 2.6
    case 'photobooth':
      return 2.3
    case 'plant':
      return 1.2
    case 'wall':
      return 2.7
    case 'door':
      return 2.1
    case 'pillar':
      return 3.5
    case 'dancefloor':
      return 0.03
    default:
      return 1
  }
}
