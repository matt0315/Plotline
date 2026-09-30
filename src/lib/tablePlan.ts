import { jsPDF } from 'jspdf'
import autoTable, { type CellInput, type RowInput } from 'jspdf-autotable'
import type { EventDoc, EventType, Guest, PaperSize, TablePlanLayout, TablePlanStyle } from '../types/event'
import { isSeating } from './geometry'
import { embedFonts, FONTS, isFont, STYLES, type FontKey } from './fonts'
import { watermarkPage } from './pdf'
import { slug } from './share'

export const PAPERS: Record<PaperSize, { label: string; w: number; h: number }> = {
  a4: { label: 'A4', w: 595.28, h: 841.89 },
  a3: { label: 'A3', w: 841.89, h: 1190.55 },
  letter: { label: 'US Letter', w: 612, h: 792 },
  a2: { label: 'A2 poster', w: 1190.55, h: 1683.78 },
  a1: { label: 'A1 poster', w: 1683.78, h: 2383.94 },
  p18x24: { label: '18 × 24″ poster', w: 1296, h: 1728 },
  p24x36: { label: '24 × 36″ poster', w: 1728, h: 2592 },
}

export const LAYOUTS: Record<TablePlanLayout, { label: string; blurb: string; file: string }> = {
  alpha: { label: 'Find your seat', blurb: 'Guests A–Z with their table', file: 'find-your-seat' },
  tables: { label: 'By table', blurb: 'Each table with its guests', file: 'table-plan' },
  cards: { label: 'Table cards', blurb: 'One card per table', file: 'table-cards' },
  caterer: { label: 'Caterer sheet', blurb: 'By table, with dietary needs', file: 'caterer-sheet' },
}

const STYLE_FOR: Record<EventType, string> = { wedding: 'romantic', corporate: 'modern', festival: 'modern', private: 'classic' }

/** Letter-size countries; everyone else prints on A4. */
const usesLetter = () => typeof navigator !== 'undefined' && /-(US|CA|MX|PH)$/i.test(navigator.language)

export const defaultTablePlan = (d: EventDoc): TablePlanStyle => {
  const st = STYLES.find((s) => s.id === STYLE_FOR[d.type]) ?? STYLES[0]
  return {
    layout: 'alpha',
    style: st.id,
    headingFont: st.heading,
    bodyFont: st.body,
    accent: st.accent,
    paper: usesLetter() ? 'letter' : 'a4',
    orientation: 'portrait',
    title: d.name,
    subtitle: d.date ? new Date(d.date + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '',
    note: 'Please find your seat',
    dietary: false,
    sortBy: 'last',
    cardsPerPage: 1,
  }
}

/** Saved settings over defaults, with anything unknown (e.g. a removed font) repaired. */
export const resolveTablePlan = (d: EventDoc): TablePlanStyle => {
  const s = { ...defaultTablePlan(d), ...d.tablePlan }
  const st = STYLES.find((x) => x.id === s.style) ?? STYLES[0]
  if (!isFont(s.headingFont)) s.headingFont = st.heading
  if (!isFont(s.bodyFont)) s.bodyFont = st.body
  if (!(s.paper in PAPERS)) s.paper = 'a4'
  if (!(s.layout in LAYOUTS)) s.layout = 'alpha'
  return s
}

export const tablePlanFilename = (d: EventDoc, s: TablePlanStyle) => `${slug(d.name)}-${LAYOUTS[s.layout].file}.pdf`

// ---------- Data ----------

interface PlanTable {
  id: string
  label: string
  seats: number
  guests: Guest[]
}

const byLabel = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })

/** Tables in label order with their attending guests, plus a count of attending guests with no seat. */
export const seatingData = (d: EventDoc) => {
  const attending = d.guests.filter((g) => g.rsvp !== 'no')
  const at = new Map<string, Guest[]>()
  for (const g of attending) if (g.seat) at.set(g.seat.itemId, [...(at.get(g.seat.itemId) ?? []), g])
  const tables: PlanTable[] = d.layout.items
    .filter((i) => isSeating(i) && (i.kind !== 'chair' || at.has(i.id)))
    .map((i) => ({ id: i.id, label: i.label?.trim() || 'Table', seats: i.seats, guests: (at.get(i.id) ?? []).sort((a, b) => a.seat!.index - b.seat!.index) }))
    .sort((a, b) => byLabel(a.label, b.label))
  const ids = new Set(tables.map((t) => t.id))
  const seated = tables.flatMap((t) => t.guests.map((g) => ({ guest: g, table: t.label })))
  return { tables, seated, unseated: attending.filter((g) => !g.seat || !ids.has(g.seat.itemId)).length }
}

