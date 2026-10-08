import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { EventDoc, Guest, LayoutItem, VenuePlan } from '../../../types/event'
import { isSeating, seatsLocal, tentPoles, toWorld, type Pt } from '../../../lib/geometry'
import { itemHeight } from '../../../data/library'
import { seatKey } from '../../../lib/derived'

export type Canopy = 'solid' | 'ghost' | 'hidden'
export type Light = 'day' | 'golden' | 'night'

export interface BuildOptions {
  canopy: Canopy
  labels: boolean
  light: Light
}

export interface Built {
  group: THREE.Group
  /** Lights that only switch on at night (stage washes, uplights, festoons, tent glow). */
  nightLights: THREE.Light[]
  bounds: THREE.Box3
  dispose: () => void
}

const rad = (deg: number) => (deg * Math.PI) / 180

/** Plan (x right, y down, clockwise degrees) to three (x right, z toward you, y up). */
const at = (o: THREE.Object3D, p: Pt, y = 0, rotation = 0) => {
  o.position.set(p.x, y, p.y)
  o.rotation.y = -rad(rotation)
  return o
}

export const buildScene = (d: EventDoc, plan: VenuePlan | undefined, opts: BuildOptions): Built => {
  const group = new THREE.Group()
  const nightLights: THREE.Light[] = []
  const owned: { dispose: () => void }[] = []
  const mats = new Map<string, THREE.MeshStandardMaterial>()
  const mat = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) => {
    const key = `${color}|${JSON.stringify(extra)}`
    let m = mats.get(key)
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02, ...extra })
      mats.set(key, m)
      owned.push(m)
    }
    return m
  }
  const geo = <T extends THREE.BufferGeometry>(g: T) => (owned.push(g), g)
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], shadow = true) => {
    const x = new THREE.Mesh(g, m)
    x.castShadow = shadow
    x.receiveShadow = true
    return x
  }
  const box = (w: number, h: number, dpt: number, color: string, extra?: THREE.MeshStandardMaterialParameters) => mesh(geo(new THREE.BoxGeometry(w, h, dpt)), mat(color, extra))
  const cyl = (r: number, h: number, color: string, segs = 24, extra?: THREE.MeshStandardMaterialParameters) => mesh(geo(new THREE.CylinderGeometry(r, r, h, segs)), mat(color, extra))
  const cloth = '#fbfbf9'
  const night = opts.light === 'night'

  /* ---------- Ground, rooms, venue drawing ---------- */
  const ground = mesh(geo(new THREE.PlaneGeometry(600, 600)), mat('#dde4d6'), false)
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.01
  group.add(ground)

  if (plan && d.layout.basePlan) {
    const bp = d.layout.basePlan
    const tex = new THREE.TextureLoader().load(plan.image)
    tex.colorSpace = THREE.SRGBColorSpace
    owned.push(tex)
    const w = plan.natW * plan.metersPerPx
    const h = plan.natH * plan.metersPerPx
    const floor = mesh(geo(new THREE.PlaneGeometry(w, h)), new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: Math.max(0.35, bp.opacity), roughness: 1 }), false)
    owned.push(floor.material as THREE.Material)
    floor.rotation.x = -Math.PI / 2
    floor.position.set(bp.x + w / 2, 0.003, bp.y + h / 2)
    group.add(floor)
  }

  const wallAlpha = opts.canopy === 'solid' ? 1 : opts.canopy === 'ghost' ? 0.18 : 0
  for (const s of d.layout.spaces) {
    // House lights: rooms aren't dark at night even before the styling goes in.
    if (night) {
      const n = Math.max(1, Math.round((s.w * s.h) / 150))
      const cols = Math.ceil(Math.sqrt(n))
      const rows = Math.ceil(n / cols)
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const l = new THREE.PointLight('#ffd6a0', 18, Math.max(s.w / cols, s.h / rows) * 1.8, 1.2)
          l.position.set(s.x - s.w / 2 + (s.w * (c + 0.5)) / cols, 3.2, s.y - s.h / 2 + (s.h * (r + 0.5)) / rows)
          group.add(l)
          nightLights.push(l)
        }
    }
    const floor = mesh(geo(new THREE.PlaneGeometry(s.w, s.h)), mat('#eef0f3'), false)
    floor.rotation.x = -Math.PI / 2
    floor.position.set(s.x, 0.002, s.y)
    group.add(floor)
    if (wallAlpha > 0) {
      const t = 0.15
      const H = 2.7
      const wm = { transparent: wallAlpha < 1, opacity: wallAlpha, side: THREE.DoubleSide }
      for (const [w, dd, x, z] of [
        [s.w + t, t, s.x, s.y - s.h / 2],
        [s.w + t, t, s.x, s.y + s.h / 2],
        [t, s.h, s.x - s.w / 2, s.y],
        [t, s.h, s.x + s.w / 2, s.y],
      ]) {
        const wall = box(w, H, dd, '#e7e5e4', wm)
        wall.position.set(x, H / 2, z)
        if (wallAlpha < 1) wall.castShadow = false
        group.add(wall)
      }
    }
  }

  /* ---------- Chairs (instanced) ---------- */
  const seatGeo = geo(
    mergeGeometries([
      new THREE.BoxGeometry(0.44, 0.06, 0.42).translate(0, 0.45, 0),
      new THREE.BoxGeometry(0.44, 0.48, 0.05).translate(0, 0.72, 0.2),
      new THREE.BoxGeometry(0.04, 0.45, 0.04).translate(-0.19, 0.225, -0.18),
      new THREE.BoxGeometry(0.04, 0.45, 0.04).translate(0.19, 0.225, -0.18),
      new THREE.BoxGeometry(0.04, 0.45, 0.04).translate(-0.19, 0.225, 0.18),
      new THREE.BoxGeometry(0.04, 0.45, 0.04).translate(0.19, 0.225, 0.18),
    ])!,
  )
  const seats = new Map<string, Guest>()
  for (const g of d.guests) if (g.seat) seats.set(seatKey(g.seat.itemId, g.seat.index), g)
  const chairPlacements: { p: Pt; yaw: number; guest?: Guest }[] = []
  for (const it of d.layout.items) {
    if (!isSeating(it)) continue
    seatsLocal(it).forEach((l, i) => {
      // Which way the chair faces, in the table's own frame.
      let f: Pt
      if (it.kind === 'round-table') f = { x: -l.x, y: -l.y }
      else if (it.kind === 'banquet-table') {
        const long = it.w >= it.h
        f = long ? (Math.abs(l.y) > it.h / 2 ? { x: 0, y: -Math.sign(l.y) } : { x: -Math.sign(l.x), y: 0 }) : Math.abs(l.x) > it.w / 2 ? { x: -Math.sign(l.x), y: 0 } : { x: 0, y: -Math.sign(l.y) }
      } else f = { x: 0, y: -1 }
      const wf = { x: f.x * Math.cos(rad(it.rotation)) - f.y * Math.sin(rad(it.rotation)), y: f.x * Math.sin(rad(it.rotation)) + f.y * Math.cos(rad(it.rotation)) }
      // Chair front is local −z; turn it to face along wf (plan y is three z).
      chairPlacements.push({ p: toWorld(it, l), yaw: Math.atan2(-wf.x, -wf.y), guest: seats.get(seatKey(it.id, i)) })
    })
  }
  if (chairPlacements.length) {
    const chairs = new THREE.InstancedMesh(seatGeo, mat('#ffffff'), chairPlacements.length)
    chairs.castShadow = true
    chairs.receiveShadow = true
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const c = new THREE.Color()
    chairPlacements.forEach((ch, i) => {
      q.setFromAxisAngle(up, ch.yaw)
      m.compose(new THREE.Vector3(ch.p.x, 0, ch.p.y), q, new THREE.Vector3(1, 1, 1))
      chairs.setMatrixAt(i, m)
      chairs.setColorAt(i, c.set(ch.guest ? (ch.guest.rsvp === 'yes' ? '#6366f1' : '#a5b4fc') : '#e5e7eb'))
    })
    group.add(chairs)
  }

  /* ---------- Labels ---------- */
  const label = (text: string, p: Pt, y: number, size = 0.5) => {
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d')!
    ctx.font = '600 48px Inter, system-ui, sans-serif'
    const w = Math.ceil(ctx.measureText(text).width) + 40
    c.width = w
    c.height = 72
    ctx.font = '600 48px Inter, system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.beginPath()
    ctx.roundRect(0, 0, w, 72, 20)
    ctx.fill()
    ctx.fillStyle = '#1e293b'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 20, 38)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    const sm = new THREE.SpriteMaterial({ map: tex, depthTest: false })
    owned.push(tex, sm)
    const sp = new THREE.Sprite(sm)
    sp.scale.set((size * w) / 72, size, 1)
    sp.position.set(p.x, y, p.y)
    sp.renderOrder = 10
    group.add(sp)
  }

  /* ---------- Items ---------- */
  for (const it of d.layout.items) {
    const c = { x: it.x, y: it.y }
    const z = itemHeight(it)
    const color = it.color && it.color !== 'transparent' ? it.color : '#e2e8f0'
    switch (it.kind) {
      case 'round-table': {
        const t = cyl(it.w / 2, 0.76, cloth, 40)
        group.add(at(t, c, 0.38))
        if (opts.labels && it.label) label(it.label, c, 1.35)
        break
      }
      case 'cocktail-table':
        group.add(at(cyl(it.w / 2, 1.1, cloth, 28), c, 0.55))
        break
      case 'banquet-table': {
        group.add(at(box(it.w, 0.76, it.h, cloth), c, 0.38, it.rotation))
        if (opts.labels && it.label) label(it.label, c, 1.35)
        break
      }
      case 'chair':
      case 'chair-block':
        break
      case 'stage': {
        const H = it.height ?? 0.4
        const top = mat('#d6d3d1')
        const skirt = mat('#1f2937')
        const s = mesh(geo(new THREE.BoxGeometry(it.w, H, it.h)), [skirt, skirt, top, skirt, skirt, skirt])
        group.add(at(s, c, H / 2, it.rotation))
        if (opts.labels && it.label) label(it.label, c, H + 2.2, 0.6)
        if (night) {
          const spot = new THREE.SpotLight('#ffd7a3', 60, 30, Math.PI / 5, 0.5, 1.5)
          const front = toWorld(it, { x: 0, y: it.h / 2 + 5 })
          spot.position.set(front.x, 6, front.y)
          spot.target.position.set(it.x, H, it.y)
          group.add(spot, spot.target)
          nightLights.push(spot)
        }
        break
      }
      case 'dancefloor': {
        const cv = document.createElement('canvas')
        cv.width = cv.height = 64
        const g = cv.getContext('2d')!
        g.fillStyle = '#f8fafc'
        g.fillRect(0, 0, 64, 64)
        g.fillStyle = '#1e293b'
        g.fillRect(0, 0, 32, 32)
        g.fillRect(32, 32, 32, 32)
        const tex = new THREE.CanvasTexture(cv)
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping
        tex.repeat.set(it.w, it.h)
        tex.magFilter = THREE.NearestFilter
        tex.colorSpace = THREE.SRGBColorSpace
        owned.push(tex)
        const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.1 })
        owned.push(m)
        group.add(at(mesh(geo(new THREE.BoxGeometry(it.w, 0.03, it.h)), m, false), c, 0.015, it.rotation))
        break
      }
      case 'wall':
        group.add(at(box(it.w, 2.7, Math.max(0.1, it.h), '#e7e5e4'), c, 1.35, it.rotation))
        break
      case 'door':
        break
      case 'exit': {
        const sign = box(0.5, 0.18, 0.06, '#16a34a', { emissive: '#16a34a', emissiveIntensity: night ? 1.2 : 0.3 })
        group.add(at(sign, c, 2.3, it.rotation))
        break
      }
      case 'pillar':
        group.add(at(cyl(it.w / 2, z, '#cbd5e1'), c, z / 2))
        break
      case 'plant': {
        group.add(at(cyl(it.w * 0.3, 0.45, '#a8a29e', 16), c, 0.22))
        const leaves = mesh(geo(new THREE.SphereGeometry(it.w * 0.55, 16, 12)), mat('#4ade80'))
        group.add(at(leaves, c, 0.45 + it.w * 0.45))
        break
      }
      case 'label':
        if (opts.labels && it.label) label(it.label, c, 0.4, 0.45)
        break
      case 'tent':
        buildTent(it)
        break
      case 'asset': {
        const round = it.asset?.shape === 'round'
        const H = Math.max(0.02, it.height ?? z)
        const key = it.key ?? it.asset?.key ?? ''
        const glow = /uplight|festoon|lamp|chandelier|lighting-tower|moving-head/.test(key)
        const m = round ? mesh(geo(new THREE.CylinderGeometry(0.5, 0.5, H, 28)), mat(color, glow && night ? { emissive: color, emissiveIntensity: 1 } : {})) : box(it.w, H, it.h, color, glow && night ? { emissive: color, emissiveIntensity: 1 } : {})
        if (round) m.scale.set(it.w, 1, it.h)
        // Hung or flown things float: festoons, chandeliers, line arrays, flown truss.
        const lift = /festoon|chandelier|line-array/.test(key) ? 2.8 : 0
        group.add(at(m, c, lift + H / 2, it.rotation))
        if (night && glow) {
          const l = new THREE.PointLight(color === '#ffffff' ? '#ffe4b5' : color, key === 'festoon' ? 8 : 4, key === 'festoon' ? 12 : 6, 1.5)
          l.position.set(c.x, lift + H + 0.2, c.y)
          group.add(l)
          nightLights.push(l)
        }
        if (opts.labels && it.label) label(it.label, c, lift + H + 0.5, 0.4)
        break
      }
      default: {
        // Bars, buffets, DJ, screens, photo booths, lounges: a block at their real height.
        const dark = it.kind === 'screen'
        group.add(at(box(it.w, z, it.h, dark ? '#0f172a' : color, dark && night ? { emissive: '#60a5fa', emissiveIntensity: 0.6 } : {}), c, z / 2, it.rotation))
        if (opts.labels && it.label) label(it.label, c, z + 0.5, 0.4)
      }
    }
  }

  /* ---------- Marquees ---------- */
  function buildTent(it: LayoutItem) {
    const t = it.tent!
    const { w, h } = it
    const g = new THREE.Group()
    const canopyMat =
      opts.canopy === 'hidden'
        ? null
        : mat(t.type === 'stretch' ? '#f5f0e6' : '#fbfbfa', { transparent: opts.canopy === 'ghost', opacity: opts.canopy === 'ghost' ? 0.22 : 0.97, side: THREE.DoubleSide, depthWrite: opts.canopy !== 'ghost' })
    const wallMat = t.walls === 'open' ? null : mat(t.walls === 'clear' ? '#bae6fd' : '#f8fafc', { transparent: true, opacity: t.walls === 'clear' ? 0.25 : opts.canopy === 'ghost' ? 0.3 : 0.92, side: THREE.DoubleSide })
    const poleMat = mat(t.type === 'sailcloth' || t.type === 'tipi' ? '#a16207' : '#94a3b8', { metalness: 0.4, roughness: 0.5 })

    // Legs and poles: tall in the middle, eave height round the edge.
    for (const q of tentPoles(it)) {
      const inner = Math.abs(q.x) < w / 2 - 0.3 && Math.abs(q.y) < h / 2 - 0.3 && (t.type !== 'tipi' || Math.hypot(q.x, q.y) < 0.3)
      const H = inner ? t.ridge : t.eave
      const p = mesh(geo(new THREE.CylinderGeometry(0.05, 0.05, H, 8)), poleMat)
      p.position.set(q.x, H / 2, q.y)
      g.add(p)
    }

    if (canopyMat) {
      if (t.type === 'frame' || t.type === 'clearspan' || t.type === 'pole') {
        // A gable roof: two slopes from the eaves to the ridge, and triangular ends.
        const hw = w / 2
        const hh = h / 2
        const v = new Float32Array([
          -hw, t.eave, -hh, 0, t.ridge, -hh, 0, t.ridge, hh, -hw, t.eave, -hh, 0, t.ridge, hh, -hw, t.eave, hh,
          hw, t.eave, -hh, hw, t.eave, hh, 0, t.ridge, hh, hw, t.eave, -hh, 0, t.ridge, hh, 0, t.ridge, -hh,
          -hw, t.eave, -hh, hw, t.eave, -hh, 0, t.ridge, -hh, -hw, t.eave, hh, 0, t.ridge, hh, hw, t.eave, hh,
        ])
        const rg = geo(new THREE.BufferGeometry())
        rg.setAttribute('position', new THREE.BufferAttribute(v, 3))
        rg.computeVertexNormals()
        g.add(mesh(rg, canopyMat))
      } else if (t.type === 'tipi') {
        const cone = mesh(geo(new THREE.ConeGeometry(w / 2, t.ridge - t.eave, 8, 1, true)), canopyMat)
        cone.position.y = t.eave + (t.ridge - t.eave) / 2
        g.add(cone)
      } else {
        // Sailcloth and stretch: a peak over each king pole.
        const peaks = tentPoles(it).filter((q) => Math.abs(q.x) < w / 2 - 0.3 && Math.abs(q.y) < h / 2 - 0.3)
        const r = t.type === 'sailcloth' ? w / 2 + 0.2 : Math.max(w, h) / (peaks.length + 1) + 1
        for (const q of peaks.length ? peaks : [{ x: 0, y: 0 }]) {
          const cone = mesh(geo(new THREE.ConeGeometry(r, t.ridge - t.eave, 24, 1, true)), canopyMat)
          cone.position.set(q.x, t.eave + (t.ridge - t.eave) / 2, q.y)
          g.add(cone)
        }
        if (t.type === 'stretch') {
          const sheet = mesh(geo(new THREE.PlaneGeometry(w, h)), canopyMat)
          sheet.rotation.x = -Math.PI / 2
          sheet.position.y = t.eave
          g.add(sheet)
        }
      }
    }

    // Side walls, with doorways left open.
    if (wallMat && t.type !== 'tipi') {
      const sides: [number, number, number, number][] = [
        [-w / 2, -h / 2, w / 2, -h / 2],
        [w / 2, -h / 2, w / 2, h / 2],
        [-w / 2, h / 2, w / 2, h / 2],
        [-w / 2, -h / 2, -w / 2, h / 2],
      ]
      sides.forEach(([x1, y1, x2, y2], side) => {
        const len = Math.hypot(x2 - x1, y2 - y1)
        const gaps = t.doors
          .filter((dr) => dr.side === side)
          .map((dr) => [len / 2 + dr.at - dr.w / 2, len / 2 + dr.at + dr.w / 2])
          .sort((a, b) => a[0] - b[0])
        let from = 0
        const runs: [number, number][] = []
        for (const [a, b] of gaps) {
          if (a > from) runs.push([from, a])
          from = Math.max(from, b)
        }
        if (from < len) runs.push([from, len])
        for (const [a, b] of runs) {
          const panel = mesh(geo(new THREE.PlaneGeometry(b - a, t.eave)), wallMat, false)
          const mid = (a + b) / 2 / len
          panel.position.set(x1 + (x2 - x1) * mid, t.eave / 2, y1 + (y2 - y1) * mid)
          panel.rotation.y = side % 2 ? Math.PI / 2 : 0
          g.add(panel)
        }
      })
    } else if (wallMat && t.type === 'tipi') {
      const wall = mesh(geo(new THREE.CylinderGeometry(w / 2, w / 2, t.eave, 32, 1, true)), wallMat, false)
      wall.position.y = t.eave / 2
      g.add(wall)
    }

    if (night) {
      const glow = new THREE.PointLight('#ffd9a8', 25, Math.max(w, h) * 1.2, 1.4)
      glow.position.set(0, t.eave + 0.3, 0)
      g.add(glow)
      nightLights.push(glow)
    }
    if (opts.labels && it.label) label(it.label, { x: it.x, y: it.y }, t.ridge + 0.8, 0.6)
    at(g, { x: it.x, y: it.y }, 0, it.rotation)
    group.add(g)
  }

  const bounds = new THREE.Box3()
  for (const it of d.layout.items) bounds.expandByPoint(new THREE.Vector3(it.x - it.w / 2, 0, it.y - it.h / 2)).expandByPoint(new THREE.Vector3(it.x + it.w / 2, 3, it.y + it.h / 2))
  for (const s of d.layout.spaces) bounds.expandByPoint(new THREE.Vector3(s.x - s.w / 2, 0, s.y - s.h / 2)).expandByPoint(new THREE.Vector3(s.x + s.w / 2, 3, s.y + s.h / 2))
  if (bounds.isEmpty()) bounds.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(20, 3, 15))

  return {
    group,
    nightLights,
    bounds,
    dispose: () => owned.forEach((o) => o.dispose()),
  }
}
