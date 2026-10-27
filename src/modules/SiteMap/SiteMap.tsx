import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MousePointer2, Pentagon, Ruler, Plus, X, Crosshair, Trash2, RotateCw, Copy, FileDown, Search, Spline, Route, ImagePlus, ListTree, Fence } from 'lucide-react'
import type { SiteItem, SiteLine, SiteLineKind, Zone } from '../../types/event'
import { useEvent, update, doc as getDoc } from '../../store/event'
import { SITE_ASSETS, SITE_GROUPS, ZONE_COLORS, type SiteAssetDef } from '../../data/siteAssets'
import { areaM2, fmtArea, fmtM, fmtFt, pathLengthM, rectLatLngs } from '../../lib/geometry'
import { tileSource } from '../../lib/tiles'
import { uid } from '../../lib/id'
import { VenueSearch } from '../../components/VenueSearch'
import { Button, IconButton, NumberCell, toast } from '../../components/ui'
import { LINE_KINDS, linePath, lineSummary, siteLegend } from '../../lib/siteLines'
import { parseGpx } from '../../lib/gpx'
import { usePlan } from '../../store/plans'
import { addAerial, overlayBounds } from './aerial'

type Tool = 'select' | 'zone' | 'measure' | 'line'
type Shape = L.Polyline | L.Polygon
type Sel = { kind: 'item' | 'zone' | 'line' | 'overlay'; id: string } | null

const LABEL_ZOOM = 18

const makeAsset = (a: SiteAssetDef, lat: number, lng: number): SiteItem => ({ id: uid('x'), kind: a.kind, lat, lng, w: a.w, h: a.h, rotation: 0, label: a.name, color: a.color })

