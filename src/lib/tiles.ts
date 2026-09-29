import { MAPBOX_TOKEN } from './geocode'

export interface TileSource {
  url: string
  attribution: string
  maxNativeZoom: number
  /** Shown in the UI when we're not on licensed production imagery. */
  notice?: string
}

const ARCGIS_KEY = import.meta.env.VITE_ARCGIS_KEY as string | undefined
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY as string | undefined

/**
 * Satellite imagery, in order of preference — whichever key is set wins:
 *  1. ArcGIS Location Platform — 2M free tiles/month, commercial use allowed with an API key.
 *  2. MapTiler, 3. Mapbox — alternatives.
 * With no key, local development falls back to Esri's public endpoint (NOT licensed for
 * commercial use) and production falls back to an OpenStreetMap street map.
 */
export const tileSource = (): TileSource => {
  if (ARCGIS_KEY)
    return {
      url: `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${ARCGIS_KEY}`,
      attribution: 'Powered by Esri · Esri, Maxar, Earthstar Geographics',
      maxNativeZoom: 19,
    }
  if (MAPTILER_KEY)
    return {
      url: `https://api.maptiler.com/maps/satellite/256/{z}/{x}/{y}.jpg?key=${MAPTILER_KEY}`,
      attribution: '© MapTiler © OpenStreetMap contributors',
      maxNativeZoom: 20,
    }
  if (MAPBOX_TOKEN)
    return {
      url: `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${MAPBOX_TOKEN}`,
      attribution: '© Mapbox © OpenStreetMap © Maxar',
      maxNativeZoom: 21,
    }
  if (import.meta.env.DEV)
    return {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
      maxNativeZoom: 19,
      notice: 'Development imagery (unlicensed for commercial use). Set VITE_ARCGIS_KEY before launch.',
    }
  return {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
    maxNativeZoom: 19,
    notice: 'Satellite imagery is not configured — showing a street map.',
  }
}

/** Resolve a template for one tile, for canvas snapshots. */
export const tileUrl = (src: TileSource, z: number, x: number, y: number) => src.url.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
