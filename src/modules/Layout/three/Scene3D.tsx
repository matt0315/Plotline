import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Camera, Footprints, LayoutGrid, Orbit, RotateCcw, Tag } from 'lucide-react'
import { useEvent } from '../../../store/event'
import { usePlan } from '../../../store/plans'
import { useAccount } from '../../../store/account'
import { seatsWorld } from '../../../lib/geometry'
import { focusOf, EYE_SEATED, EYE_STANDING } from '../../../lib/sightlines'
import { slug } from '../../../lib/share'
import { BRAND } from '../../../lib/brand'
import { toast } from '../../../components/ui'
import { useLayoutView } from '../viewStore'
import { buildScene, type BuildOptions, type Built, type Canopy, type Light } from './build'

const LIGHTS: Record<Light, { bg: string; hemi: [string, string, number]; sun: [string, number]; sunAt: [number, number, number] }> = {
  day: { bg: '#cfe2f3', hemi: ['#ffffff', '#b9c6a9', 1.1], sun: ['#ffffff', 2.4], sunAt: [0.5, 1.2, 0.35] },
  golden: { bg: '#f2cfa6', hemi: ['#ffd9b0', '#7d6b52', 0.7], sun: ['#ffae5e', 2.8], sunAt: [1.2, 0.28, 0.4] },
  night: { bg: '#0a1020', hemi: ['#334155', '#05070d', 0.5], sun: ['#9db4ff', 0.3], sunAt: [-0.4, 1, -0.3] },
}

