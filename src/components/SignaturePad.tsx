import { useEffect, useRef } from 'react'
import { Eraser } from 'lucide-react'

/** Finger / mouse signature capture. Emits a PNG data URL, or '' when cleared. */
export const SignaturePad = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const dirty = useRef(false)

  useEffect(() => {
    const c = canvas.current!
    const ratio = window.devicePixelRatio || 1
    c.width = c.clientWidth * ratio
    c.height = c.clientHeight * ratio
    const ctx = c.getContext('2d')!
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f172a'
    if (value) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, c.clientWidth, c.clientHeight)
      img.src = value
    }
    // Only paint the initial value once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  return (
    <div className="relative">
      <canvas
        ref={canvas}
        className="h-32 w-full touch-none rounded-lg border border-slate-300 bg-white"
        onPointerDown={(e) => {
          try {
            canvas.current!.setPointerCapture(e.pointerId)
          } catch {
            /* capture is a nicety — drawing works without it */
          }
          drawing.current = true
          const ctx = canvas.current!.getContext('2d')!
          const p = pos(e)
          ctx.beginPath()
          ctx.moveTo(p.x, p.y)
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return
          const ctx = canvas.current!.getContext('2d')!
          const p = pos(e)
          ctx.lineTo(p.x, p.y)
          ctx.stroke()
          dirty.current = true
        }}
        onPointerUp={() => {
          drawing.current = false
          if (dirty.current) onChange(canvas.current!.toDataURL('image/png'))
        }}
      />
      {!value && <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-slate-400">Sign here</span>}
      <button
        type="button"
        className="absolute top-2 right-2 rounded-md bg-white/80 p-1 text-slate-400 hover:text-slate-700"
        onClick={() => {
          const c = canvas.current!
          c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
          dirty.current = false
          onChange('')
        }}
        title="Clear"
      >
        <Eraser size={16} />
      </button>
    </div>
  )
}

/** Shrink a photo before storing it — phones produce 4–12 MB images. */
export const compressPhoto = (file: File, max = 1280, quality = 0.78) =>
  new Promise<string>((res, rej) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
      const c = document.createElement('canvas')
      c.width = Math.round(img.naturalWidth * k)
      c.height = Math.round(img.naturalHeight * k)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      res(c.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => (URL.revokeObjectURL(url), rej(new Error('Could not read photo')))
    img.src = url
  })
