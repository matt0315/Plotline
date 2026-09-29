import type { Guest, Rsvp } from '../../types/event'
import { uid } from '../../lib/id'
import { doc, update } from '../../store/event'
import { isSeating, seatsWorld } from '../../lib/geometry'
import { seatKey } from '../../lib/derived'

export const newGuest = (over: Partial<Guest> = {}): Guest => ({
  id: uid('g'),
  name: '',
  group: '',
  rsvp: 'pending',
  dietary: '',
  email: '',
  phone: '',
  notes: '',
  ...over,
})

const RSVP_WORDS: Record<string, Rsvp> = { yes: 'yes', y: 'yes', attending: 'yes', accepted: 'yes', no: 'no', n: 'no', declined: 'no', maybe: 'maybe', pending: 'pending' }

/**
 * Accepts a pasted list or CSV. One guest per line.
 * "Name", "Name, Group", "Name, Group, email, rsvp, dietary" — or any CSV with a header row.
 */
export const parseGuests = (text: string): Guest[] => {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (!lines.length) return []
  const split = (l: string) => {
    const out: string[] = []
    let cur = ''
    let q = false
    for (const ch of l) {
      if (ch === '"') q = !q
      else if ((ch === ',' || ch === '\t') && !q) (out.push(cur.trim()), (cur = ''))
      else cur += ch
    }
    out.push(cur.trim())
    return out
  }
  const first = split(lines[0]).map((h) => h.toLowerCase())
  const hasHeader = first.some((h) => /^(name|full name|first name|guest|group|email|rsvp)$/.test(h))
  const col = (re: RegExp) => first.findIndex((h) => re.test(h))
  const idx = hasHeader
    ? {
        name: col(/^(name|full name|guest|guest name)$/),
        first: col(/^first/),
        last: col(/^last|surname/),
        group: col(/group|party|table|side|household/),
        email: col(/mail/),
        phone: col(/phone|mobile|cell/),
        rsvp: col(/rsvp|status|attending/),
        dietary: col(/diet|allerg|meal/),
      }
    : { name: 0, first: -1, last: -1, group: 1, email: -1, phone: -1, rsvp: -1, dietary: -1 }
  const rows = hasHeader ? lines.slice(1) : lines
  return rows
    .map((l) => {
      const c = split(l)
      const at = (i: number) => (i >= 0 ? c[i] ?? '' : '')
      const name = at(idx.name) || [at(idx.first), at(idx.last)].filter(Boolean).join(' ')
      if (hasHeader)
        return newGuest({
          name,
          group: at(idx.group),
          email: at(idx.email),
          phone: at(idx.phone),
          rsvp: RSVP_WORDS[at(idx.rsvp).toLowerCase()] ?? 'pending',
          dietary: at(idx.dietary),
        })
      // No header: name first, then sniff each remaining column by what it looks like.
      const g = newGuest({ name })
      c.slice(1).forEach((raw, i) => {
        const v = raw.trim()
        if (!v) return
        if (v.includes('@')) g.email = v
        else if (RSVP_WORDS[v.toLowerCase()]) g.rsvp = RSVP_WORDS[v.toLowerCase()]
        else if (/^[+\d][\d\s()-]{6,}$/.test(v)) g.phone = v
        else if (i === 0) g.group = v
        else g.dietary = g.dietary ? `${g.dietary}, ${v}` : v
      })
      return g
    })
    .filter((g) => g.name)
}

/** Seat everyone attending who isn't seated, keeping groups together where possible. */
export const autoSeat = () => {
  const d = doc()
  const taken = new Set(d.guests.filter((g) => g.seat).map((g) => seatKey(g.seat!.itemId, g.seat!.index)))
  const tables = d.layout.items.filter(isSeating).sort((a, b) => a.y - b.y || a.x - b.x)
  const free = new Map(tables.map((t) => [t.id, Array.from({ length: t.seats }, (_, i) => i).filter((i) => !taken.has(seatKey(t.id, i)))]))
  const waiting = d.guests.filter((g) => !g.seat && g.rsvp !== 'no')
  const groups = new Map<string, typeof waiting>()
  for (const g of waiting) {
    const k = g.group || g.plusOneOf || `solo-${g.id}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(g)
  }
  const assign = new Map<string, { itemId: string; index: number }>()
  // Largest groups first, into the table with the most room.
  for (const members of [...groups.values()].sort((a, b) => b.length - a.length)) {
    let rest = [...members]
    while (rest.length) {
      const best = tables.map((t) => ({ t, n: free.get(t.id)!.length })).filter((x) => x.n > 0)
      if (!best.length) break
      const fit = best.find((x) => x.n >= rest.length) ?? best.sort((a, b) => b.n - a.n)[0]
      const seats = free.get(fit.t.id)!
      for (const g of rest.splice(0, seats.length)) assign.set(g.id, { itemId: fit.t.id, index: seats.shift()! })
    }
  }
  update((dd) => {
    for (const g of dd.guests) if (assign.has(g.id)) g.seat = assign.get(g.id)
  })
  return { seated: assign.size, left: waiting.length - assign.size }
}

/** Nearest free seat to a point (metres), within reach of a table. */
export const nearestFreeSeat = (p: { x: number; y: number }, ignoreGuest?: string) => {
  const d = doc()
  const taken = new Set(d.guests.filter((g) => g.seat && g.id !== ignoreGuest).map((g) => seatKey(g.seat!.itemId, g.seat!.index)))
  let best: { itemId: string; index: number; dist: number } | null = null
  for (const item of d.layout.items) {
    if (!isSeating(item)) continue
    const reach = Math.max(item.w, item.h) / 2 + 1.2
    if (Math.hypot(item.x - p.x, item.y - p.y) > reach + (item.kind === 'chair-block' ? Math.max(item.w, item.h) : 0)) continue
    seatsWorld(item).forEach((s, index) => {
      if (taken.has(seatKey(item.id, index))) return
      const dist = Math.hypot(s.x - p.x, s.y - p.y)
      if (!best || dist < best.dist) best = { itemId: item.id, index, dist }
    })
  }
  return best as { itemId: string; index: number; dist: number } | null
}

export const seatGuest = (guestId: string, seat: { itemId: string; index: number } | undefined) =>
  update((d) => {
    const g = d.guests.find((x) => x.id === guestId)
    if (!g) return
    if (seat) {
      // Swap if someone's already there.
      const other = d.guests.find((x) => x.id !== guestId && x.seat?.itemId === seat.itemId && x.seat.index === seat.index)
      if (other) {
        if (g.seat) other.seat = { ...g.seat }
        else delete other.seat
      }
      g.seat = { ...seat }
    } else delete g.seat
  })