const Seg = <T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void }) => (
  <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
    {options.map((o) => (
      <button key={o.value} title={o.title} onClick={() => onChange(o.value)} className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${value === o.value ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'}`}>
        {o.label}
      </button>
    ))}
  </div>
)

interface Rig {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  hemi: THREE.HemisphereLight
  sun: THREE.DirectionalLight
  built?: Built
  yaw: number
  pitch: number
  eye: number
  keys: Set<string>
  framed: boolean
}

/** Orbit camera that fits the whole plan on screen, allowing for a narrow (portrait) view. */
const frame = (r: Rig, built: Built) => {
  const c = built.bounds.getCenter(new THREE.Vector3())
  const size = built.bounds.getSize(new THREE.Vector3())
  const span = Math.max(size.x, size.z, 10)
  const fov = (r.camera.fov * Math.PI) / 180
  const dist = ((span / 2) / Math.tan(fov / 2) / Math.min(1, r.camera.aspect)) * 1.1
  const dir = new THREE.Vector3(0.45, 0.65, 0.62).normalize()
  r.camera.position.copy(c).addScaledVector(dir, dist)
  r.controls.target.copy(c)
}

/** The floor plan in 3D: orbit round it, walk through it, or sit in a guest's seat. */
export default function Scene3D() {
  const d = useEvent((s) => s.doc)!
  const plan = usePlan(d.layout.basePlan?.planId)
  const isPro = useAccount((s) => s.isPro)
  const seatView = useLayoutView((s) => s.seatView)
  const set = useLayoutView((s) => s.set)
  const host = useRef<HTMLDivElement>(null)
  const rig = useRef<Rig | null>(null)
  const [opts, setOpts] = useState<BuildOptions>({ canopy: 'ghost', labels: true, light: 'day' })
  const [mode, setMode] = useState<'orbit' | 'walk'>('orbit')
  const modeRef = useRef(mode)
  useEffect(() => {
    modeRef.current = mode
    const r = rig.current
    if (r) r.controls.enabled = mode === 'orbit'
  }, [mode])

  /* ---------- Renderer, camera, controls, loop ---------- */
  useEffect(() => {
    // On a phone, the scene needs the whole screen.
    if (window.innerWidth < 1024) useLayoutView.getState().set({ panel: null })
    const el = host.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.domElement.style.touchAction = 'none'
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1500)
    camera.rotation.order = 'YXZ'
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.maxPolarAngle = Math.PI / 2 - 0.04
    controls.minDistance = 2
    controls.maxDistance = 400
    const hemi = new THREE.HemisphereLight()
    const sun = new THREE.DirectionalLight()
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.bias = -0.0004
    scene.add(hemi, sun, sun.target)
    const r: Rig = { renderer, scene, camera, controls, hemi, sun, yaw: 0, pitch: 0, eye: EYE_STANDING, keys: new Set(), framed: false }
    rig.current = r

    const resize = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / Math.max(1, h)
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()

    // Walk mode: drag to look, keys to move.
    let drag: { x: number; y: number } | null = null
    const down = (e: PointerEvent) => {
      if (modeRef.current !== 'walk') return
      drag = { x: e.clientX, y: e.clientY }
    }
    const move = (e: PointerEvent) => {
      if (!drag || modeRef.current !== 'walk') return
      r.yaw -= (e.clientX - drag.x) * 0.005
      r.pitch = Math.max(-1.2, Math.min(1.2, r.pitch - (e.clientY - drag.y) * 0.005))
      drag = { x: e.clientX, y: e.clientY }
    }
    const up = () => (drag = null)
    const key = (on: boolean) => (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input,textarea,select')) return
      const k = e.key.toLowerCase()
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) {
        if (on) r.keys.add(k)
        else r.keys.delete(k)
        if (modeRef.current === 'walk' && k.startsWith('arrow')) e.preventDefault()
      }
    }
    const kd = key(true)
    const ku = key(false)
    renderer.domElement.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)

    let last = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      if (modeRef.current === 'walk') {
        const speed = (r.keys.has('shift') ? 5 : 2.2) * dt
        const f = (r.keys.has('w') || r.keys.has('arrowup') ? 1 : 0) - (r.keys.has('s') || r.keys.has('arrowdown') ? 1 : 0)
        const s = (r.keys.has('d') || r.keys.has('arrowright') ? 1 : 0) - (r.keys.has('a') || r.keys.has('arrowleft') ? 1 : 0)
        camera.position.x += (-Math.sin(r.yaw) * f + Math.cos(r.yaw) * s) * speed
        camera.position.z += (-Math.cos(r.yaw) * f - Math.sin(r.yaw) * s) * speed
        camera.position.y = r.eye
        camera.rotation.set(r.pitch, r.yaw, 0)
      } else controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
      controls.dispose()
      r.built?.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      rig.current = null
    }
  }, [])

  /* ---------- Rebuild when the plan or options change ---------- */
  useEffect(() => {
    const r = rig.current
    if (!r) return
    if (r.built) {
      r.scene.remove(r.built.group)
      r.built.dispose()
    }
    const built = buildScene(d, plan ?? undefined, opts)
    r.built = built
    r.scene.add(built.group)
    const L = LIGHTS[opts.light]
    r.scene.background = new THREE.Color(L.bg)
    r.hemi.color.set(L.hemi[0])
    r.hemi.groundColor.set(L.hemi[1])
    r.hemi.intensity = L.hemi[2]
    r.sun.color.set(L.sun[0])
    r.sun.intensity = L.sun[1]
    const c = built.bounds.getCenter(new THREE.Vector3())
    const size = built.bounds.getSize(new THREE.Vector3())
    const span = Math.max(size.x, size.z, 10)
    r.sun.position.set(c.x + L.sunAt[0] * span, L.sunAt[1] * span, c.z + L.sunAt[2] * span)
    r.sun.target.position.copy(c)
    const sc = r.sun.shadow.camera
    sc.left = sc.bottom = -span * 0.9
    sc.right = sc.top = span * 0.9
    sc.near = 0.5
    sc.far = span * 4
    sc.updateProjectionMatrix()
    if (!r.framed) {
      r.framed = true
      frame(r, built)
    }
  }, [d, plan, opts])

  const resetView = () => {
    const r = rig.current
    if (!r?.built) return
    setMode('orbit')
    set({ seatView: null })
    frame(r, r.built)
  }

  const startWalk = () => {
    const r = rig.current
    if (!r?.built) return
    const c = r.built.bounds.getCenter(new THREE.Vector3())
    // Start just in front of the target you were orbiting, looking where the camera looked.
    const dir = new THREE.Vector3().subVectors(r.controls.target, r.camera.position).setY(0).normalize()
    r.yaw = Math.atan2(-dir.x, -dir.z)
    r.pitch = 0
    r.eye = EYE_STANDING
    const start = r.controls.target.clone().addScaledVector(dir, -6)
    r.camera.position.set(start.x || c.x, EYE_STANDING, start.z || c.z)
    setMode('walk')
  }

  /* ---------- Sit in a guest's seat ---------- */
  useEffect(() => {
    const r = rig.current
    if (!r || !seatView) return
    const table = d.layout.items.find((i) => i.id === seatView.itemId)
    const p = table ? seatsWorld(table)[seatView.index] : undefined
    if (!p) return
    const f = focusOf(d.layout.items)
    const target = f ? f.at : { x: table!.x, y: table!.y }
    const dx = target.x - p.x
    const dz = target.y - p.y
    r.yaw = Math.atan2(-dx, -dz)
    r.pitch = Math.atan2((f?.z ?? 1.2) - EYE_SEATED, Math.max(0.5, Math.hypot(dx, dz)))
    r.eye = EYE_SEATED
    r.camera.position.set(p.x, EYE_SEATED, p.y)
    // React state for the mode lives outside the render loop's ref; keep both in step.
    modeRef.current = 'walk'
    r.controls.enabled = false
    queueMicrotask(() => setMode('walk'))
  }, [seatView, d.layout.items])

  const seatInfo = (() => {
    if (!seatView) return null
    const table = d.layout.items.find((i) => i.id === seatView.itemId)
    const guest = d.guests.find((g) => g.seat?.itemId === seatView.itemId && g.seat.index === seatView.index)
    return `${guest ? `${guest.name}’s view` : 'The view'} from ${table?.label || 'this table'}, seat ${seatView.index + 1}`
  })()

  const exportPng = () => {
    const r = rig.current
    if (!r) return
    r.renderer.render(r.scene, r.camera)
    const src = r.renderer.domElement
    const out = document.createElement('canvas')
    out.width = src.width
    out.height = src.height
    const g = out.getContext('2d')!
    g.drawImage(src, 0, 0)
    if (!isPro) {
      g.font = `600 ${Math.round(out.width / 40)}px Inter, system-ui, sans-serif`
      g.fillStyle = 'rgba(255,255,255,0.85)'
      g.textAlign = 'right'
      g.fillText(`Made with ${BRAND} Free`, out.width - 24, out.height - 24)
    }
    const a = document.createElement('a')
    a.download = `${slug(d.name)}-3d.png`
    a.href = out.toDataURL('image/png')
    a.click()
    toast('3D view saved')
  }

  const hold = (k: string) => ({
    onPointerDown: (e: React.PointerEvent) => (e.preventDefault(), rig.current?.keys.add(k)),
    onPointerUp: () => rig.current?.keys.delete(k),
    onPointerLeave: () => rig.current?.keys.delete(k),
  })

  return (
    <div className="absolute inset-0">
      <div ref={host} className="absolute inset-0" />

      <div className="absolute top-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1.5">
        <button onClick={() => set({ mode: '2d', seatView: null })} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium shadow-sm hover:bg-slate-50">
          <LayoutGrid size={14} /> 2D plan
        </button>
        <Seg
          value={mode}
          onChange={(m) => (m === 'walk' ? startWalk() : (setMode('orbit'), set({ seatView: null })))}
          options={[
            { value: 'orbit', label: <><Orbit size={13} /> Orbit</> },
            { value: 'walk', label: <><Footprints size={13} /> Walk</> },
          ]}
        />
        <Seg<Light>
          value={opts.light}
          onChange={(light) => setOpts((o) => ({ ...o, light }))}
          options={[
            { value: 'day', label: 'Day' },
            { value: 'golden', label: 'Golden hour' },
            { value: 'night', label: 'Night' },
          ]}
        />
        <Seg<Canopy>
          value={opts.canopy}
          onChange={(canopy) => setOpts((o) => ({ ...o, canopy }))}
          options={[
            { value: 'solid', label: 'Solid', title: 'Marquee roofs and room walls solid' },
            { value: 'ghost', label: 'Ghost', title: 'See-through roofs and walls' },
            { value: 'hidden', label: 'Hidden', title: 'No roofs or room walls' },
          ]}
        />
        <button onClick={() => setOpts((o) => ({ ...o, labels: !o.labels }))} title="Labels" className={`rounded-lg border p-1.5 shadow-sm ${opts.labels ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-500'}`}>
          <Tag size={14} />
        </button>
        <button onClick={resetView} title="Reset view" className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm hover:bg-slate-50">
          <RotateCcw size={14} />
        </button>
        <button onClick={exportPng} title="Save this view as a picture" className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">
          <Camera size={14} /> PNG
        </button>
      </div>

      {seatInfo && (
        <div className="absolute top-14 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900/85 py-1.5 pr-1.5 pl-4 text-xs text-white shadow-lg">
          {seatInfo}
          <button onClick={resetView} className="rounded-full bg-white/15 px-2.5 py-1 hover:bg-white/25">
            Overview
          </button>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 rounded-full bg-slate-900/70 px-3 py-1 text-[11px] text-white sm:bottom-3">
        {mode === 'orbit' ? 'Drag to turn · scroll or pinch to zoom · right-drag to pan' : 'Drag to look · W A S D or arrow keys to move · Shift to hurry'}
      </div>

      {mode === 'walk' && (
        <div className="absolute right-3 bottom-16 grid grid-cols-3 gap-1 sm:bottom-3">
          <span />
          <button {...hold('w')} className="rounded-lg bg-white/90 p-2 shadow" aria-label="Forward">
            <ArrowUp size={16} />
          </button>
          <span />
          <button {...hold('a')} className="rounded-lg bg-white/90 p-2 shadow" aria-label="Left">
            <ArrowLeft size={16} />
          </button>
          <button {...hold('s')} className="rounded-lg bg-white/90 p-2 shadow" aria-label="Back">
            <ArrowDown size={16} />
          </button>
          <button {...hold('d')} className="rounded-lg bg-white/90 p-2 shadow" aria-label="Right">
            <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
