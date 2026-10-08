import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { DocForm, DocResponse, EventDoc } from '../types/event'
import { StaticPlan } from '../modules/Layout/render'
import { storage } from '../store/persistence'
import { usePlans } from '../store/plans'
import { useAccount } from '../store/account'
import { budgetTotals, crewCost, lineActual, linePaid, loadList, runSheet, seatingStats } from './derived'
import { EVENT_TEMPLATES } from '../data/eventTemplates'
import { pdfMoneyFor } from './money'
import { kitRows } from './kit'
import { fmt12 } from './time'
import { crewHours, dayTitle, sortShifts } from './roster'
import { isSeating } from './geometry'
import { BRAND } from './brand'
import { slug } from './share'

export type Section = 'cover' | 'layout' | 'site' | 'seating' | 'placecards' | 'guests' | 'run' | 'suppliers' | 'crew' | 'budget' | 'load'

export const SECTION_LABELS: Record<Section, string> = {
  cover: 'Cover & summary',
  layout: 'Floor plan',
  site: 'Site map',
  seating: 'Seating chart',
  placecards: 'Place cards',
  guests: 'Guest list',
  run: 'Run sheet',
  suppliers: 'Suppliers',
  crew: 'Crew roster',
  budget: 'Budget',
  load: 'Load list',
}

const INK: [number, number, number] = [15, 23, 42]
const MUTED: [number, number, number] = [100, 116, 139]
const BRAND_RGB: [number, number, number] = [79, 70, 229]

type Doc = jsPDF & { lastAutoTable?: { finalY: number } }

const W = (p: jsPDF) => p.internal.pageSize.getWidth()
const H = (p: jsPDF) => p.internal.pageSize.getHeight()
const M = 40

const heading = (p: jsPDF, title: string, sub?: string) => {
  p.setFont('helvetica', 'bold').setFontSize(18).setTextColor(...INK).text(title, M, M + 8)
  if (sub) p.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...MUTED).text(sub, M, M + 26)
  return M + (sub ? 44 : 30)
}

const table = (p: Doc, startY: number, head: string[], body: (string | number)[][], opts: Partial<Parameters<typeof autoTable>[1]> = {}) => {
  autoTable(p, {
    startY,
    head: [head],
    body: body.map((r) => r.map(String)),
    margin: { left: M, right: M, bottom: 50 },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, textColor: INK, lineColor: [226, 232, 240], lineWidth: 0.5 },
    headStyles: { fillColor: [248, 250, 252], textColor: MUTED, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [255, 255, 255] },
    theme: 'grid',
    ...opts,
  })
  return (p.lastAutoTable?.finalY ?? startY) + 20
}

const newPage = (p: jsPDF, first: { v: boolean }, orientation: 'portrait' | 'landscape') => {
  if (first.v) {
    first.v = false
    return
  }
  p.addPage('letter', orientation)
}

/** Floor plan as vector, falling back to a raster if the SVG converter trips. */
const drawPlan = async (p: jsPDF, d: EventDoc, x: number, y: number, w: number, h: number) => {
  const bp = d.layout.basePlan
  const plan = bp ? (usePlans.getState().cache[bp.planId] ?? (await storage().loadPlan(bp.planId))) : null
  const markup = renderToStaticMarkup(
    createElement(StaticPlan, {
      items: d.layout.items,
      spaces: d.layout.spaces,
      guests: d.guests,
      base: plan && bp ? { plan, placement: bp } : undefined,
    }),
  )
  // PDF Helvetica only has normal and bold.
  const pdfMarkup = markup.replace(/font-weight="600"/g, 'font-weight="bold"').replace(/font-weight="500"/g, 'font-weight="normal"')
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-99999px;top:0;width:1200px;height:900px'
  host.innerHTML = pdfMarkup
  document.body.appendChild(host)
  const svg = host.querySelector('svg')!
  const vb = svg.viewBox.baseVal
  const k = Math.min(w / vb.width, h / vb.height)
  const dw = vb.width * k
  const dh = vb.height * k
  const ox = x + (w - dw) / 2
  const oy = y + (h - dh) / 2
  try {
    const { svg2pdf } = await import('svg2pdf.js')
    await svg2pdf(svg, p, { x: ox, y: oy, width: dw, height: dh })
  } catch (e) {
    console.warn('Vector export failed, using raster', e)
    const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }))
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = rej
      i.src = url
    })
    const c = document.createElement('canvas')
    c.width = Math.round(dw * 3)
    c.height = Math.round(dh * 3)
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    URL.revokeObjectURL(url)
    p.addImage(c.toDataURL('image/png'), 'PNG', ox, oy, dw, dh)
  } finally {
    host.remove()
  }
  // Scale note: metres per PDF point.
  const metres = 1 / k
  p.setFontSize(8).setTextColor(...MUTED).text(`Scale approx. 1 cm = ${((metres * 72) / 2.54).toFixed(2)} m`, x, y + h + 12)
}

