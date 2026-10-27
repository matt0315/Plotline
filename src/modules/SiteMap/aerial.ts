import type L from 'leaflet'
import type { SiteOverlay, VenuePlan } from '../../types/event'
import { offsetLatLng, distanceM } from '../../lib/geometry'
import { uid } from '../../lib/id'
import { savePlan } from '../../store/plans'

/** The photo's corners on the ground, from its centre and width. Photos are laid north-up. */
export const overlayBounds = (o: SiteOverlay, p: Pick<VenuePlan, 'natW' | 'natH'>): [[number, number], [number, number]] => {
  const h = (o.widthM * p.natH) / p.natW
  return [offsetLatLng(o.lat, o.lng, -o.widthM / 2, h / 2), offsetLatLng(o.lat, o.lng, o.widthM / 2, -h / 2)]
}

/** Shrink a big drone photo to something that saves and syncs quickly, as a PNG like venue drawings. */
const toPng = async (f: File) => {
  const img = await createImageBitmap(f)
  for (const max of [3000, 2200, 1600]) {
    const k = Math.min(1, max / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * k)
    c.height = Math.round(img.height * k)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    const url = c.toDataURL('image/png')
    // Stay well under the 25 MB upload limit (data URLs are a third bigger than the file).
    if (url.length < 24_000_000 || max === 1600) return { url, w: c.width, h: c.height }
  }
  throw new Error('That photo is too large')
}

/** Save the photo like a venue drawing and lay it over the middle of the current view. */
export const addAerial = async (f: File, map: L.Map, venueName: string): Promise<SiteOverlay> => {
  if (!f.type.startsWith('image/')) throw new Error('Choose a JPG or PNG photo')
  const { url, w, h } = await toPng(f)
  const plan: VenuePlan = {
    id: uid('p'),
    name: `Aerial photo — ${f.name}`,
    source: 'image',
    image: url,
    natW: w,
    natH: h,
    metersPerPx: 0,
    calibratedBy: 'guess',
    visibility: 'private',
    venueName,
    city: '',
    created: new Date().toISOString(),
  }
  await savePlan(plan)
  const c = map.getCenter()
  const b = map.getBounds()
  const viewW = distanceM([c.lat, b.getWest()], [c.lat, b.getEast()])
  return { planId: plan.id, lat: c.lat, lng: c.lng, widthM: Math.round(viewW * 0.7), opacity: 0.85 }
}
