import { useEffect, useRef, useState } from 'react'
import { Camera, Loader2, X } from 'lucide-react'
import { useEvent } from '../../store/event'
import { useAccount } from '../../store/account'
import { useKit } from '../../store/kit'
import { useUI } from '../../store/ui'
import { ASSET_GROUPS } from '../../data/assets'
import { kitKey } from '../../data/library'
import { api } from '../../lib/api'
import { Button, Modal, Select, toast } from '../../components/ui'
import { addFurniture } from './layoutActions'

const MAX_PHOTOS = 3
const FT = 0.3048

/** Shrink a photo to at most 1600 px on its long side, as JPEG, so uploads stay small. */
const shrink = (file: File): Promise<Blob> =>
  new Promise((res, rej) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k)
      c.height = Math.round(img.height * k)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      c.toBlob((b) => (b ? res(b) : rej(new Error('Could not read that photo'))), 'image/jpeg', 0.85)
    }
    img.onerror = () => (URL.revokeObjectURL(url), rej(new Error('Could not read that photo')))
    img.src = url
  })

/** Ask for an item that isn't in the library, with photos and its size — and get a stand-in to plan with now. */
export const RequestItemDialog = ({ initialName = '', onClose }: { initialName?: string; onClose: () => void }) => {
  const d = useEvent((s) => s.doc)
  const user = useAccount((s) => s.user)
  const [name, setName] = useState(initialName)
  const [category, setCategory] = useState<string>('Décor')
  const [unit, setUnit] = useState<'m' | 'ft'>('m')
  const [size, setSize] = useState({ w: '', d: '', z: '' })
  const [notes, setNotes] = useState('')
  const [email, setEmail] = useState(user?.email ?? '')
  const [photos, setPhotos] = useState<{ blob: Blob; url: string }[]>([])
  const [standIn, setStandIn] = useState(true)
  const [busy, setBusy] = useState(false)

  // Release preview URLs when the dialog closes (not on every change — they're still on screen).
  const shown = useRef(photos)
  useEffect(() => {
    shown.current = photos
  }, [photos])
  useEffect(() => () => shown.current.forEach((p) => URL.revokeObjectURL(p.url)), [])

  const metres = (v: string) => {
    const n = parseFloat(v)
    return Number.isFinite(n) && n > 0 ? +(unit === 'ft' ? n * FT : n).toFixed(3) : null
  }
  const w = metres(size.w)
  const dd = metres(size.d)
  const z = metres(size.z)
  const ok = name.trim().length > 1 && !busy

  const addPhotos = async (files: File[]) => {
    const room = MAX_PHOTOS - photos.length
    const picked = [...files].filter((f) => f.type.startsWith('image/')).slice(0, room)
    if (files.length > room) toast(`Up to ${MAX_PHOTOS} photos`)
    try {
      const shrunk = await Promise.all(picked.map(shrink))
      setPhotos((p) => [...p, ...shrunk.map((blob) => ({ blob, url: URL.createObjectURL(blob) }))])
    } catch (e) {
      toast((e as Error).message)
    }
  }

  const send = async () => {
    setBusy(true)
    try {
      const form = new FormData()
      form.set('name', name.trim())
      form.set('category', category)
      if (w) form.set('w', String(w))
      if (dd) form.set('d', String(dd))
      if (z) form.set('z', String(z))
      form.set('notes', notes.trim())
      if (email.trim()) form.set('email', email.trim())
      form.set('context', JSON.stringify({ screen: useUI.getState().tab, eventType: d?.type }))
      photos.forEach((p, i) => form.append('photo', p.blob, `photo-${i + 1}.jpg`))
      const r = await api<{ id: string }>('/api/item-requests', { method: 'POST', body: form })
      if (standIn) {
        const k = useKit.getState().upsert({
          name: name.trim(),
          group: category,
          w: w ?? 1,
          d: dd ?? w ?? 1,
          z: z ?? 1,
          shape: 'rect',
          color: '#fef3c7',
          icon: 'Box',
          owned: 0,
          price: 0,
          currency: d?.currency ?? 'USD',
          notes: notes.trim(),
          requestId: r.id,
        })
        if (d) addFurniture(kitKey(k.id))
        toast('Request sent — a stand-in is on your plan and in your kit')
      } else toast('Request sent — thanks!')
      onClose()
    } catch (e) {
      toast((e as Error).message || 'Couldn’t send that — try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Request an item"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} className="mr-auto">
            Cancel
          </Button>
          <Button variant="primary" onClick={send} disabled={!ok}>
            {busy && <Loader2 size={16} className="animate-spin" />} Send request
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-slate-600">Tell us what’s missing and we’ll draw it properly for the library. Photos and real sizes help us get it right.</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_11rem]">
          <input className="input" autoFocus placeholder="What is it? e.g. 6m hexagonal gazebo" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          <Select value={category} options={[...ASSET_GROUPS, 'Marquees & structures', 'Other']} onChange={setCategory} className="w-full" />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
            <span>Size</span>
            <div className="inline-flex rounded-md border border-slate-200 p-0.5">
              {(['m', 'ft'] as const).map((u) => (
                <button key={u} onClick={() => setUnit(u)} className={`rounded px-2 py-0.5 ${unit === u ? 'bg-brand-50 font-medium text-brand-700' : ''}`}>
                  {u}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['w', 'Width'],
                ['d', 'Depth'],
                ['z', 'Height'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="text-xs text-slate-500">
                {label} ({unit})
                <input type="number" min={0} step={0.01} inputMode="decimal" className="input mt-0.5 tabular-nums" value={size[k]} onChange={(e) => setSize((s) => ({ ...s, [k]: e.target.value }))} />
              </label>
            ))}
          </div>
        </div>
        <textarea className="input h-20" placeholder="Anything else — how it’s used, what it’s made of, where you hire it from" value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
        <div>
          <div className="mb-1 text-xs text-slate-500">Photos (up to {MAX_PHOTOS})</div>
          <div className="flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <div key={p.url} className="relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200">
                <img src={p.url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                <button onClick={() => (URL.revokeObjectURL(p.url), setPhotos((x) => x.filter((_, j) => j !== i)))} className="absolute top-1 right-1 rounded-full bg-slate-900/70 p-0.5 text-white" aria-label="Remove photo">
                  <X size={12} />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-xs text-slate-500 hover:border-brand-400 hover:text-brand-600">
                <Camera size={18} /> Add
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => {
                    // Copy first: clearing the input empties its FileList.
                    const files = [...(e.target.files ?? [])]
                    e.target.value = ''
                    addPhotos(files)
                  }} />
              </label>
            )}
          </div>
        </div>
        <input className="input" type="email" placeholder="Your email (optional — we’ll tell you when it’s added)" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-slate-50 p-2.5 text-slate-700">
          <input type="checkbox" className="mt-0.5 accent-brand-600" checked={standIn} onChange={(e) => setStandIn(e.target.checked)} />
          <span>
            Add a stand-in to my kit{d ? ' and this plan' : ''} now
            <span className="block text-xs text-slate-500">At the size you gave, so you can keep planning while we draw the real one.</span>
          </span>
        </label>
      </div>
    </Modal>
  )
}