const surname = (name: string) => {
  const parts = name.trim().split(/\s+/)
  return parts[parts.length - 1] ?? ''
}

// ---------- Drawing ----------

type RGB = [number, number, number]
const rgb = (hex: string): RGB => {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16)
  return Number.isNaN(n) ? [30, 41, 59] : [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const INK: RGB = [30, 41, 59]
const MUTED: RGB = [100, 116, 139]
const HAIR: RGB = [203, 213, 225]

interface Ctx {
  p: jsPDF
  s: TablePlanStyle
  hf: FontKey
  bf: FontKey
  W: number
  H: number
  /** 1 on A4 portrait; scales type and spacing up for posters. */
  u: number
  m: number
  accent: RGB
  fmt: [number, number]
}

const headFont = (c: Ctx, size: number, bold = false) => c.p.setFont(c.hf, bold ? 'bold' : 'normal').setFontSize(size * FONTS[c.hf].scale)
const bodyFont = (c: Ctx, size: number, bold = false) => c.p.setFont(c.bf, bold ? 'bold' : 'normal').setFontSize(size * FONTS[c.bf].scale)
/** Width of text at a font size, without leaving the font changed for callers that care. */
const widthOf = (c: Ctx, font: FontKey, text: string, size: number, bold = false) => {
  c.p.setFont(font, bold ? 'bold' : 'normal')
  return c.p.getStringUnitWidth(text) * size * FONTS[font].scale
}

/** Letter-spaced text centred on cx (jsPDF's own centring ignores charSpace). */
const spaced = (c: Ctx, text: string, cx: number, y: number, charSpace: number) => {
  const w = c.p.getTextWidth(text) + charSpace * Math.max(0, text.length - 1)
  c.p.text(text, cx - w / 2, y, { charSpace })
}

const ornament = (c: Ctx, cx: number, y: number, half: number) => {
  const { p, u } = c
  const d = 3.2 * u
  p.setDrawColor(...c.accent).setFillColor(...c.accent).setLineWidth(0.6 * u)
  p.line(cx - half, y, cx - d * 2, y)
  p.line(cx + d * 2, y, cx + half, y)
  p.triangle(cx - d, y, cx, y - d, cx + d, y, 'F')
  p.triangle(cx - d, y, cx, y + d, cx + d, y, 'F')
}

/** Title, subtitle, ornament and note, centred. Returns the y below it. */
const header = (c: Ctx, top: number, k = 1) => {
  const { p, s, u, W, m } = c
  const cx = W / 2
  let y = top
  if (s.title.trim()) {
    const size = 30 * u * k
    headFont(c, size).setTextColor(...c.accent)
    const lines: string[] = p.splitTextToSize(s.title.trim(), W - m * 2)
    for (const l of lines) {
      y += size * FONTS[c.hf].scale * 1.05
      p.text(l, cx, y, { align: 'center' })
    }
    y += 6 * u * k
  }
  if (s.subtitle.trim()) {
    const size = 11.5 * u * k
    bodyFont(c, size).setTextColor(...MUTED)
    y += size * 1.3
    p.text(s.subtitle.trim(), cx, y, { align: 'center', maxWidth: W - m * 2 })
  }
  y += 14 * u * k
  ornament(c, cx, y, 60 * u * k)
  y += 8 * u * k
  if (s.note.trim()) {
    const size = 9 * u * k
    bodyFont(c, size).setTextColor(...INK)
    y += size * 1.8
    spaced(c, s.note.trim().toUpperCase(), cx, y, 2.2 * u * k)
  }
  return y + 22 * u * k
}

/** Greedy flow of rows down columns and across pages. keep[i] holds row i with the next one (letter headings). */
const flow = (heights: number[], keep: boolean[], cols: number, firstTop: number, top: number, bottom: number) => {
  const at: { page: number; col: number; y: number }[] = []
  let page = 0
  let col = 0
  let y = firstTop
  for (let i = 0; i < heights.length; i++) {
    const start = page === 0 ? firstTop : top
    const need = heights[i] + (keep[i] && i + 1 < heights.length ? heights[i + 1] : 0)
    if (y + need > bottom && y > start + 0.01) {
      if (++col === cols) (col = 0), page++
      y = page === 0 ? firstTop : top
    }
    at.push({ page, col, y })
    y += heights[i]
  }
  return { at, pages: page + 1 }
}

/** Shortest column height that still fits one page, so short lists don't pile into the first column. */
const balance = (heights: number[], keep: boolean[], cols: number, top: number, bottom: number) => {
  const total = heights.reduce((a, b) => a + b, 0)
  let lo = Math.min(bottom, top + total / cols)
  let hi = bottom
  if (flow(heights, keep, cols, top, top, lo).pages === 1) return lo
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    if (flow(heights, keep, cols, top, top, mid).pages === 1) hi = mid
    else lo = mid
  }
  return hi
}

