import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { DocResponse, EventDoc, Pack, PackAudience, PackOptions, VenuePlan } from '../types/event'
import { migrate } from '../store/migrate'
import { planFromRow, storage, type PlanRow } from '../store/persistence'
import { api } from './api'
import { uid } from './id'
import { track } from './track'

export const download = (blob: Blob, filename: string) => {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'event'

/** Photos and signatures are too heavy for a URL — they stay with the owner. */
const lighten = (d: EventDoc): EventDoc => ({
  ...d,
  docs: d.docs.map((f) => ({ ...f, responses: [] })),
})

/* ---------- Link-encoded share (no backend) ---------- */

export const shareHash = (d: EventDoc) => `#share=${compressToEncodedURIComponent(JSON.stringify(lighten(d)))}`

export const readShareHash = (hash: string): EventDoc | null => {
  const m = /#share=(.+)$/.exec(hash)
  if (!m) return null
  try {
    return migrate(JSON.parse(decompressFromEncodedURIComponent(m[1]) ?? 'null'))
  } catch {
    return null
  }
}

/* ---------- Cloud share (live, read-only) ---------- */

export const createCloudShare = async (d: EventDoc): Promise<string> => {
  track('share_created')
  return (await api<{ token: string }>(`/api/events/${encodeURIComponent(d.id)}/share`, { method: 'POST' })).token
}

export const revokeCloudShare = async (id: string) => {
  await api(`/api/events/${encodeURIComponent(id)}/share`, { method: 'DELETE' })
}

export const currentShareToken = async (id: string): Promise<string | null> =>
  (await api<{ token: string | null }>(`/api/events/${encodeURIComponent(id)}/share`).catch(() => ({ token: null }))).token

export const loadCloudShare = async (token: string): Promise<{ doc: EventDoc; plan: VenuePlan | null; aerial: VenuePlan | null; pack: Omit<Pack, 'token'> | null } | null> => {
  const data = await api<{ doc: EventDoc; plan: PlanRow | null; aerial?: PlanRow | null; pack?: Omit<Pack, 'token'> | null }>(`/api/shared/${encodeURIComponent(token)}`).catch(() => null)
  if (!data) return null
  const base = `/api/shared/${encodeURIComponent(token)}/plan-image`
  const plan = data.plan ? await planFromRow(data.plan, base) : null
  const aerial = data.aerial ? await planFromRow(data.aerial, `${base}?id=${encodeURIComponent(data.aerial.id)}`) : null
  return { doc: migrate(data.doc), plan, aerial, pack: data.pack ?? null }
}

/* ---------- Packs: one live link per supplier, team or person ---------- */

const packsUrl = (eventId: string) => `/api/events/${encodeURIComponent(eventId)}/packs`

export const listPacks = (eventId: string) => api<Pack[]>(packsUrl(eventId)).catch(() => [] as Pack[])

export const savePack = (eventId: string, audience: PackAudience, opts: PackOptions) => {
  track('pack_saved', audience.kind)
  return api<Pack>(packsUrl(eventId), { method: 'POST', json: { audience, opts } })
}

export const deletePack = (eventId: string, token: string) => api(`${packsUrl(eventId)}/${encodeURIComponent(token)}`, { method: 'DELETE' })

export const packUrl = (token: string) => `${location.origin}/?s=${token}`

/** Crew filling a form from a share link — no account. */
export const submitSharedResponse = (token: string, formId: string, response: DocResponse) =>
  api(`/api/shared/${encodeURIComponent(token)}/responses`, { method: 'POST', json: { formId, response } })

/* ---------- File export / import ---------- */

interface ExportFile {
  plotline: 1
  doc: EventDoc
  plan?: VenuePlan
}

export const exportJson = async (d: EventDoc) => {
  const plan = d.layout.basePlan ? await storage().loadPlan(d.layout.basePlan.planId) : null
  const file: ExportFile = { plotline: 1, doc: d, ...(plan ? { plan } : {}) }
  download(new Blob([JSON.stringify(file)], { type: 'application/json' }), `${slug(d.name)}.plotline.json`)
}

export const importJson = async (f: File): Promise<EventDoc> => {
  const json = JSON.parse(await f.text()) as ExportFile | EventDoc
  const raw = 'plotline' in json ? json.doc : json
  if (!raw || typeof raw !== 'object' || !('layout' in raw)) throw new Error('Not a plan file')
  if ('plotline' in json && json.plan) await storage().savePlan(json.plan)
  const now = new Date().toISOString()
  return migrate({ ...raw, id: uid('e'), meta: { ...raw.meta, created: now, updated: now } })
}
