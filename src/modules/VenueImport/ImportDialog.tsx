import { useEffect, useRef, useState } from 'react'
import { Upload, Loader2, FileImage, Globe, Lock, Crown, Search, Trash2 } from 'lucide-react'
import type { VenuePlan } from '../../types/event'
import { useEvent, update } from '../../store/event'
import { useAccount, gate } from '../../store/account'
import { refreshPlans, removePlan, savePlan, usePlans, seedPlan } from '../../store/plans'
import { planFromRow, searchPublicPlans, type PlanRow } from '../../store/persistence'
import { importDwg, importDxf, importImage, importPdf, kindOf, pdfScale, type ImportedPlan } from '../../lib/cad/import'
import { uid } from '../../lib/id'
import { Button, Modal, toast } from '../../components/ui'
import { useLayoutView } from '../Layout/viewStore'
import { fitView } from '../Layout/Canvas'

const PDF_SCALES = [0, 20, 50, 100, 200, 250, 500, 1000]

/** Put a plan under the floor plan and frame it. Top-left aligns with the first room. */
const applyPlan = (plan: VenuePlan) => {
  update((d) => {
    const room = d.layout.spaces[0]
    d.layout.basePlan = {
      planId: plan.id,
      x: room ? room.x - room.w / 2 : 0,
      y: room ? room.y - room.h / 2 : 0,
      opacity: 0.7,
    }
  })
  requestAnimationFrame(fitView)
  if (plan.calibratedBy === 'guess') {
    useLayoutView.getState().set({ tool: 'calibrate', measure: null })
    toast('Now drag along a wall you know the length of to set the scale')
  }
}