export default function SiteMap() {
  const d = useEvent((s) => s.doc)!
  const readOnly = useEvent((s) => s.readOnly)
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layers = useRef(new Map<string, Shape>())
  const aerialLayer = useRef<L.ImageOverlay | null>(null)
  const [lineKind, setLineKind] = useState<SiteLineKind>('fence')
  const [legend, setLegend] = useState(false)
  const gpxInput = useRef<HTMLInputElement>(null)
  const aerialInput = useRef<HTMLInputElement>(null)
  const draftLayer = useRef<L.Polyline | null>(null)
  const measureLayer = useRef<L.Polyline | null>(null)
  const [tool, setTool] = useState<Tool>('select')
  const toolRef = useRef<Tool>('select')
  const [sel, setSel] = useState<Sel>(null)
  const [draft, setDraft] = useState<[number, number][]>([])
  const [measure, setMeasure] = useState<[number, number][]>([])
  const [zoom, setZoom] = useState(d.venue.zoom || 17)
  const [panel, setPanel] = useState<'library' | null>(() => (window.innerWidth >= 1024 ? 'library' : null))
  const [findOpen, setFindOpen] = useState(false)
  const src = tileSource()

  useEffect(() => {
    toolRef.current = tool
    map.current?.doubleClickZoom[tool === 'select' ? 'enable' : 'disable']()
    if (box.current) box.current.style.cursor = tool === 'select' ? '' : 'crosshair'
  }, [tool])

  /* ---------- Create the map once ---------- */
  useEffect(() => {
    const m = L.map(box.current!, { zoomControl: false, maxZoom: 22, attributionControl: true }).setView([d.venue.lat, d.venue.lng], d.venue.zoom || 17)
    // Your own aerial photo sits above the satellite tiles and below everything drawn.
    m.createPane('aerial').style.zIndex = '350'
    L.tileLayer(src.url, { attribution: src.attribution, maxNativeZoom: src.maxNativeZoom, maxZoom: 22, crossOrigin: true }).addTo(m)
    L.control.zoom({ position: 'bottomright' }).addTo(m)
    L.control.scale({ position: 'bottomleft', imperial: true }).addTo(m)
    m.on('zoomend', () => setZoom(m.getZoom()))
    m.on('click', (e: L.LeafletMouseEvent) => {
      const pt: [number, number] = [e.latlng.lat, e.latlng.lng]
      if (toolRef.current === 'zone' || toolRef.current === 'line') setDraft((x) => [...x, pt])
      else if (toolRef.current === 'measure') setMeasure((x) => [...x, pt])
      else setSel(null)
    })
    m.on('dblclick', () => {
      if (toolRef.current === 'zone' || toolRef.current === 'line') window.dispatchEvent(new Event('finish-zone'))
    })
    // Frame everything already placed, so a generated site opens fully in view.
    const pts = [...d.site.zones.flatMap((z) => z.points), ...d.site.items.map((i) => [i.lat, i.lng] as [number, number]), ...d.site.lines.flatMap((l) => l.points)]
    if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 19 })
    map.current = m
    return () => {
      m.remove()
      map.current = null
      layers.current.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Follow the venue when the user moves it (not on first mount — that's framed above).
  const venueKey = `${d.venue.lat},${d.venue.lng}`
  const lastVenue = useRef(venueKey)
  useEffect(() => {
    if (lastVenue.current === venueKey) return
    lastVenue.current = venueKey
    map.current?.setView([d.venue.lat, d.venue.lng], Math.max(map.current.getZoom(), 17))
  }, [venueKey, d.venue.lat, d.venue.lng])

  /* ---------- Sync items and zones to Leaflet layers ---------- */
  useEffect(() => {
    const m = map.current
    if (!m) return
    const seen = new Set<string>()
    const showLabels = zoom >= LABEL_ZOOM

    const upsert = (id: string, latlngs: [number, number][], style: L.PathOptions, label: string, onDown: (e: L.LeafletMouseEvent) => void, line = false) => {
      seen.add(id)
      let poly: Shape | undefined = layers.current.get(id)
      if (poly && (poly instanceof L.Polygon) === line) (poly.remove(), layers.current.delete(id), (poly = undefined))
      if (!poly) {
        poly = line ? L.polyline(latlngs, style).addTo(m) : L.polygon(latlngs, style).addTo(m)
        poly.on('mousedown', onDown)
        poly.bindTooltip(label, { permanent: true, direction: 'center', className: 'site-label' })
        layers.current.set(id, poly)
      } else {
        poly.setLatLngs(latlngs)
        poly.setStyle(style)
        poly.setTooltipContent(label)
      }
      const tt = poly.getTooltip()
      if (tt) (showLabels ? poly.openTooltip() : poly.closeTooltip())
    }

    for (const z of d.site.zones) {
      const selected = sel?.kind === 'zone' && sel.id === z.id
      upsert(
        z.id,
        z.points,
        { color: z.color, weight: selected ? 4 : 2, dashArray: '8 6', fillColor: z.color, fillOpacity: 0.12 },
        `${z.name} · ${Math.round(areaM2(z.points)).toLocaleString()} m²`,
        (e) => {
          if (toolRef.current !== 'select') return
          L.DomEvent.stopPropagation(e)
          setSel({ kind: 'zone', id: z.id })
        },
      )
    }
    for (const it of d.site.items) {
      const selected = sel?.kind === 'item' && sel.id === it.id
      upsert(
        it.id,
        rectLatLngs(it.lat, it.lng, it.w, it.h, it.rotation),
        { color: selected ? '#4f46e5' : '#fff', weight: selected ? 3 : 1, fillColor: it.color, fillOpacity: 0.7 },
        it.label,
        (e) => startDrag(e, it.id),
      )
    }
    for (const l of d.site.lines) {
      const selected = sel?.kind === 'line' && sel.id === l.id
      const k = LINE_KINDS[l.kind]
      upsert(
        l.id,
        linePath(l),
        { color: l.color, weight: selected ? k.weight + 3 : k.weight, dashArray: k.dash || undefined, lineCap: l.kind === 'cable' ? 'round' : 'butt', opacity: 0.95 },
        `${l.label} · ${lineSummary(l)}`,
        (e) => {
          if (toolRef.current !== 'select') return
          L.DomEvent.stopPropagation(e)
          setSel({ kind: 'line', id: l.id })
        },
        true,
      )
    }
    for (const [id, layer] of layers.current) if (!seen.has(id)) (layer.remove(), layers.current.delete(id))
    // Items above zones.
    for (const it of d.site.items) layers.current.get(it.id)?.bringToFront()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.site.items, d.site.zones, d.site.lines, sel, zoom])

  /* ---------- Your own aerial photo ---------- */
  const ov = d.site.overlay
  const aerial = usePlan(ov?.planId)
  useEffect(() => {
    const m = map.current
    if (!m) return
    if (!ov || !aerial?.image) {
      aerialLayer.current?.remove()
      aerialLayer.current = null
      return
    }
    const b = overlayBounds(ov, aerial)
    if (!aerialLayer.current) {
      aerialLayer.current = L.imageOverlay(aerial.image, b, { pane: 'aerial', opacity: ov.opacity, interactive: true }).addTo(m)
      aerialLayer.current.on('mousedown', (e: L.LeafletMouseEvent) => startOverlayDrag(e))
    } else {
      aerialLayer.current.setUrl(aerial.image)
      aerialLayer.current.setBounds(L.latLngBounds(b))
      aerialLayer.current.setOpacity(ov.opacity)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ov?.planId, ov?.lat, ov?.lng, ov?.widthM, ov?.opacity, aerial?.image])

  /** Drag the photo only while it's selected, so a stray click doesn't move it. */
  const startOverlayDrag = (e: L.LeafletMouseEvent) => {
    if (toolRef.current !== 'select' || useEvent.getState().readOnly) return
    const cur = getDoc().site.overlay
    if (!cur) return
    L.DomEvent.stopPropagation(e)
    setSel((s) => (s?.kind === 'overlay' ? s : { kind: 'overlay', id: cur.planId }))
    const m = map.current!
    const start = e.latlng
    const orig = { lat: cur.lat, lng: cur.lng }
    const key = `aerial-drag-${Date.now()}`
    m.dragging.disable()
    const move = (ev: L.LeafletMouseEvent) =>
      update((dd) => {
        if (dd.site.overlay) (dd.site.overlay.lat = orig.lat + ev.latlng.lat - start.lat), (dd.site.overlay.lng = orig.lng + ev.latlng.lng - start.lng)
      }, key)
    const up = () => {
      m.off('mousemove', move)
      m.off('mouseup', up)
      m.dragging.enable()
    }
    m.on('mousemove', move)
    m.on('mouseup', up)
  }

  const startDrag = (e: L.LeafletMouseEvent, id: string) => {
    if (toolRef.current !== 'select') return
    L.DomEvent.stopPropagation(e)
    setSel({ kind: 'item', id })
    if (useEvent.getState().readOnly) return
    const m = map.current!
    const it = getDoc().site.items.find((x) => x.id === id)
    if (!it) return
    const start = e.latlng
    const orig = { lat: it.lat, lng: it.lng }
    const key = `site-drag-${Date.now()}`
    m.dragging.disable()
    const move = (ev: L.LeafletMouseEvent) =>
      update((dd) => {
        const x = dd.site.items.find((y) => y.id === id)
        if (x) (x.lat = orig.lat + ev.latlng.lat - start.lat), (x.lng = orig.lng + ev.latlng.lng - start.lng)
      }, key)
    const up = () => {
      m.off('mousemove', move)
      m.off('mouseup', up)
      m.dragging.enable()
    }
    m.on('mousemove', move)
    m.on('mouseup', up)
  }

  /* ---------- Drafts: zone being drawn, measurement ---------- */
  useEffect(() => {
    const m = map.current
    if (!m) return
    draftLayer.current?.remove()
    const k = LINE_KINDS[lineKind]
    draftLayer.current = draft.length ? L.polyline(draft, toolRef.current === 'line' ? { color: k.color, weight: k.weight, dashArray: k.dash || undefined } : { color: '#facc15', weight: 3, dashArray: '6 6' }).addTo(m) : null
  }, [draft, lineKind])

  useEffect(() => {
    const m = map.current
    if (!m) return
    measureLayer.current?.remove()
    measureLayer.current = null
    if (measure.length) {
      measureLayer.current = L.polyline(measure, { color: '#22d3ee', weight: 3 }).addTo(m)
      if (measure.length > 1) {
        const len = pathLengthM(measure)
        measureLayer.current.bindTooltip(`${fmtM(len)} · ${fmtFt(len)}`, { permanent: true, className: 'site-label' }).openTooltip(L.latLng(measure[measure.length - 1]))
      }
    }
  }, [measure])

  const finishZone = () => {
    if (tool === 'line') {
      if (draft.length >= 2) {
        const k = LINE_KINDS[lineKind]
        const l: SiteLine = { id: uid('l'), kind: lineKind, points: draft, label: k.label, color: k.color, ...(k.panel ? { panel: k.panel } : {}) }
        update((dd) => void dd.site.lines.push(l))
        setSel({ kind: 'line', id: l.id })
      }
      setDraft([])
      setTool('select')
      return
    }
    if (draft.length >= 3) {
      const z: Zone = { id: uid('z'), name: `Zone ${d.site.zones.length + 1}`, color: ZONE_COLORS[d.site.zones.length % ZONE_COLORS.length], points: draft }
      update((dd) => void dd.site.zones.push(z))
      setSel({ kind: 'zone', id: z.id })
    }
    setDraft([])
    setTool('select')
  }
  useEffect(() => {
    const f = () => finishZone()
    window.addEventListener('finish-zone', f)
    return () => window.removeEventListener('finish-zone', f)
  })

  const addAsset = (a: SiteAssetDef, at?: L.LatLng) => {
    const c = at ?? map.current!.getCenter()
    const it = makeAsset(a, c.lat, c.lng)
    update((dd) => void dd.site.items.push(it))
    setSel({ kind: 'item', id: it.id })
    if (window.innerWidth < 1024) setPanel(null)
  }

  const item = sel?.kind === 'item' ? d.site.items.find((x) => x.id === sel.id) : undefined
  const zone = sel?.kind === 'zone' ? d.site.zones.find((x) => x.id === sel.id) : undefined
  const line = sel?.kind === 'line' ? d.site.lines.find((x) => x.id === sel.id) : undefined
  const overlaySel = sel?.kind === 'overlay' && ov ? ov : undefined
  const editLine = (fn: (x: SiteLine) => void, key: string) =>
    update((dd) => {
      const x = dd.site.lines.find((y) => y.id === line?.id)
      if (x) fn(x)
    }, `line-${key}-${line?.id}`)

  /** Routes from a GPX file (a fun run, a parade, a bike course); its waypoints become markers. */
  const importGpx = async (f: File) => {
    const g = parseGpx(await f.text())
    if (!g.tracks.length && !g.points.length) return toast('No route found in that file')
    const custom = SITE_ASSETS.find((a) => a.key === 'custom')!
    update((dd) => {
      for (const t of g.tracks) dd.site.lines.push({ id: uid('l'), kind: 'route', points: t.points, label: t.name || 'Route', color: LINE_KINDS.route.color })
      for (const w of g.points) dd.site.items.push({ ...makeAsset(custom, w.lat, w.lng), w: 3, h: 3, label: w.name || 'Marker' })
    })
    const all = [...g.tracks.flatMap((t) => t.points), ...g.points.map((w) => [w.lat, w.lng] as [number, number])]
    map.current?.fitBounds(L.latLngBounds(all), { padding: [60, 60] })
    toast(`Added ${g.tracks.length} route${g.tracks.length === 1 ? '' : 's'}${g.points.length ? ` and ${g.points.length} markers` : ''}`)
  }

  const legendRows = siteLegend(d)
  const editItem = (fn: (x: SiteItem) => void, key: string) =>
    update((dd) => {
      const x = dd.site.items.find((y) => y.id === item?.id)
      if (x) fn(x)
    }, `site-${key}-${item?.id}`)

  const totalArea = d.site.zones.reduce((s, z) => s + areaM2(z.points), 0)

  return (
    <div className="absolute inset-0 flex">
      {panel === 'library' && !readOnly && (
        <aside className="absolute inset-x-0 bottom-0 z-[500] h-[55%] overflow-y-auto rounded-t-2xl border-t border-slate-200 bg-white shadow-2xl lg:static lg:h-auto lg:w-56 lg:rounded-none lg:border-t-0 lg:border-r lg:shadow-none">
          <div className="flex items-center justify-between px-3 pt-3">
            <span className="text-xs text-slate-500">Drag onto the map · real size</span>
            <IconButton className="lg:hidden" onClick={() => setPanel(null)}>
              <X size={16} />
            </IconButton>
          </div>
          {SITE_GROUPS.map((g) => (
            <div key={g} className="px-2 pt-3">
              <div className="px-1 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">{g}</div>
              {SITE_ASSETS.filter((a) => a.group === g).map((a) => (
                <button
                  key={a.key}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/site', a.key)}
                  onClick={() => addAsset(a)}
                  className="flex w-full cursor-grab items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                >
                  <span className="h-3.5 w-3.5 shrink-0 rounded-sm border border-slate-300" style={{ background: a.color }} />
                  <span className="flex-1 truncate">{a.name}</span>
                </button>
              ))}
            </div>
          ))}
        </aside>
      )}

      <div className="relative min-w-0 flex-1">
        <div
          ref={box}
          className="absolute inset-0"
          onDragOver={(e) => e.dataTransfer.types.includes('text/site') && e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const a = SITE_ASSETS.find((x) => x.key === e.dataTransfer.getData('text/site'))
            if (a && map.current) addAsset(a, map.current.mouseEventToLatLng(e.nativeEvent))
          }}
        />

        {/* Toolbar */}
        <div className="absolute top-3 left-3 z-[400] flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white/95 p-1 shadow-sm">
          {!readOnly && (
            <Button size="sm" variant={panel ? 'secondary' : 'primary'} onClick={() => setPanel(panel ? null : 'library')}>
              <Plus size={14} /> Add
            </Button>
          )}
          <div className="mx-0.5 h-5 w-px bg-slate-200" />
          <IconButton title="Select & move" active={tool === 'select'} onClick={() => (setTool('select'), setDraft([]))}>
            <MousePointer2 size={16} />
          </IconButton>
          {!readOnly && (
            <IconButton title="Draw a zone" active={tool === 'zone'} onClick={() => (setTool('zone'), setSel(null))}>
              <Pentagon size={16} />
            </IconButton>
          )}
          {!readOnly && (
            <IconButton title="Draw fencing, barriers, a route or a cable run" active={tool === 'line'} onClick={() => (setTool('line'), setDraft([]), setSel(null))}>
              <Spline size={16} />
            </IconButton>
          )}
          <IconButton title="Measure distance" active={tool === 'measure'} onClick={() => (setTool('measure'), setMeasure([]))}>
            <Ruler size={16} />
          </IconButton>
          {!readOnly && (
            <>
              <div className="mx-0.5 h-5 w-px bg-slate-200" />
              <IconButton title="Import a route (GPX)" onClick={() => gpxInput.current?.click()}>
                <Route size={16} />
              </IconButton>
              <IconButton
                title={ov ? 'Your aerial photo' : 'Add your own aerial or drone photo'}
                active={sel?.kind === 'overlay'}
                onClick={() => (ov ? setSel(sel?.kind === 'overlay' ? null : { kind: 'overlay', id: ov.planId }) : aerialInput.current?.click())}
              >
                <ImagePlus size={16} />
              </IconButton>
            </>
          )}
          <IconButton title="Legend" active={legend} onClick={() => setLegend(!legend)}>
            <ListTree size={16} />
          </IconButton>
          <div className="mx-0.5 h-5 w-px bg-slate-200" />
          <IconButton title="Back to venue" onClick={() => map.current?.setView([d.venue.lat, d.venue.lng], 18)}>
            <Crosshair size={16} />
          </IconButton>
          {!readOnly && (
            <IconButton title="Move venue" active={findOpen} onClick={() => setFindOpen(!findOpen)}>
              <Search size={16} />
            </IconButton>
          )}
          <IconButton title="Site map PDF" onClick={async () => (await import('../../lib/pdf')).exportPack(getDoc(), ['site'])}>
            <FileDown size={16} />
          </IconButton>
        </div>

        <input
          ref={gpxInput}
          type="file"
          accept=".gpx,application/gpx+xml"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) importGpx(f)
          }}
        />
        <input
          ref={aerialInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f || !map.current) return
            toast('Adding your photo…')
            try {
              const o = await addAerial(f, map.current, d.venue.name)
              update((dd) => void (dd.site.overlay = o))
              setSel({ kind: 'overlay', id: o.planId })
            } catch (err) {
              toast(err instanceof Error ? err.message : 'Could not add that photo')
            }
          }}
        />

        {findOpen && (
          <div className="absolute top-16 left-3 z-[450] w-80 max-w-[calc(100%-24px)]">
            <VenueSearch
              autoFocus
              value=""
              onPick={(p) => {
                update((dd) => void (dd.venue = { name: p.name, address: p.address, lat: p.lat, lng: p.lng, zoom: 18 }))
                setFindOpen(false)
              }}
            />
          </div>
        )}

        {src.notice && <div className="absolute top-3 right-3 z-[400] max-w-xs rounded-lg bg-amber-50/95 px-3 py-1.5 text-[11px] text-amber-900 shadow-sm max-md:hidden">{src.notice}</div>}

        {/* Hints */}
        {tool === 'line' && (
          <div className="absolute bottom-16 left-1/2 z-[400] flex max-w-[calc(100%-24px)] -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-2xl bg-slate-900 p-1.5 text-xs text-white shadow-lg md:bottom-6">
            {(Object.keys(LINE_KINDS) as SiteLineKind[]).map((k) => (
              <button key={k} onClick={() => setLineKind(k)} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${lineKind === k ? 'bg-white text-slate-900' : 'bg-white/10'}`}>
                <span className="h-1 w-4 rounded-full" style={{ background: LINE_KINDS[k].color }} />
                {LINE_KINDS[k].label}
              </button>
            ))}
            <span className="px-2 text-white/80">{draft.length < 2 ? 'Tap along the line' : `${lineSummary({ id: '', kind: lineKind, points: draft, label: '', color: '', panel: LINE_KINDS[lineKind].panel })}`}</span>
            {draft.length >= 2 && (
              <button onClick={finishZone} className="rounded-full bg-brand-500 px-2.5 py-1 font-medium">
                Finish
              </button>
            )}
            <button
              onClick={() => {
                setTool('select')
                setDraft([])
              }}
              className="rounded-full bg-white/15 px-2.5 py-1"
            >
              Cancel
            </button>
          </div>
        )}

        {(tool === 'zone' || tool === 'measure') && (
          <div className="absolute bottom-16 left-1/2 z-[400] flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900 py-1.5 pr-1.5 pl-4 text-xs whitespace-nowrap text-white shadow-lg md:bottom-6">
            {tool === 'zone'
              ? draft.length < 3
                ? `Tap the corners of the zone (${draft.length}/3+)`
                : `${fmtArea(areaM2(draft))} — double-click or Finish`
              : measure.length > 1
                ? `${fmtM(pathLengthM(measure))} · ${fmtFt(pathLengthM(measure))}`
                : 'Tap points to measure'}
            {tool === 'zone' && draft.length >= 3 && (
              <button onClick={finishZone} className="rounded-full bg-brand-500 px-2.5 py-1 font-medium">
                Finish
              </button>
            )}
            <button
              onClick={() => {
                setTool('select')
                setDraft([])
                setMeasure([])
              }}
              className="rounded-full bg-white/15 px-2.5 py-1"
            >
              {tool === 'measure' ? 'Done' : 'Cancel'}
            </button>
          </div>
        )}

        {/* Inspector */}
        {(item || zone || line || overlaySel) && (
          <div className="absolute right-3 bottom-16 z-[450] w-72 max-w-[calc(100%-24px)] rounded-xl border border-slate-200 bg-white p-3 shadow-xl md:top-3 md:bottom-auto">
            <div className="mb-2 flex items-center gap-1">
              <input
                className="cell flex-1 font-semibold"
                disabled={readOnly}
                value={item?.label ?? zone?.name ?? line?.label ?? (overlaySel ? 'Your aerial photo' : '')}
                onChange={(e) =>
                  overlaySel
                    ? undefined
                    : line
                    ? editLine((x) => void (x.label = e.target.value), 'label')
                    : item
                    ? editItem((x) => void (x.label = e.target.value), 'label')
                    : update((dd) => {
                        const z = dd.site.zones.find((y) => y.id === zone!.id)
                        if (z) z.name = e.target.value
                      }, `zone-name-${zone!.id}`)
                }
              />
              <IconButton onClick={() => setSel(null)}>
                <X size={16} />
              </IconButton>
            </div>
            {item && (
              <div className={`space-y-2 ${readOnly ? 'pointer-events-none' : ''}`}>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                  <label>
                    Width (m)
                    <div className="input mt-1 p-0">
                      <NumberCell value={item.w} format={(n) => n.toFixed(1)} onChange={(n) => editItem((x) => void (x.w = Math.max(0.5, n)), 'w')} />
                    </div>
                  </label>
                  <label>
                    Depth (m)
                    <div className="input mt-1 p-0">
                      <NumberCell value={item.h} format={(n) => n.toFixed(1)} onChange={(n) => editItem((x) => void (x.h = Math.max(0.5, n)), 'h')} />
                    </div>
                  </label>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  Rotate
                  <input type="range" min={0} max={359} value={item.rotation} className="flex-1 accent-brand-600" onChange={(e) => editItem((x) => void (x.rotation = parseInt(e.target.value)), 'rot')} />
                  <span className="w-8 text-right tabular-nums">{item.rotation}°</span>
                </label>
                <p className="text-xs text-slate-500">{fmtArea(item.w * item.h)}</p>
                <div className="flex gap-1">
                  <Button size="sm" onClick={() => editItem((x) => void (x.rotation = (x.rotation + 90) % 360), 'rot90')}>
                    <RotateCw size={14} /> 90°
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      const copy = { ...item, id: uid('x'), lng: item.lng + 0.00008 }
                      update((dd) => void dd.site.items.push(copy))
                      setSel({ kind: 'item', id: copy.id })
                    }}
                  >
                    <Copy size={14} />
                  </Button>
                  <div className="flex-1" />
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      update((dd) => void (dd.site.items = dd.site.items.filter((x) => x.id !== item.id)))
                      setSel(null)
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            )}
            {line && (
              <div className={`space-y-2 ${readOnly ? 'pointer-events-none' : ''}`}>
                <select
                  className="input text-sm"
                  value={line.kind}
                  onChange={(e) =>
                    editLine((x) => {
                      const k = e.target.value as SiteLineKind
                      if (x.label === LINE_KINDS[x.kind].label) x.label = LINE_KINDS[k].label
                      x.kind = k
                      x.color = LINE_KINDS[k].color
                      if (LINE_KINDS[k].panel) x.panel = LINE_KINDS[k].panel
                      else delete x.panel
                    }, 'kind')
                  }
                >
                  {(Object.keys(LINE_KINDS) as SiteLineKind[]).map((k) => (
                    <option key={k} value={k}>
                      {LINE_KINDS[k].label}
                    </option>
                  ))}
                </select>
                <p className="text-sm font-medium">{lineSummary(line)}</p>
                {LINE_KINDS[line.kind].panel && (
                  <label className="flex items-center gap-2 text-xs text-slate-500">
                    {line.kind === 'fence' ? 'Panel' : 'Barrier'} length (m)
                    <div className="input w-20 p-0">
                      <NumberCell value={line.panel ?? LINE_KINDS[line.kind].panel!} format={(n) => n.toFixed(2)} onChange={(n) => editLine((x) => void (x.panel = Math.max(0.5, n)), 'panel')} />
                    </div>
                  </label>
                )}
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  <input type="checkbox" className="accent-brand-600" checked={!!line.closed} onChange={(e) => editLine((x) => void (x.closed = e.target.checked || undefined), 'closed')} />
                  Join back to the start (a closed loop)
                </label>
                <p className="text-xs text-slate-500">{line.kind === 'fence' || line.kind === 'barrier' ? 'Counted on the load list.' : line.kind === 'cable' ? 'Cable metres (plus 10%) go on the load list.' : 'Handy for courses, parades and access roads.'}</p>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      update((dd) => void (dd.site.lines = dd.site.lines.filter((x) => x.id !== line.id)))
                      setSel(null)
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            )}
            {overlaySel && (
              <div className={`space-y-2 ${readOnly ? 'pointer-events-none' : ''}`}>
                <p className="text-xs text-slate-500">Drag the photo to line it up with the satellite view, then set its width on the ground.</p>
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  Width (m)
                  <div className="input w-24 p-0">
                    <NumberCell value={overlaySel.widthM} format={(n) => n.toFixed(0)} onChange={(n) => update((dd) => void (dd.site.overlay!.widthM = Math.max(5, n)), 'aerial-w')} />
                  </div>
                  <span className="flex gap-0.5">
                    <IconButton title="Smaller" onClick={() => update((dd) => void (dd.site.overlay!.widthM *= 0.98), 'aerial-w')}>
                      −
                    </IconButton>
                    <IconButton title="Bigger" onClick={() => update((dd) => void (dd.site.overlay!.widthM *= 1.02), 'aerial-w')}>
                      +
                    </IconButton>
                  </span>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  Show
                  <input type="range" min={0.2} max={1} step={0.05} value={overlaySel.opacity} className="flex-1 accent-brand-600" onChange={(e) => update((dd) => void (dd.site.overlay!.opacity = parseFloat(e.target.value)), 'aerial-o')} />
                  <span className="w-8 text-right tabular-nums">{Math.round(overlaySel.opacity * 100)}%</span>
                </label>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    onClick={() => {
                      const c = map.current!.getCenter()
                      update((dd) => void Object.assign(dd.site.overlay!, { lat: c.lat, lng: c.lng }))
                    }}
                  >
                    <Crosshair size={14} /> Centre here
                  </Button>
                  <div className="flex-1" />
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      update((dd) => void delete dd.site.overlay)
                      setSel(null)
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            )}
            {zone && (
              <div className={`space-y-2 ${readOnly ? 'pointer-events-none' : ''}`}>
                <p className="text-sm">{fmtArea(areaM2(zone.points))}</p>
                <p className="text-xs text-slate-500">Perimeter {fmtM(pathLengthM([...zone.points, zone.points[0]]))}</p>
                <Button
                  size="sm"
                  onClick={() => {
                    const l: SiteLine = { id: uid('l'), kind: 'fence', points: zone.points, closed: true, label: `${zone.name} fence`, color: LINE_KINDS.fence.color, panel: LINE_KINDS.fence.panel }
                    update((dd) => void dd.site.lines.push(l))
                    setSel({ kind: 'line', id: l.id })
                  }}
                >
                  <Fence size={14} /> Fence this zone
                </Button>
                <div className="flex gap-1">
                  {ZONE_COLORS.map((c) => (
                    <button
                      key={c}
                      className={`h-5 w-5 rounded-full ${zone.color === c ? 'ring-2 ring-offset-1' : ''}`}
                      style={{ background: c }}
                      onClick={() =>
                        update((dd) => {
                          const z = dd.site.zones.find((y) => y.id === zone.id)
                          if (z) z.color = c
                        })
                      }
                    />
                  ))}
                  <div className="flex-1" />
                  <IconButton
                    onClick={() => {
                      update((dd) => void (dd.site.zones = dd.site.zones.filter((x) => x.id !== zone.id)))
                      setSel(null)
                    }}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </div>
            )}
          </div>
        )}

        {legend && (
          <div className="absolute top-16 left-3 z-[420] max-h-[60%] w-72 max-w-[calc(100%-24px)] overflow-y-auto rounded-xl border border-slate-200 bg-white/95 p-3 text-xs shadow-lg">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-semibold">Legend</span>
              <IconButton onClick={() => setLegend(false)}>
                <X size={14} />
              </IconButton>
            </div>
            {legendRows.length ? (
              <ul className="space-y-1">
                {legendRows.map((r) => (
                  <li key={r.key} className="flex items-center gap-2">
                    <LegendSwatch {...r.swatch} />
                    <span className="min-w-0 flex-1 truncate">{r.label}</span>
                    <span className="shrink-0 text-slate-500 tabular-nums">{r.detail}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-500">Nothing on the map yet.</p>
            )}
          </div>
        )}

        {d.site.zones.length > 0 && !item && !zone && !line && !overlaySel && (
          <div className="absolute bottom-20 left-3 z-[400] rounded-lg bg-white/95 px-3 py-1.5 text-xs text-slate-600 shadow-sm md:bottom-6 md:left-auto md:right-14">
            {d.site.items.length} assets · zones {fmtArea(totalArea)}
          </div>
        )}
      </div>
    </div>
  )
}

/** A small key: a filled box for assets, a dashed box for zones, a stroke for lines. */
export const LegendSwatch = ({ color, shape, dash }: { color: string; shape: 'box' | 'zone' | 'line'; dash?: string }) =>
  shape === 'line' ? (
    <svg width="22" height="10" className="shrink-0">
      <line x1="1" y1="5" x2="21" y2="5" stroke={color} strokeWidth="3" strokeDasharray={dash || undefined} />
    </svg>
  ) : (
    <span className="h-3 w-3.5 shrink-0 rounded-sm" style={shape === 'zone' ? { border: `2px dashed ${color}`, background: color + '22' } : { background: color }} />
  )
