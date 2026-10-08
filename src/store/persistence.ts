/**
 * The only module that knows where data lives.
 * Local (IndexedDB) is always written. When signed in on a paid plan,
 * writes also go through to the Cloudflare Worker and reads take the newest copy.
 */
import { get, set, del } from 'idb-keyval'
import type { EventDoc, EventSummary, KitEntry, VenuePlan } from '../types/event'
import { api, blobToDataUrl } from '../lib/api'
import { cloudActive } from './account'

export interface Storage {
  listEvents(): Promise<EventSummary[]>
  loadEvent(id: string): Promise<EventDoc | null>
  saveEvent(doc: EventDoc): Promise<void>
  deleteEvent(id: string): Promise<void>
  listPlans(): Promise<VenuePlan[]>
  loadPlan(id: string): Promise<VenuePlan | null>
  savePlan(plan: VenuePlan): Promise<void>
  deletePlan(id: string): Promise<void>
}

const summary = (d: EventDoc): EventSummary => ({ id: d.id, name: d.name, type: d.type, date: d.date, updated: d.meta.updated })

/* ---------- Local ---------- */

const local: Storage = {
  async listEvents() {
    return ((await get<EventSummary[]>('events')) ?? []).sort((a, b) => b.updated.localeCompare(a.updated))
  },
  async loadEvent(id) {
    return (await get<EventDoc>(`event:${id}`)) ?? null
  },
  async saveEvent(doc) {
    await set(`event:${doc.id}`, doc)
    const list = ((await get<EventSummary[]>('events')) ?? []).filter((e) => e.id !== doc.id)
    await set('events', [summary(doc), ...list])
  },
  async deleteEvent(id) {
    await del(`event:${id}`)
    await set('events', ((await get<EventSummary[]>('events')) ?? []).filter((e) => e.id !== id))
  },
  async listPlans() {
    const ids = (await get<string[]>('plans')) ?? []
    const plans = await Promise.all(ids.map((id) => get<VenuePlan>(`plan:${id}`)))
    return plans.filter((p): p is VenuePlan => !!p)
  },
  async loadPlan(id) {
    return (await get<VenuePlan>(`plan:${id}`)) ?? null
  },
  async savePlan(plan) {
    await set(`plan:${plan.id}`, plan)
    const ids = (await get<string[]>('plans')) ?? []
    if (!ids.includes(plan.id)) await set('plans', [plan.id, ...ids])
  },
  async deletePlan(id) {
    await del(`plan:${id}`)
    await set('plans', ((await get<string[]>('plans')) ?? []).filter((x) => x !== id))
  },
}

/* ---------- Cloud (Cloudflare Worker: D1 metadata, R2 files) ---------- */

export type PlanRow = {
  id: string
  owner: string
  name: string
  source: VenuePlan['source']
  nat_w: number
  nat_h: number
  meters_per_px: number
  calibrated_by: VenuePlan['calibratedBy']
  visibility: VenuePlan['visibility']
  venue_name: string
  city: string
  created_at: string
}

/** Turn a plan row into a VenuePlan, fetching its image (from a share link's endpoint when given). */
export const planFromRow = async (r: PlanRow, imageUrl = `/api/plans/${r.id}/image`): Promise<VenuePlan> => {
  const blob = await api<Blob>(imageUrl).catch(() => null)
  return {
    id: r.id,
    name: r.name,
    source: r.source,
    image: blob ? await blobToDataUrl(blob) : '',
    natW: r.nat_w,
    natH: r.nat_h,
    metersPerPx: r.meters_per_px,
    calibratedBy: r.calibrated_by,
    visibility: r.visibility,
    venueName: r.venue_name,
    city: r.city,
    ownerId: r.owner,
    created: r.created_at,
  }
}