export default function ImportDialog({ onClose }: { onClose: () => void }) {
  const d = useEvent((s) => s.doc)!
  const isPro = useAccount((s) => s.isPro)
  const user = useAccount((s) => s.user)
  const [tab, setTab] = useState<'upload' | 'mine' | 'library'>('upload')
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<ImportedPlan | null>(null)
  const [pdfRatio, setPdfRatio] = useState(0)
  const [name, setName] = useState('')
  const [venueName, setVenueName] = useState(d.venue.name)
  const [city, setCity] = useState('')
  const [publish, setPublish] = useState(false)
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const mine = usePlans((s) => s.list)

  useEffect(() => {
    refreshPlans()
  }, [])

  const handle = async (file: File) => {
    const kind = kindOf(file)
    if (!kind) return toast('Use DXF, DWG, PDF or an image')
    if (kind === 'dwg') {
      if (!gate('dwg')) return
      if (!useAccount.getState().cloud || !user) return toast('Sign in to convert DWG files — or export DXF from your CAD app')
    }
    setName(file.name.replace(/\.[^.]+$/, ''))
    setBusy('Reading drawing…')
    try {
      let r: ImportedPlan
      if (kind === 'dxf') r = await importDxf(file)
      else if (kind === 'pdf') r = await importPdf(file)
      else if (kind === 'image') r = await importImage(file)
      else {
        r = await importDwg(file, setBusy)
      }
      setResult(r)
    } catch (e) {
      console.error(e)
      toast((e as Error).message || "Couldn't read that file")
    } finally {
      setBusy(null)
    }
  }

  const confirm = async () => {
    if (!result) return
    if (publish && !gate('publish-plan')) return
    const scaled = result.source === 'pdf' && pdfRatio && result.pdfPointsPerPx
    const plan: VenuePlan = {
      id: uid('p'),
      name: name || 'Venue plan',
      source: result.source,
      image: result.image,
      natW: result.natW,
      natH: result.natH,
      metersPerPx: scaled ? pdfScale(result.pdfPointsPerPx!, pdfRatio) : result.metersPerPx,
      calibratedBy: scaled ? 'units' : result.calibratedBy,
      visibility: publish ? 'public' : 'private',
      venueName,
      city,
      ownerId: user?.id,
      created: new Date().toISOString(),
    }
    setBusy('Saving…')
    try {
      await savePlan(plan)
    } catch (e) {
      console.error(e)
      toast('Saved on this device — cloud upload failed')
    }
    setBusy(null)
    applyPlan(plan)
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Venue drawing" width="max-w-2xl">
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
        {(
          [
            ['upload', 'Upload'],
            ['mine', `Your plans${mine.length ? ` · ${mine.length}` : ''}`],
            ['library', 'Venue library'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex-1 rounded-md px-3 py-1.5 font-medium ${tab === k ? 'bg-white shadow-sm' : 'text-slate-500'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'upload' && !result && (
        <div
          onDragOver={(e) => (e.preventDefault(), setDrag(true))}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            const f = e.dataTransfer.files[0]
            if (f) handle(f)
          }}
          onClick={() => !busy && input.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition ${drag ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-slate-400'}`}
        >
          {busy ? (
            <>
              <Loader2 className="animate-spin text-brand-600" size={28} />
              <p className="mt-3 text-sm font-medium">{busy}</p>
            </>
          ) : (
            <>
              <Upload className="text-brand-600" size={28} />
              <p className="mt-3 font-medium">Drop the venue's floor plan here</p>
              <p className="mt-1 text-sm text-slate-500">DXF · DWG · PDF · PNG · JPG — or click to browse</p>
              <p className="mt-4 max-w-md text-xs text-slate-400">
                DXF, PDF and images are read in your browser and never leave it on the free plan.
                {!isPro && ' DWG conversion is included with Pro.'}
              </p>
            </>
          )}
          <input
            ref={input}
            type="file"
            hidden
            accept=".dxf,.dwg,.pdf,image/*"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) handle(f)
            }}
          />
        </div>
      )}

      {tab === 'upload' && result && (
        <div className="grid gap-5 sm:grid-cols-[1fr_240px]">
          <div className="flex items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-[repeating-conic-gradient(#f8fafc_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] p-2">
            <img src={result.image} alt="" className="max-h-72 object-contain" />
          </div>
          <div className="space-y-3">
            <div>
              <label className="label">Plan name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Venue</label>
                <input className="input" value={venueName} onChange={(e) => setVenueName(e.target.value)} />
              </div>
              <div>
                <label className="label">City</label>
                <input className="input" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
            </div>
            {result.source === 'pdf' && (
              <div>
                <label className="label">Printed scale on the drawing</label>
                <select className="input" value={pdfRatio} onChange={(e) => setPdfRatio(parseInt(e.target.value))}>
                  {PDF_SCALES.map((r) => (
                    <option key={r} value={r}>
                      {r ? `1:${r}` : "Not sure — I'll measure a wall"}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {result.scaleNote && <p className="text-xs text-slate-500">{result.scaleNote}</p>}
            <p className="text-xs text-slate-500">
              Size: {(result.natW * (result.source === 'pdf' && pdfRatio && result.pdfPointsPerPx ? pdfScale(result.pdfPointsPerPx, pdfRatio) : result.metersPerPx)).toFixed(1)} ×{' '}
              {(result.natH * (result.source === 'pdf' && pdfRatio && result.pdfPointsPerPx ? pdfScale(result.pdfPointsPerPx, pdfRatio) : result.metersPerPx)).toFixed(1)} m
            </p>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-2.5 text-sm">
              <input type="checkbox" className="mt-0.5 accent-brand-600" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
              <span>
                <span className="flex items-center gap-1 font-medium">
                  Publish to venue library {!isPro && <Crown size={12} className="text-brand-600" />}
                </span>
                <span className="text-xs text-slate-500">Let other planners find this venue and plan on it. Off by default — your plan stays private.</span>
              </span>
            </label>
            <div className="flex gap-2 pt-1">
              <Button onClick={() => setResult(null)}>Back</Button>
              <Button variant="primary" className="flex-1" onClick={confirm} disabled={!!busy}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : null} Use this plan
              </Button>
            </div>
          </div>
        </div>
      )}

      {tab === 'mine' && (
        <div className="grid gap-3 sm:grid-cols-2">
          {mine.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              onUse={() => {
                applyPlan(p)
                onClose()
              }}
              onDelete={async () => {
                if (!window.confirm(`Delete “${p.name}”?`)) return
                if (d.layout.basePlan?.planId === p.id) update((dd) => void delete dd.layout.basePlan)
                await removePlan(p.id)
              }}
            />
          ))}
          {!mine.length && <p className="col-span-full py-10 text-center text-sm text-slate-500">Plans you import are saved here and can be reused across events.</p>}
        </div>
      )}

      {tab === 'library' && (
        <Library
          onUse={async (p) => {
            // Keep our own private copy so it survives reloads and the owner's later edits.
            const copy: VenuePlan = { ...p, id: uid('p'), visibility: 'private', ownerId: user?.id, created: new Date().toISOString() }
            seedPlan(copy)
            await savePlan(copy).catch(() => toast('Saved on this device only'))
            applyPlan(copy)
            onClose()
          }}
        />
      )}
    </Modal>
  )
}

const PlanCard = ({ plan, onUse, onDelete }: { plan: VenuePlan; onUse: () => void; onDelete?: () => void }) => (
  <div className="card overflow-hidden">
    <div className="flex h-32 items-center justify-center bg-slate-50 p-2">
      <img src={plan.image} alt="" className="max-h-full object-contain" />
    </div>
    <div className="flex items-center gap-2 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 truncate text-sm font-medium">
          {plan.visibility === 'public' ? <Globe size={12} className="text-brand-600" /> : <Lock size={12} className="text-slate-400" />}
          {plan.name}
        </div>
        <div className="truncate text-xs text-slate-500">
          {[plan.venueName, plan.city].filter(Boolean).join(' · ') || plan.source.toUpperCase()} · {(plan.natW * plan.metersPerPx).toFixed(0)}×{(plan.natH * plan.metersPerPx).toFixed(0)} m
        </div>
      </div>
      {onDelete && (
        <button onClick={onDelete} className="text-slate-400 hover:text-red-500">
          <Trash2 size={14} />
        </button>
      )}
      <Button size="sm" variant="primary" onClick={onUse}>
        Use
      </Button>
    </div>
  </div>
)

const Library = ({ onUse }: { onUse: (p: VenuePlan) => void }) => {
  const cloudConfigured = useAccount((s) => s.cloud)
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<PlanRow[] | null>(null)
  const [loading, setLoading] = useState<string | null>(null)

  useEffect(() => {
    if (!cloudConfigured) return
    const t = setTimeout(async () => setRows(await searchPublicPlans(q)), 300)
    return () => clearTimeout(t)
  }, [q])

  if (!cloudConfigured)
    return (
      <div className="py-10 text-center text-sm text-slate-500">
        <FileImage className="mx-auto mb-2 text-slate-300" />
        The shared venue library needs accounts, which aren't configured in this build.
      </div>
    )

  return (
    <div>
      <div className="relative mb-3">
        <Search size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="Search venues or cities" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {rows === null ? (
        <Loader2 className="mx-auto animate-spin text-slate-400" />
      ) : rows.length ? (
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5">
              <Globe size={16} className="shrink-0 text-brand-600" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{r.venue_name || r.name}</div>
                <div className="truncate text-xs text-slate-500">
                  {[r.city, r.name].filter(Boolean).join(' · ')} · {(r.nat_w * r.meters_per_px).toFixed(0)}×{(r.nat_h * r.meters_per_px).toFixed(0)} m
                </div>
              </div>
              <Button
                size="sm"
                variant="primary"
                disabled={loading === r.id}
                onClick={async () => {
                  setLoading(r.id)
                  onUse(await planFromRow(r))
                }}
              >
                {loading === r.id ? <Loader2 size={14} className="animate-spin" /> : 'Use'}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-8 text-center text-sm text-slate-500">No published venues match. Venues can publish theirs from the Upload tab.</p>
      )}
    </div>
  )
}
