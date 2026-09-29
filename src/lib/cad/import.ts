/**
 * Venue drawing import. Every format ends up as one PNG plus a
 * metres-per-pixel scale, so the floor plan treats them all the same.
 * DXF, PDF and images are parsed entirely in the browser.
 */
import type { PlanSource } from '../../types/event'

export interface ImportedPlan {
  source: PlanSource
  image: string
  natW: number
  natH: number
  metersPerPx: number
  calibratedBy: 'units' | 'guess'
  /** Human note on where the scale came from. */
  scaleNote: string
  /** PDF only — lets the user pick the printed drawing scale. */
  pdfPointsPerPx?: number
}

const MAX_PX = 4096
const GUESS_WIDTH_M = 30

const canvasToPng = (c: HTMLCanvasElement) => c.toDataURL('image/png')

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image()
    img.onload = () => res(img)
    img.onerror = () => rej(new Error('Could not read that image'))
    img.src = src
  })

/* ---------- Images ---------- */

export const importImage = async (file: File): Promise<ImportedPlan> => {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const k = Math.min(1, MAX_PX / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(img.naturalWidth * k)
    c.height = Math.round(img.naturalHeight * k)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return {
      source: 'image',
      image: canvasToPng(c),
      natW: c.width,
      natH: c.height,
      metersPerPx: GUESS_WIDTH_M / c.width,
      calibratedBy: 'guess',
      scaleNote: "Photos and images don't carry a scale — you'll set it by drawing along one known wall.",
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/* ---------- PDF ---------- */

export const importPdf = async (file: File): Promise<ImportedPlan> => {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const page = await pdf.getPage(1)
  const base = page.getViewport({ scale: 1 })
  const scale = Math.min(6, MAX_PX / Math.max(base.width, base.height))
  const vp = page.getViewport({ scale })
  const c = document.createElement('canvas')
  c.width = Math.round(vp.width)
  c.height = Math.round(vp.height)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  await page.render({ canvasContext: ctx, viewport: vp, canvas: c }).promise
  return {
    source: 'pdf',
    image: canvasToPng(c),
    natW: c.width,
    natH: c.height,
    metersPerPx: GUESS_WIDTH_M / c.width,
    calibratedBy: 'guess',
    scaleNote: pdf.numPages > 1 ? `Using page 1 of ${pdf.numPages}.` : '',
    pdfPointsPerPx: 1 / scale,
  }
}

/** If a PDF was printed at a known scale (e.g. 1:100), work the scale out exactly. */
export const pdfScale = (pointsPerPx: number, ratio: number) => pointsPerPx * (0.0254 / 72) * ratio

/* ---------- DXF ---------- */

// $INSUNITS codes → metres per drawing unit.
const UNITS: Record<number, [number, string]> = {
  1: [0.0254, 'inches'],
  2: [0.3048, 'feet'],
  4: [0.001, 'millimetres'],
  5: [0.01, 'centimetres'],
  6: [1, 'metres'],
  14: [0.1, 'decimetres'],
}

export const importDxfText = async (text: string, source: PlanSource = 'dxf'): Promise<ImportedPlan> => {
  const { Helper } = await import('dxf')
  const helper = new Helper(text)
  let svg = helper.toSVG()
  const vb = /viewBox="([-\d.e]+) ([-\d.e]+) ([-\d.e]+) ([-\d.e]+)"/.exec(svg)
  if (!vb) throw new Error('No drawing found in that file')
  const vw = parseFloat(vb[3])
  const vh = parseFloat(vb[4])
  if (!(vw > 0 && vh > 0)) throw new Error("That file doesn't contain any geometry we can draw")

  const code = (helper.parsed as { header?: { insUnits?: number } }).header?.insUnits
  let unit = code ? UNITS[code] : undefined
  let calibratedBy: 'units' | 'guess' = 'units'
  let note = unit ? `Scale read from the file: drawing units are ${unit[1]}.` : ''
  if (!unit) {
    // No units declared. Venue drawings are almost always mm or m; judge by size.
    calibratedBy = 'guess'
    unit = vw > 2000 ? UNITS[4] : vw > 200 ? UNITS[5] : UNITS[6]
    note = `The file doesn't say its units, so we assumed ${unit[1]}. Check it against a known wall.`
  }

  const k = Math.min(MAX_PX / Math.max(vw, vh), 20000)
  // Lines about 5 cm thick in the real world (never thinner than 1.5 px), so walls read at any zoom.
  const stroke = Math.max(0.05 / unit[0], Math.max(vw, vh) * 0.0012, 1.5 / k)
  const pw = Math.max(1, Math.round(vw * k))
  const ph = Math.max(1, Math.round(vh * k))
  svg = svg.replace('width="100%" height="100%"', `width="${pw}" height="${ph}"`).replace('stroke-width="0.1%"', `stroke-width="${stroke.toFixed(6)}"`)

  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = await loadImage(url)
    const c = document.createElement('canvas')
    c.width = pw
    c.height = ph
    c.getContext('2d')!.drawImage(img, 0, 0, pw, ph)
    return {
      source,
      image: canvasToPng(c),
      natW: pw,
      natH: ph,
      metersPerPx: (vw * unit[0]) / pw,
      calibratedBy,
      scaleNote: note,
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export const importDxf = async (file: File) => importDxfText(await file.text())

/* ---------- DWG (server-side conversion) ---------- */

/**
 * DWG is converted to DXF by CloudConvert behind our /api/convert-dwg Worker route.
 * The browser uploads straight to CloudConvert, so file size isn't limited by our host.
 */
export const importDwg = async (file: File, onStatus: (s: string) => void): Promise<ImportedPlan> => {
  // The session cookie authenticates us to /api/convert-dwg.
  const auth = {}
  onStatus('Preparing conversion…')
  const start = await fetch('/api/convert-dwg', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name }) })
  const job = await start.json()
  if (!start.ok) throw new Error(job.error || 'Could not start conversion')

  onStatus('Uploading drawing…')
  const form = new FormData()
  for (const [k, v] of Object.entries(job.upload.parameters as Record<string, string>)) form.append(k, v)
  form.append('file', file)
  const up = await fetch(job.upload.url, { method: 'POST', body: form })
  if (!up.ok) throw new Error('Upload failed')

  onStatus('Converting DWG to DXF…')
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    const res = await fetch(`/api/convert-dwg?job=${encodeURIComponent(job.id)}`, { headers: auth })
    if (res.status === 202) continue
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Conversion failed')
    onStatus('Drawing plan…')
    return importDxfText(await res.text(), 'dwg')
  }
  throw new Error('Conversion timed out — try exporting DXF from your CAD app instead')
}

export const kindOf = (f: File): PlanSource | null => {
  const ext = f.name.split('.').pop()?.toLowerCase()
  if (ext === 'dxf') return 'dxf'
  if (ext === 'dwg') return 'dwg'
  if (ext === 'pdf' || f.type === 'application/pdf') return 'pdf'
  if (f.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'heic'].includes(ext ?? '')) return 'image'
  return null
}