const ellipsize = (c: Ctx, font: FontKey, text: string, size: number, max: number) => {
  if (widthOf(c, font, text, size) <= max) return text
  let t = text
  while (t.length > 1 && widthOf(c, font, t + '…', size) > max) t = t.slice(0, -1)
  return t.trimEnd() + '…'
}

const newPage = (c: Ctx) => c.p.addPage(c.fmt, c.fmt[0] > c.fmt[1] ? 'landscape' : 'portrait')

const emptyNote = (c: Ctx, y: number) => {
  bodyFont(c, 12 * c.u).setTextColor(...MUTED)
  c.p.text('No one is seated yet.', c.W / 2, y + 20 * c.u, { align: 'center' })
}

// ---------- Layouts ----------

const drawAlpha = (c: Ctx, data: ReturnType<typeof seatingData>) => {
  const { p, s, u, W, H, m } = c
  const top0 = header(c, m)
  if (!data.seated.length) return emptyNote(c, top0)
  const key = (g: Guest) => (s.sortBy === 'last' ? `${surname(g.name)} ${g.name}` : g.name)
  const entries = data.seated
    .map((e) => ({ ...e, key: key(e.guest) }))
    .sort((a, b) => a.key.localeCompare(b.key, undefined, { sensitivity: 'base' }))

  type Row = { letter: string } | { name: string; diet: string; table: string }
  const rows: Row[] = []
  let last = ''
  for (const e of entries) {
    // É files under E, matching how the sort treats it.
    const ch = e.key.trim().normalize('NFD').charAt(0).toLocaleUpperCase()
    const letter = /\p{L}/u.test(ch) ? ch : '#'
    if (letter !== last) rows.push({ letter }), (last = letter)
    rows.push({ name: e.guest.name, diet: s.dietary ? e.guest.dietary.trim() : '', table: e.table })
  }

  const bottom = H - m - 16 * u
  const gap = 20 * u
  const widthFor = (n: number) => (W - m * 2 - gap * (n - 1)) / n
  const heightsAt = (fs: number, lead = 1.55) => rows.map((r) => ('letter' in r ? fs * lead * 1.75 : fs * lead))
  const keep = rows.map((r) => 'letter' in r)
  // Widest entry at 1pt, so any size is a multiplication.
  const need1 = Math.max(
    ...rows.map((r) => ('letter' in r ? 0 : widthOf(c, c.bf, r.name, 1) + (r.diet ? widthOf(c, c.bf, `  ${r.diet}`, 0.8) : 0) + widthOf(c, c.bf, r.table, 1) + 3)),
  )

  // Try each column count and keep whichever fits one page at the largest type.
  const most = Math.max(1, Math.min(6, Math.round((W - m * 2) / (150 * u))))
  let cols = Math.max(1, Math.min(6, Math.round((W - m * 2) / (170 * u))))
  let fs = 0
  for (let n = most; n >= 1; n--) {
    for (let f = 15 * u; f > fs; f -= 0.25 * u) {
      if (need1 * f > widthFor(n)) continue
      if (flow(heightsAt(f), keep, n, top0, m, bottom).pages === 1) {
        fs = f
        cols = n
        break
      }
    }
  }
  const colW = widthFor(cols)
  const onePage = fs > 0
  if (!onePage) fs = Math.max(7 * u, Math.min(10 * u, (colW - 10 * u) / need1))
  // When long names cap the type size, open up the line spacing so the list still fills the sheet.
  let lead = 1.55
  while (onePage && lead < 2.4 && flow(heightsAt(fs, lead + 0.05), keep, cols, top0, m, bottom).pages === 1) lead += 0.05
  const heights = heightsAt(fs, lead)
  const colBottom = onePage ? balance(heights, keep, cols, top0, bottom) : bottom
  const { at } = flow(heights, keep, cols, top0, m, colBottom)

  let page = 0
  rows.forEach((r, i) => {
    const pos = at[i]
    while (page < pos.page) newPage(c), page++
    const x = m + pos.col * (colW + gap)
    const base = pos.y + heights[i] * ('letter' in r ? 0.78 : 0.7)
    if ('letter' in r) {
      headFont(c, fs * 1.45).setTextColor(...c.accent)
      p.text(r.letter, x, base)
      const lw = p.getTextWidth(r.letter)
      p.setDrawColor(...HAIR).setLineWidth(0.5 * u).line(x + lw + 6 * u, base - fs * 0.35, x + colW, base - fs * 0.35)
      return
    }
    bodyFont(c, fs).setTextColor(...c.accent)
    const tw = p.getTextWidth(r.table)
    p.text(r.table, x + colW, base, { align: 'right' })
    const dietW = r.diet ? widthOf(c, c.bf, `  ${r.diet}`, fs * 0.8) : 0
    const name = ellipsize(c, c.bf, r.name, fs, colW - tw - dietW - 10 * u)
    bodyFont(c, fs).setTextColor(...INK)
    p.text(name, x, base)
    let end = x + p.getTextWidth(name)
    if (r.diet) {
      bodyFont(c, fs * 0.8).setTextColor(...MUTED)
      p.text(`  ${r.diet}`, end, base)
      end += p.getTextWidth(`  ${r.diet}`)
    }
    // Dotted leader from name to table.
    const from = end + 5 * u
    const to = x + colW - tw - 5 * u
    if (to - from > 6 * u) {
      p.setDrawColor(...HAIR).setLineWidth(0.9 * u).setLineCap('round').setLineDashPattern([0.01, 2.6 * u], 0)
      p.line(from, base - 1 * u, to, base - 1 * u)
      p.setLineDashPattern([], 0).setLineCap('butt')
    }
  })
}

