import type { Supplier } from '../../types/event'
import { uid } from '../../lib/id'
import { update } from '../../store/event'

export const SUPPLIER_CATEGORIES = [
  'Venue',
  'Catering',
  'Bar',
  'Photo & video',
  'Florals & decor',
  'Music',
  'AV & production',
  'Rentals',
  'Cake',
  'Stationery',
  'Transport',
  'Security & medical',
  'Infrastructure',
  'Welfare',
  'Staffing',
  'Other',
]

export const newSupplier = (over: Partial<Supplier> = {}): Supplier => ({
  id: uid('v'),
  name: '',
  category: 'Other',
  contact: '',
  email: '',
  phone: '',
  status: 'researching',
  quote: 0,
  paid: 0,
  dueDate: '',
  arrival: '',
  departure: '',
  notes: '',
  ...over,
})

/** Link a supplier to a budget line — creating the line if needed — so its quote flows into the budget. */
export const linkToBudget = (supplierId: string) =>
  update((d) => {
    const s = d.suppliers.find((x) => x.id === supplierId)
    if (!s || (s.budgetLineId && d.budget.some((b) => b.id === s.budgetLineId))) return
    let line = d.budget.find((b) => b.category === s.category && !b.supplierId && !b.source)
    if (!line) {
      line = { id: uid('b'), category: s.category, name: s.name || s.category, estimate: s.quote, actual: 0, paid: 0 }
      d.budget.push(line)
    }
    line.supplierId = s.id
    s.budgetLineId = line.id
  })

/** Book one supplier in a category; others in that category are marked declined. */
export const choose = (supplierId: string) =>
  update((d) => {
    const s = d.suppliers.find((x) => x.id === supplierId)
    if (!s) return
    for (const o of d.suppliers) if (o.category === s.category && o.id !== s.id && o.status !== 'paid') o.status = 'declined'
    s.status = s.paid > 0 && s.paid >= s.quote ? 'paid' : 'booked'
    // Move the budget link to the winner.
    const line = d.budget.find((b) => b.category === s.category && (b.supplierId === undefined || d.suppliers.find((x) => x.id === b.supplierId)?.status === 'declined'))
    if (line && !s.budgetLineId) {
      const prev = d.suppliers.find((x) => x.id === line.supplierId)
      if (prev) delete prev.budgetLineId
      line.supplierId = s.id
      s.budgetLineId = line.id
    }
  })