/** Free-tier watermark on the current page, sized to the page. */
export const watermarkPage = (p: jsPDF) => {
  const k = Math.min(W(p), H(p)) / 612
  p.setFont('helvetica', 'normal').setFontSize(8 * k).setTextColor(180, 180, 200)
  p.text(`Made with ${BRAND} Free — upgrade to remove this watermark`, W(p) / 2, H(p) - 22 * k, { align: 'center' })
  p.saveGraphicsState()
  p.setGState(new (p as unknown as { GState: new (o: object) => unknown }).GState({ opacity: 0.08 }) as never)
  p.setFont('helvetica', 'bold').setFontSize(64 * k).setTextColor(79, 70, 229)
  p.text(BRAND, W(p) / 2, H(p) / 2, { align: 'center', angle: 30 })
  p.restoreGraphicsState()
}

const stamp = (p: jsPDF, d: EventDoc, watermark: boolean) => {
  const n = p.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    p.setPage(i)
    p.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED)
    p.text(`${d.name}${d.date ? ' · ' + new Date(d.date + 'T00:00').toLocaleDateString('en-US', { dateStyle: 'medium' }) : ''}`, M, H(p) - 22)
    p.text(`${i} / ${n}`, W(p) - M, H(p) - 22, { align: 'right' })
    if (watermark) watermarkPage(p)
  }
}