const drawTables = (c: Ctx, data: ReturnType<typeof seatingData>) => {
  const { p, s, u, W, H, m } = c
  const top0 = header(c, m)
  const tables = data.tables.filter((t) => t.guests.length)
  if (!tables.length) return emptyNote(c, top0)

  const bottom = H - m - 16 * u
  const cols = Math.max(1, Math.min(6, Math.round((W - m * 2) / (175 * u))))
  const gapX = 18 * u
  const gapY = 16 * u
  const colW = (W - m * 2 - gapX * (cols - 1)) / cols
  const nameLine = (g: Guest) => (s.dietary && g.dietary.trim() ? `${g.name} (${g.dietary.trim()})` : g.name)
  const blockH = (t: PlanTable, fs: number) => fs * 1.45 * FONTS[c.hf].scale * 1.3 + 10 * u + t.guests.length * fs * 1.5 + fs * 0.6
  const rowsOf = <T,>(list: T[]) => Array.from({ length: Math.ceil(list.length / cols) }, (_, i) => list.slice(i * cols, i * cols + cols))
  const rows = rowsOf(tables)
  const widest1 = Math.max(...tables.flatMap((t) => [widthOf(c, c.hf, t.label, 1.45), ...t.guests.map((g) => widthOf(c, c.bf, nameLine(g), 1))]))

  const pagesAt = (fs: number) => {
    let y = top0
    let pages = 1
    for (const r of rows) {
      const h = Math.max(...r.map((t) => blockH(t, fs)))
      if (y + h > bottom && y > (pages === 1 ? top0 : m)) (pages++, (y = m))
      y += h + gapY
    }
    return pages
  }
  let fs = 0
  for (let f = 14 * u; f >= 6.5 * u; f -= 0.25 * u) {
    if (widest1 * f > colW - 8 * u) continue
    if (pagesAt(f) === 1) {
      fs = f
      break
    }
  }
  if (!fs) fs = Math.max(8 * u, Math.min(11 * u, (colW - 8 * u) / widest1))

  let y = top0
  let first = true
  for (const r of rows) {
    const h = Math.max(...r.map((t) => blockH(t, fs)))
    if (y + h > bottom && y > (first ? top0 : m)) (newPage(c), (y = m), (first = false))
    r.forEach((t, i) => {
      const cx = m + i * (colW + gapX) + colW / 2
      const th = fs * 1.45
      let yy = y + th * FONTS[c.hf].scale
      headFont(c, th).setTextColor(...c.accent)
      p.text(ellipsize(c, c.hf, t.label, th, colW), cx, yy, { align: 'center' })
      yy += fs * 0.55 + 4 * u
      p.setDrawColor(...c.accent).setLineWidth(0.6 * u).line(cx - 16 * u, yy, cx + 16 * u, yy)
      yy += 6 * u
      bodyFont(c, fs).setTextColor(...INK)
      for (const g of t.guests) {
        yy += fs * 1.5
        p.text(ellipsize(c, c.bf, nameLine(g), fs, colW), cx, yy - fs * 0.4, { align: 'center' })
      }
    })
    y += h + gapY
  }
}