const cloud = {
  async listEvents(): Promise<EventSummary[]> {
    const rows = await api<{ id: string; name: string; type: EventSummary['type']; date: string | null; updated_at: string }[]>('/api/events')
    return rows.map((r) => ({ id: r.id, name: r.name, type: r.type, date: r.date ?? '', updated: r.updated_at }))
  },
  async loadEvent(id: string): Promise<EventDoc | null> {
    return api<EventDoc>(`/api/events/${encodeURIComponent(id)}`).catch(() => null)
  },
  async saveEvent(doc: EventDoc) {
    await api(`/api/events/${encodeURIComponent(doc.id)}`, { method: 'PUT', json: doc })
  },
  async deleteEvent(id: string) {
    await api(`/api/events/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {})
  },
  async savePlan(plan: VenuePlan) {
    await api(`/api/plans/${plan.id}/image`, { method: 'PUT', body: await (await fetch(plan.image)).blob(), headers: { 'Content-Type': 'image/png' } })
    await api(`/api/plans/${plan.id}`, {
      method: 'PUT',
      json: {
        name: plan.name,
        source: plan.source,
        natW: plan.natW,
        natH: plan.natH,
        metersPerPx: plan.metersPerPx,
        calibratedBy: plan.calibratedBy,
        visibility: plan.visibility,
        venueName: plan.venueName,
        city: plan.city,
      },
    })
  },
  async listOwnPlans(): Promise<PlanRow[]> {
    return api<PlanRow[]>('/api/plans')
  },
  async deletePlan(id: string) {
    await api(`/api/plans/${id}`, { method: 'DELETE' }).catch(() => {})
  },
}

/** The public venue library — plans venues have chosen to publish. */
export const searchPublicPlans = async (q: string): Promise<PlanRow[]> => api<PlanRow[]>(`/api/plans/public?q=${encodeURIComponent(q.trim())}`).catch(() => [])

const writeThrough: Storage = {
  async listEvents() {
    const [l, r] = await Promise.all([local.listEvents(), cloud.listEvents().catch(() => [])])
    const byId = new Map(l.map((e) => [e.id, e]))
    for (const e of r) {
      const have = byId.get(e.id)
      if (!have || have.updated < e.updated) byId.set(e.id, e)
    }
    return [...byId.values()].sort((a, b) => b.updated.localeCompare(a.updated))
  },
  async loadEvent(id) {
    const [l, r] = await Promise.all([local.loadEvent(id), cloud.loadEvent(id).catch(() => null)])
    if (!r) return l
    if (!l || l.meta.updated < r.meta.updated) {
      await local.saveEvent(r)
      return r
    }
    return l
  },
  async saveEvent(doc) {
    await local.saveEvent(doc)
    await cloud.saveEvent(doc)
  },
  async deleteEvent(id) {
    await Promise.all([local.deleteEvent(id), cloud.deleteEvent(id)])
  },
  async listPlans() {
    const [l, rows] = await Promise.all([local.listPlans(), cloud.listOwnPlans().catch(() => [])])
    const have = new Set(l.map((p) => p.id))
    const missing = await Promise.all(rows.filter((r) => !have.has(r.id)).map((r) => planFromRow(r)))
    for (const p of missing) await local.savePlan(p)
    return [...l, ...missing]
  },
  async loadPlan(id) {
    return local.loadPlan(id)
  },
  async savePlan(plan) {
    await local.savePlan(plan)
    await cloud.savePlan(plan)
  },
  async deletePlan(id) {
    await Promise.all([local.deletePlan(id), cloud.deletePlan(id)])
  },
}

export const storage = (): Storage => (cloudActive() ? writeThrough : local)

/* ---------- Your kit (per person, shared across events) ---------- */

export interface KitDoc {
  entries: KitEntry[]
  updated: string
}

const EMPTY_KIT: KitDoc = { entries: [], updated: '' }

/** Newest of this browser's copy and (on Pro) the account's copy. */
export const loadKit = async (): Promise<KitDoc> => {
  const here = (await get<KitDoc>('kit')) ?? EMPTY_KIT
  if (!cloudActive()) return here
  const there = await api<KitDoc>('/api/kit').catch(() => null)
  if (there && there.updated > here.updated) {
    await set('kit', there)
    return there
  }
  if (here.updated && (!there || here.updated > there.updated)) await api('/api/kit', { method: 'PUT', json: here }).catch(() => {})
  return here
}

export const saveKit = async (kit: KitDoc) => {
  await set('kit', kit)
  if (cloudActive()) await api('/api/kit', { method: 'PUT', json: kit })
}
export const localStorageAdapter = local

/**
 * After signing in on Pro: push anything that only exists in this browser
 * (or is newer here) up to the cloud, so nothing made on the free plan is left behind.
 */
export const syncUp = async (): Promise<number> => {
  if (!cloudActive()) return 0
  const [locals, remotes, remotePlans] = await Promise.all([local.listEvents(), cloud.listEvents().catch(() => []), cloud.listOwnPlans().catch(() => [])])
  const remoteAt = new Map(remotes.map((r) => [r.id, r.updated]))
  let n = 0
  for (const e of locals) {
    const at = remoteAt.get(e.id)
    if (at && at >= e.updated) continue
    const doc = await local.loadEvent(e.id)
    if (doc) await cloud.saveEvent(doc).then(() => n++, () => {})
  }
  const have = new Set(remotePlans.map((p) => p.id))
  for (const p of await local.listPlans()) if (!have.has(p.id)) await cloud.savePlan(p).catch(() => {})
  return n
}
