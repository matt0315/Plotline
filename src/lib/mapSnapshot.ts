import type { EventDoc } from '../types/event'
import { rectLatLngs } from './geometry'
import { tileSource, tileUrl } from './tiles'

const TILE = 256

const project = (lat: number, lng: number, z: number) => {
  const s = TILE * 2 ** z
  const r = (lat * Math.PI) / 180
  return { x: ((lng + 180) / 360) * s, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s }
}

const loadTile = (url: string) =>
  new Promise<HTMLImageElement | null>((res) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => res(img)
    img.onerror = () => res(null)
    img.src = url
  })

/**
 * Draws the site map — imagery, zones and assets — onto a canvas for print.
 * Framed to everything placed, or the venue if the map is empty.
 */
export const snapshotSite = async (d: EventDoc, maxW = 1800, maxH = 1200): Promise<{ png: string; w: number; h: number; attribution: string }> => {
  const src = tileSource()
  const pts: [number, number][] = [...d.site.zones.flatMap((z) => z.points), ...d.site.items.flatMap((i) => rectLatLngs(i.lat, i.lng, i.w, i.h, i.rotation))]
  if (!pts.length) pts.push([d.venue.lat, d.venue.lng])
  const lats = pts.map((p) => p[0])
  const lngs = pts.map((p) => p[1])
  let [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)]
  // Pad 12%, and give a single point some context.
  const padLat = Math.max((maxLat - minLat) * 0.12, 0.0006)
  const padLng = Math.max((maxLng - minLng) * 0.12, 0.0009)
  minLat -= padLat
  maxLat += padLat
  minLng -= padLng
  maxLng += padLng

  let z = Math.min(src.maxNativeZoom, 20)
  for (; z > 3; z--) {
    const a = project(maxLat, minLng, z)
    const b = project(minLat, maxLng, z)
    if (b.x - a.x <= maxW && b.y - a.y <= maxH) break
  }
  const tl = project(maxLat, minLng, z)
  const br = project(minLat, maxLng, z)
  const w = Math.round(br.x - tl.x)
  const h = Math.round(br.y - tl.y)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#1e293b'
  ctx.fillRect(0, 0, w, h)

  const tiles: Promise<void>[] = []
  for (let tx = Math.floor(tl.x / TILE); tx <= Math.floor(br.x / TILE); tx++)
    for (let ty = Math.floor(tl.y / TILE); ty <= Math.floor(br.y / TILE); ty++)
      tiles.push(
        loadTile(tileUrl(src, z, tx, ty)).then((img) => {
          if (img) ctx.drawImage(img, tx * TILE - tl.x, ty * TILE - tl.y, TILE, TILE)
        }),
      )
  await Promise.all(tiles)

  const toPx = (lat: number, lng: number) => {
    const p = project(lat, lng, z)
    return [p.x - tl.x, p.y - tl.y] as const
  }
  const path = (ll: [number, number][]) => {
    ctx.beginPath()
    ll.forEach(([la, ln], i) => {
      const [x, y] = toPx(la, ln)
      if (i) ctx.lineTo(x, y)
      else ctx.moveTo(x, y)
    })
    ctx.closePath()
  }
  const label = (text: string, x: number, y: number) => {
    ctx.font = '600 13px Helvetica, Arial, sans-serif'
    const tw = ctx.measureText(text).width
    ctx.fillStyle = 'rgba(15,23,42,.82)'
    ctx.fillRect(x - tw / 2 - 5, y - 9, tw + 10, 18)
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x, y)
  }

  for (const zn of d.site.zones) {
    path(zn.points)
    ctx.fillStyle = zn.color + '26'
    ctx.fill()
    ctx.setLineDash([10, 7])
    ctx.lineWidth = 3
    ctx.strokeStyle = zn.color
    ctx.stroke()
    ctx.setLineDash([])
  }
  for (const it of d.site.items) {
    path(rectLatLngs(it.lat, it.lng, it.w, it.h, it.rotation))
    ctx.fillStyle = it.color
    ctx.globalAlpha = 0.8
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.lineWidth = 1.5
    ctx.strokeStyle = '#fff'
    ctx.stroke()
  }
  for (const it of d.site.items) {
    const [x, y] = toPx(it.lat, it.lng)
    label(it.label, x, y)
  }
  for (const zn of d.site.zones) {
    const la = zn.points.reduce((s, p) => s + p[0], 0) / zn.points.length
    const ln = zn.points.reduce((s, p) => s + p[1], 0) / zn.points.length
    const [x, y] = toPx(la, ln)
    if (!d.site.items.length) label(zn.name, x, y)
  }

  let png: string
  try {
    png = c.toDataURL('image/jpeg', 0.85)
  } catch {
    // Tiles without CORS taint the canvas; fall back to overlays only.
    const clean = document.createElement('canvas')
    clean.width = w
    clean.height = h
    png = clean.toDataURL('image/png')
  }
  return { png, w, h, attribution: src.attribution }
}