const drawCards = (c: Ctx, data: ReturnType<typeof seatingData>) => {
  const { p, s, W, H } = c
  const tables = data.tables.filter((t) => t.guests.length)
  if (!tables.length) return emptyNote(c, header(c, c.m))
  const per = s.cardsPerPage
  // Two per page: split across the long side, with a dashed cut line.
  const splitVert = W > H
  const cw = per === 2 && splitVert ? W / 2 : W
  const ch = per === 2 && !splitVert ? H / 2 : H
  tables.forEach((t, i) => {
    const slot = i % per
    if (i > 0 && slot === 0) newPage(c)
    const x0 = per === 2 && splitVert ? slot * cw : 0
    const y0 = per === 2 && !splitVert ? slot * ch : 0
    if (per === 2 && slot === 0) {
      p.setDrawColor(...HAIR).setLineWidth(0.5).setLineDashPattern([4, 4], 0)
      if (splitVert) p.line(W / 2, 0, W / 2, H)
      else p.line(0, H / 2, W, H / 2)
      p.setLineDashPattern([], 0)
    }
    const k = Math.min(cw, ch) / 595.28
    const mm = 48 * k
    const cx = x0 + cw / 2
    const inner = cw - mm * 2
    // Thin inset frame.
    p.setDrawColor(...c.accent).setLineWidth(0.8 * k).rect(x0 + mm * 0.55, y0 + mm * 0.55, cw - mm * 1.1, ch - mm * 1.1)

    let size = 54 * k
    while (size > 14 * k && widthOf(c, c.hf, t.label, size) > inner) size -= 1 * k
    let y = y0 + mm + ch * 0.1 + size * FONTS[c.hf].scale
    headFont(c, size).setTextColor(...c.accent)
    p.text(t.label, cx, y, { align: 'center' })
    y += 18 * k
    ornament(c, cx, y, 50 * k)
    y += 26 * k

    const foot = s.title.trim() ? 28 * k : 0
    const avail = y0 + ch - mm - foot - y
    const names = t.guests.map((g) => (s.dietary && g.dietary.trim() ? `${g.name} (${g.dietary.trim()})` : g.name))
    const widest1 = Math.max(...names.map((n) => widthOf(c, c.bf, n, 1)))
    const fs = Math.max(7 * k, Math.min(20 * k, avail / (names.length * 1.6), inner / widest1))
    // Short lists sit a little above centre in the space left, not bunched under the name.
    y += Math.max(0, (avail - names.length * fs * 1.6) * 0.35)
    bodyFont(c, fs).setTextColor(...INK)
    for (const n of names) {
      y += fs * 1.6
      p.text(n, cx, y - fs * 0.45, { align: 'center' })
    }
    if (foot) {
      bodyFont(c, 9 * k).setTextColor(...MUTED)
      spaced(c, s.title.trim().toUpperCase(), cx, y0 + ch - mm - 4 * k, 1.6 * k)
    }
  })
}