export const exportPack = async (d: EventDoc, sections: Section[]) => {
  const money = pdfMoneyFor(d.currency)
  const watermark = !useAccount.getState().isPro
  const firstLandscape = sections[0] === 'layout' || sections[0] === 'site' || sections[0] === 'seating'
  const p = new jsPDF({ unit: 'pt', format: 'letter', orientation: firstLandscape ? 'landscape' : 'portrait' }) as Doc
  const first = { v: true }
  const has = (s: Section) => sections.includes(s)
  const tableName = (id: string) => d.layout.items.find((i) => i.id === id)?.label || 'Table'

  if (has('cover')) {
    newPage(p, first, 'portrait')
    const st = seatingStats(d)
    const b = budgetTotals(d)
    p.setFillColor(...BRAND_RGB).rect(0, 0, W(p), 6, 'F')
    p.setFont('helvetica', 'bold').setFontSize(28).setTextColor(...INK).text(d.name, M, 110, { maxWidth: W(p) - M * 2 })
    p.setFont('helvetica', 'normal').setFontSize(13).setTextColor(...MUTED)
    const bits = [EVENT_TEMPLATES[d.type].label, d.date && new Date(d.date + 'T00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }), d.startTime && `from ${fmt12(d.startTime)}`].filter(Boolean)
    p.text(bits.join(' · '), M, 138)
    if (d.venue.name) p.text([d.venue.name, d.venue.address].filter(Boolean).join(' — '), M, 158, { maxWidth: W(p) - M * 2 })
    table(
      p,
      200,
      ['', ''],
      [
        ['Guests', `${d.guestCount} expected · ${d.guests.length} invited · ${d.guests.filter((g) => g.rsvp === 'yes').length} attending`],
        ['Seating', `${st.capacity} seats · ${st.seated} guests seated`],
        ['Suppliers', `${d.suppliers.filter((s) => s.status === 'booked' || s.status === 'paid').length} booked of ${d.suppliers.filter((s) => s.status !== 'declined').length}`],
        ['Crew', `${d.crew.length} people · ${d.shifts.length} rostered shifts`],
        ['Budget', `${money(b.forecast)} forecast${b.target ? ` vs ${money(b.target)} target` : ''} · ${money(b.paid)} paid`],
      ],
      { showHead: false, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 110 } } },
    )
    const contacts = d.suppliers.filter((s) => (s.status === 'booked' || s.status === 'paid') && (s.phone || s.contact))
    if (contacts.length) {
      p.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...INK).text('Key contacts', M, p.lastAutoTable!.finalY + 36)
      table(p, p.lastAutoTable!.finalY + 46, ['Supplier', 'Contact', 'Phone', 'Arrives'], contacts.map((s) => [`${s.name} (${s.category})`, s.contact, s.phone, s.arrival ? fmt12(s.arrival) : '']))
    }
  }

  if (has('layout')) {
    newPage(p, first, 'landscape')
    const y = heading(p, 'Floor plan', `${seatingStats(d).capacity} seats · ${d.layout.spaces.map((s) => `${s.name} ${s.w.toFixed(1)}×${s.h.toFixed(1)} m`).join(' · ')}`)
    await drawPlan(p, d, M, y, W(p) - M * 2, H(p) - y - 60)
  }

  if (has('site')) {
    newPage(p, first, 'landscape')
    const y = heading(p, 'Site map', [d.venue.name, `${d.site.items.length} assets`, `${d.site.zones.length} zones`].filter(Boolean).join(' · '))
    const { snapshotSite } = await import('./mapSnapshot')
    const snap = await snapshotSite(d)
    const bw = W(p) - M * 2
    const bh = H(p) - y - 60
    const k = Math.min(bw / snap.w, bh / snap.h)
    p.addImage(snap.png, 'JPEG', M + (bw - snap.w * k) / 2, y, snap.w * k, snap.h * k)
    p.setFontSize(7).setTextColor(...MUTED).text(snap.attribution, M + (bw + snap.w * k) / 2, y + snap.h * k + 10, { align: 'right' })
  }

  if (has('seating')) {
    const tables = d.layout.items.filter((i) => isSeating(i) && i.kind !== 'chair').sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
    newPage(p, first, 'landscape')
    const y0 = heading(p, 'Seating chart', `${seatingStats(d).seated} guests at ${tables.length} tables`)
    const cols = 4
    const cw = (W(p) - M * 2 - (cols - 1) * 12) / cols
    let x = M
    let y = y0
    let col = 0
    let rowH = 0
    for (const t of tables) {
      const guests = d.guests.filter((g) => g.seat?.itemId === t.id).sort((a, b) => a.seat!.index - b.seat!.index)
      const h = 26 + Math.max(1, guests.length) * 13 + 8
      if (y + h > H(p) - 50) {
        p.addPage('letter', 'landscape')
        y = M
        x = M
        col = 0
        rowH = 0
      }
      p.setDrawColor(226, 232, 240).roundedRect(x, y, cw, h, 4, 4)
      p.setFont('helvetica', 'bold').setFontSize(10).setTextColor(...INK).text(t.label || 'Table', x + 8, y + 16)
      p.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...MUTED).text(`${guests.length}/${t.seats}`, x + cw - 8, y + 16, { align: 'right' })
      p.setFontSize(9).setTextColor(...INK)
      guests.forEach((g, i) => p.text(`${g.name}${g.dietary ? `  (${g.dietary})` : ''}`, x + 8, y + 32 + i * 13, { maxWidth: cw - 16 }))
      if (!guests.length) p.setTextColor(...MUTED).text('—', x + 8, y + 32)
      rowH = Math.max(rowH, h)
      col++
      if (col === cols) {
        col = 0
        x = M
        y += rowH + 12
        rowH = 0
      } else x += cw + 12
    }
  }

  if (has('placecards')) {
    const seated = d.guests.filter((g) => g.seat && g.rsvp !== 'no').sort((a, b) => tableName(a.seat!.itemId).localeCompare(tableName(b.seat!.itemId), undefined, { numeric: true }) || a.name.localeCompare(b.name))
    // Tent cards: 2 × 4 per page, fold along the dashed line.
    for (let i = 0; i < seated.length; i++) {
      if (i % 8 === 0) newPage(p, first, 'portrait')
      const cw = (W(p) - M * 2) / 2
      const k = i % 8
      const x = M + (k % 2) * cw
      const y = M + Math.floor(k / 2) * ((H(p) - M * 2) / 4)
      const ch = (H(p) - M * 2) / 4
      p.setDrawColor(203, 213, 225).setLineDashPattern([], 0).rect(x, y, cw, ch)
      p.setLineDashPattern([3, 3], 0).line(x, y + ch / 2, x + cw, y + ch / 2).setLineDashPattern([], 0)
      const g = seated[i]
      p.setFont('helvetica', 'bold').setFontSize(18).setTextColor(...INK).text(g.name, x + cw / 2, y + ch * 0.75, { align: 'center', maxWidth: cw - 20 })
      p.setFont('helvetica', 'normal').setFontSize(10).setTextColor(...MUTED).text(tableName(g.seat!.itemId), x + cw / 2, y + ch * 0.75 + 18, { align: 'center' })
    }
  }

  if (has('guests')) {
    newPage(p, first, 'portrait')
    const y = heading(p, 'Guest list', `${d.guests.length} invited · ${d.guests.filter((g) => g.rsvp === 'yes').length} attending`)
    table(
      p,
      y,
      ['Name', 'Group', 'RSVP', 'Dietary', 'Table'],
      [...d.guests].sort((a, b) => a.name.localeCompare(b.name)).map((g) => [g.name, g.group, g.rsvp, g.dietary, g.seat ? tableName(g.seat.itemId) : '']),
    )
  }

  if (has('run')) {
    newPage(p, first, 'portrait')
    const rows = runSheet(d)
    const y = heading(p, 'Run sheet', d.date ? new Date(d.date + 'T00:00').toLocaleDateString('en-US', { dateStyle: 'full' }) : undefined)
    table(
      p,
      y,
      ['Time', 'Min', 'What', 'Who', 'Where', 'Notes'],
      rows.map((r) => [fmt12(r.time), r.duration || '', r.title, r.owner, r.location, r.notes]),
      {
        columnStyles: { 0: { cellWidth: 52 }, 1: { cellWidth: 30 }, 2: { cellWidth: 170 } },
        didParseCell: (c) => {
          const r = rows[c.row.index]
          if (c.section === 'body' && r?.source) c.cell.styles.textColor = MUTED
          if (c.section === 'body' && r && c.column.index === 0) c.cell.styles.fontStyle = 'bold'
        },
      },
    )
  }

  if (has('suppliers')) {
    newPage(p, first, 'portrait')
    const y = heading(p, 'Suppliers')
    table(
      p,
      y,
      ['Supplier', 'Category', 'Status', 'Contact', 'Phone', 'Arrive', 'Quote', 'Paid'],
      d.suppliers.filter((s) => s.status !== 'declined').map((s) => [s.name, s.category, s.status, s.contact, s.phone, s.arrival ? fmt12(s.arrival) : '', s.quote ? money(s.quote) : '', s.paid ? money(s.paid) : '']),
    )
  }

  if (has('crew')) {
    newPage(p, first, 'portrait')
    const shifts = sortShifts(d.shifts)
    const days = [...new Set(shifts.map((s) => s.day))]
    let y = heading(p, 'Crew roster', `${d.crew.length} people · ${shifts.length} shifts across ${days.length} day${days.length === 1 ? '' : 's'}${d.venue.name ? ' · ' + d.venue.name : ''}`)
    const who = (s: (typeof shifts)[number]) => {
      const sup = s.supplierId ? d.suppliers.find((x) => x.id === s.supplierId) : undefined
      if (sup) return `${sup.name || sup.category} (${s.needed} crew)`
      const names = s.crewIds.map((id) => d.crew.find((c) => c.id === id)).map((c) => c?.name || c?.role || '?')
      const gap = s.needed - names.length
      return [names.join(', '), gap > 0 ? `${gap} to fill` : ''].filter(Boolean).join(' · ')
    }
    for (const day of days) {
      if (y > H(p) - 120) (p.addPage('letter', 'portrait'), (y = M))
      p.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...INK).text(dayTitle(d.date, day), M, y + 4)
      y = table(
        p,
        y + 10,
        ['Time', 'Section', 'Task', 'Who', 'Where'],
        shifts.filter((s) => s.day === day).map((s) => [`${fmt12(s.start)}–${fmt12(s.end)}`, s.section, s.task, who(s), s.location]),
        { columnStyles: { 0: { cellWidth: 92 }, 1: { cellWidth: 90 } } },
      )
    }
    if (d.crew.length) {
      if (y > H(p) - 140) (p.addPage('letter', 'portrait'), (y = M))
      p.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...INK).text('People', M, y + 4)
      y = table(
        p,
        y + 10,
        ['Name', 'Role', 'Mobile', 'Shifts', 'Hours'],
        d.crew.map((c) => [c.name, c.role, c.phone, d.shifts.filter((s) => s.crewIds.includes(c.id)).length, crewHours(d, c.id).toFixed(1)]),
      )
    }
    if (crewCost(d)) p.setFontSize(9).setTextColor(...MUTED).text(`Team cost: ${money(crewCost(d))}`, M, y - 4)
  }

  if (has('budget')) {
    newPage(p, first, 'portrait')
    const b = budgetTotals(d)
    const y = heading(p, 'Budget', `Target ${money(b.target)} · forecast ${money(b.forecast)} · paid ${money(b.paid)} · ${money(b.due)} due`)
    table(
      p,
      y,
      ['Category', 'Item', 'Estimate', 'Actual', 'Paid'],
      [
        ...d.budget.map((l) => [l.category, l.name, money(l.estimate), lineActual(l, d) ? money(lineActual(l, d)) : '', linePaid(l, d) ? money(linePaid(l, d)) : '']),
        ['', 'Total', money(b.estimate), money(b.actual), money(b.paid)],
      ],
      { columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } }, didParseCell: (c) => {
          if (c.row.index === d.budget.length) c.cell.styles.fontStyle = 'bold'
        },
      },
    )
  }

  if (has('load')) {
    newPage(p, first, 'portrait')
    const rows = kitRows(d)
    const priced = rows.some((r) => r.owned != null || r.unit)
    const y = heading(p, 'Load list', priced ? 'From the floor plan and site map, against your kit' : 'From the floor plan and site map')
    if (priced) {
      const site = loadList(d).filter(([k]) => k.endsWith('(site)'))
      table(
        p,
        y,
        ['Item', 'Qty', 'Own', 'Short', 'Each', 'Cost'],
        [
          ...rows.map((r) => [r.label, r.qty, r.owned ?? '', r.owned != null ? r.short || '—' : '', r.unit ? money(r.unit, r.unit % 1 !== 0) : '', r.cost ? money(r.cost) : '']),
          ...site.map(([k, n]) => [k, n, '', '', '', '']),
          ['Total', '', '', '', '', money(rows.reduce((t, r) => t + r.cost, 0))],
        ],
        {
          columnStyles: { 1: { halign: 'right', cellWidth: 44 }, 2: { halign: 'right', cellWidth: 44 }, 3: { halign: 'right', cellWidth: 44 }, 4: { halign: 'right', cellWidth: 64 }, 5: { halign: 'right', cellWidth: 72 } },
          didParseCell: (c) => {
            if (c.section !== 'body') return
            if (c.column.index === 3 && typeof c.cell.raw === 'number' && c.cell.raw > 0) c.cell.styles.textColor = [180, 83, 9]
            if (c.row.index === rows.length + site.length) c.cell.styles.fontStyle = 'bold'
          },
        },
      )
    } else table(p, y, ['Item', 'Qty'], loadList(d).map(([k, n]) => [k, n]), { columnStyles: { 1: { halign: 'right', cellWidth: 60 } } })
  }

  if (first.v) return
  stamp(p, d, watermark)
  const name = sections.length === 1 ? `${slug(d.name)}-${sections[0]}.pdf` : `${slug(d.name)}-event-pack.pdf`
  p.save(name)
}

