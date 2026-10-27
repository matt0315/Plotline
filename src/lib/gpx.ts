/** Routes and waypoints from a GPX file — fun runs, parades, bike courses, access roads. */
export interface GpxData {
  tracks: { name: string; points: [number, number][] }[]
  points: { name: string; lat: number; lng: number }[]
}

/** Long recordings have tens of thousands of points; a few hundred draw the same line on a site map. */
const thin = (pts: [number, number][], max = 800) => (pts.length <= max ? pts : pts.filter((_, i) => i % Math.ceil(pts.length / max) === 0 || i === pts.length - 1))

export const parseGpx = (xml: string): GpxData => {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const ll = (el: Element): [number, number] => [parseFloat(el.getAttribute('lat') ?? ''), parseFloat(el.getAttribute('lon') ?? '')]
  const ok = (p: [number, number]) => Number.isFinite(p[0]) && Number.isFinite(p[1])
  const name = (el: Element) => el.querySelector(':scope > name')?.textContent?.trim() ?? ''
  const tracks = [
    ...[...doc.getElementsByTagName('trk')].map((t) => ({ name: name(t), points: [...t.getElementsByTagName('trkpt')].map(ll).filter(ok) })),
    ...[...doc.getElementsByTagName('rte')].map((r) => ({ name: name(r), points: [...r.getElementsByTagName('rtept')].map(ll).filter(ok) })),
  ]
    .filter((t) => t.points.length > 1)
    .map((t) => ({ ...t, points: thin(t.points) }))
  const points = [...doc.getElementsByTagName('wpt')]
    .map((w) => {
      const [lat, lng] = ll(w)
      return { name: name(w), lat, lng }
    })
    .filter((w) => Number.isFinite(w.lat) && Number.isFinite(w.lng))
    .slice(0, 200)
  return { tracks, points }
}