const drawCaterer = (c: Ctx, data: ReturnType<typeof seatingData>) => {
  const { p, s, u, m } = c
  const tables = data.tables.filter((t) => t.guests.length)
  const guests = tables.reduce((n, t) => n + t.guests.length, 0)
  headFont(c, 22 * u).setTextColor(...c.accent)
  p.text(s.title.trim() || 'Seating', m, m + 20 * u)
  bodyFont(c, 10 * u).setTextColor(...MUTED)
  p.text([`Caterer sheet · ${guests} guests at ${tables.length} tables`, s.subtitle.trim()].filter(Boolean).join(' · '), m, m + 38 * u)

  const diets = new Map<string, { label: string; n: number; tables: Set<string> }>()
  for (const t of tables)
    for (const g of t.guests) {
      const dl = g.dietary.trim()
      if (!dl) continue
      const hit = diets.get(dl.toLowerCase()) ?? { label: dl, n: 0, tables: new Set<string>() }
      hit.n++
      hit.tables.add(t.label)
      diets.set(dl.toLowerCase(), hit)
    }

  const tint = c.accent.map((v) => Math.round(255 - (255 - v) * 0.1)) as RGB
  const styles = { font: c.bf, fontSize: 9 * u, cellPadding: { top: 3 * u, bottom: 3 * u, left: 4.5 * u, right: 4.5 * u }, textColor: INK, lineColor: [226, 232, 240] as RGB, lineWidth: 0.5 * u }
  const headStyles = { fillColor: [248, 250, 252] as RGB, textColor: MUTED, fontStyle: 'bold' as const }

  const body: RowInput[] = []
  const dietRow = new Set<number>()
  for (const t of tables)
    t.guests.forEach((g, i) => {
      const row: CellInput[] = [g.name, g.dietary.trim()]
      if (i === 0) row.unshift({ content: t.label, rowSpan: t.guests.length, styles: { fontStyle: 'bold', valign: 'top' } }, { content: `${t.guests.length}/${t.seats}`, rowSpan: t.guests.length, styles: { valign: 'top', halign: 'center' } })
      if (g.dietary.trim()) dietRow.add(body.length)
      body.push(row)
    })
  autoTable(p, {
    startY: m + 54 * u,
    margin: { left: m, right: m, top: m, bottom: m },
    head: [['Table', 'Seated', 'Guest', 'Dietary']],
    body: body.length ? body : [[{ content: 'No one is seated yet.', colSpan: 4 }]],
    theme: 'grid',
    styles,
    headStyles,
    columnStyles: { 0: { cellWidth: 100 * u }, 1: { cellWidth: 48 * u } },
    didParseCell: (h) => {
      if (h.section === 'body' && h.column.index >= 2 && dietRow.has(h.row.index)) h.cell.styles.fillColor = tint
    },
  })

  if (diets.size) {
    const y = (p as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable!.finalY + 28 * u
    headFont(c, 14 * u).setTextColor(...c.accent)
    p.text('Dietary summary', m, y)
    autoTable(p, {
      startY: y + 10 * u,
      margin: { left: m, right: m, top: m, bottom: m },
      head: [['Requirement', 'Guests', 'Tables']],
      body: [...diets.values()].sort((a, b) => b.n - a.n).map((x) => [x.label, String(x.n), [...x.tables].sort(byLabel).join(', ')]),
      theme: 'grid',
      styles,
      headStyles,
      columnStyles: { 1: { cellWidth: 60 * u, halign: 'center' } },
    })
  }
}

/** Build the table plan PDF. Guest-facing, so Pro exports carry no footer at all. */
export const renderTablePlan = async (d: EventDoc, s: TablePlanStyle, watermark: boolean) => {
  const paper = PAPERS[s.paper] ?? PAPERS.a4
  const land = s.layout === 'caterer' ? false : s.orientation === 'landscape'
  const fmt: [number, number] = land ? [paper.h, paper.w] : [paper.w, paper.h]
  const p = new jsPDF({ unit: 'pt', format: fmt, orientation: land ? 'landscape' : 'portrait' })
  const hf = isFont(s.headingFont) ? s.headingFont : 'playfair'
  const bf = isFont(s.bodyFont) ? s.bodyFont : 'lora'
  await embedFonts(p, [hf, bf])
  const u = Math.min(fmt[0], fmt[1]) / 595.28
  const c: Ctx = { p, s, hf, bf, W: fmt[0], H: fmt[1], u, m: 42 * u, accent: rgb(s.accent), fmt }
  p.setProperties({ title: `${s.title || d.name} — ${LAYOUTS[s.layout].label}` })
  const data = seatingData(d)
  if (s.layout === 'alpha') drawAlpha(c, data)
  else if (s.layout === 'tables') drawTables(c, data)
  else if (s.layout === 'cards') drawCards(c, data)
  else drawCaterer(c, data)
  if (watermark)
    for (let i = 1; i <= p.getNumberOfPages(); i++) {
      p.setPage(i)
      watermarkPage(p)
    }
  return p
}