/** One form response, or a blank printable form when response is null. */
export const exportResponse = async (form: DocForm, r: DocResponse | null) => {
  const p = new jsPDF({ unit: 'pt', format: 'letter' }) as Doc
  let y = heading(p, form.title, r ? `${r.by} · ${new Date(r.submittedAt).toLocaleString()}` : form.description)
  const bottom = H(p) - 60
  for (const f of form.fields) {
    const v = r?.values[f.id]
    const need = f.type === 'signature' || f.type === 'photo' ? 110 : f.type === 'longtext' ? 70 : 36
    if (y + need > bottom) (p.addPage(), (y = M))
    if (f.type === 'heading') {
      p.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...INK).text(f.label, M, y + 10)
      p.setDrawColor(226, 232, 240).line(M, y + 16, W(p) - M, y + 16)
      y += 28
      continue
    }
    p.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUTED).text(f.label + (f.required ? ' *' : ''), M, y + 8, { maxWidth: W(p) - M * 2 })
    p.setTextColor(...INK).setFontSize(10)
    if ((f.type === 'signature' || f.type === 'photo') && typeof v === 'string' && v) {
      p.addImage(v, v.startsWith('data:image/png') ? 'PNG' : 'JPEG', M, y + 14, f.type === 'signature' ? 220 : 160, f.type === 'signature' ? 70 : 90)
      y += 112
    } else if (f.type === 'checkbox') {
      p.rect(M, y + 14, 10, 10)
      if (v) p.setFont('helvetica', 'bold').text('X', M + 2, y + 22.5).setFont('helvetica', 'normal')
      y += 32
    } else if (r) {
      const text = typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v ?? '—')
      const lines = p.splitTextToSize(text || '—', W(p) - M * 2)
      p.text(lines, M, y + 24)
      y += 24 + lines.length * 12 + 6
    } else {
      // Blank: lines to write on.
      const n = f.type === 'longtext' ? 3 : f.type === 'signature' ? 2 : 1
      p.setDrawColor(203, 213, 225)
      for (let i = 0; i < n; i++) p.line(M, y + 32 + i * 20, W(p) - M, y + 32 + i * 20)
      if (f.type === 'choice' && f.options?.length) p.setFontSize(9).setTextColor(...MUTED).text(f.options.map((o) => `[  ] ${o}`).join('     '), M, y + 24)
      y += 26 + n * 20
    }
  }
  p.save(`${slug(form.title)}${r ? '-' + slug(r.by) : ''}.pdf`)
}
