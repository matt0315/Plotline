import { type AppEnv, HttpError, json, randomToken, readJson, requirePro, requireUser } from './lib'

const docKey = (owner: string, id: string) => `events/${owner}/${id}.json`
const ID = /^[\w-]{3,64}$/

interface EventRow {
  id: string
  owner: string
  name: string
  type: string
  date: string | null
  share_token: string | null
  updated_at: string
}

const ownEvent = async (env: AppEnv, id: string, userId: string) => {
  if (!ID.test(id)) throw new HttpError(400, 'Bad event id')
  const row = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first<EventRow>()
  if (!row || row.owner !== userId) throw new HttpError(404, 'Event not found')
  return row
}

export const listEvents = async (req: Request, env: AppEnv) => {
  const u = await requireUser(req, env)
  const { results } = await env.DB.prepare('SELECT id, name, type, date, updated_at FROM events WHERE owner = ? ORDER BY updated_at DESC').bind(u.id).all()
  return json(results)
}

export const getEvent = async (req: Request, env: AppEnv, id: string) => {
  const u = await requireUser(req, env)
  const row = await ownEvent(env, id, u.id)
  const obj = await env.FILES.get(docKey(row.owner, id))
  if (!obj) throw new HttpError(404, 'Event not found')
  return new Response(obj.body, { headers: { 'Content-Type': 'application/json' } })
}

/** Cloud sync is a Pro feature — enforced here, not just in the UI. */
export const putEvent = async (req: Request, env: AppEnv, id: string) => {
  const u = await requirePro(req, env)
  if (!ID.test(id)) throw new HttpError(400, 'Bad event id')
  const text = await req.text()
  if (text.length > 50_000_000) throw new HttpError(413, 'Event is too large')
  let doc: { id?: string; name?: string; type?: string; date?: string; meta?: { updated?: string } }
  try {
    doc = JSON.parse(text)
  } catch {
    throw new HttpError(400, 'Invalid event')
  }
  if (doc.id !== id) throw new HttpError(400, 'Event id mismatch')
  const existing = await env.DB.prepare('SELECT owner FROM events WHERE id = ?').bind(id).first<{ owner: string }>()
  if (existing && existing.owner !== u.id) throw new HttpError(403, 'Not your event')

  await env.FILES.put(docKey(u.id, id), text, { httpMetadata: { contentType: 'application/json' } })
  await env.DB.prepare(
    `INSERT INTO events (id, owner, name, type, date, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET name = excluded.name, type = excluded.type, date = excluded.date, updated_at = excluded.updated_at`,
  )
    .bind(id, u.id, String(doc.name ?? '').slice(0, 200), String(doc.type ?? 'private'), doc.date || null, doc.meta?.updated ?? new Date().toISOString())
    .run()
  return json({ ok: true })
}

export const deleteEvent = async (req: Request, env: AppEnv, id: string) => {
  const u = await requireUser(req, env)
  const row = await ownEvent(env, id, u.id)
  await env.FILES.delete(docKey(row.owner, id))
  await env.DB.batch([env.DB.prepare('DELETE FROM form_responses WHERE event_id = ?').bind(id), env.DB.prepare('DELETE FROM events WHERE id = ?').bind(id)])
  return json({ ok: true })
}

/* ---------- Share links ---------- */

export const getShare = async (req: Request, env: AppEnv, id: string) => {
  const u = await requireUser(req, env)
  const row = await env.DB.prepare('SELECT owner, share_token FROM events WHERE id = ?').bind(id).first<{ owner: string; share_token: string | null }>()
  if (!row || row.owner !== u.id) return json({ token: null })
  return json({ token: row.share_token })
}

export const createShare = async (req: Request, env: AppEnv, id: string) => {
  const u = await requirePro(req, env)
  const row = await ownEvent(env, id, u.id)
  const token = row.share_token ?? randomToken(24)
  await env.DB.prepare('UPDATE events SET share_token = ? WHERE id = ?').bind(token, id).run()
  return json({ token })
}

export const revokeShare = async (req: Request, env: AppEnv, id: string) => {
  const u = await requireUser(req, env)
  await ownEvent(env, id, u.id)
  await env.DB.prepare('UPDATE events SET share_token = NULL WHERE id = ?').bind(id).run()
  return json({ ok: true })
}

const byToken = async (env: AppEnv, token: string) => {
  if (!token || token.length < 16) throw new HttpError(404, 'Link not found')
  const row = await env.DB.prepare('SELECT id, owner FROM events WHERE share_token = ?').bind(token).first<{ id: string; owner: string }>()
  if (!row) throw new HttpError(404, 'This link has expired or been turned off')
  const obj = await env.FILES.get(docKey(row.owner, row.id))
  if (!obj) throw new HttpError(404, 'Link not found')
  return { row, doc: (await obj.json()) as { layout?: { basePlan?: { planId?: string } }; docs?: { id: string }[] } }
}

/** Anyone with the link: the event, plus metadata for its venue drawing. */
export const getShared = async (_req: Request, env: AppEnv, token: string) => {
  const { doc } = await byToken(env, token)
  const planId = doc.layout?.basePlan?.planId
  const plan = planId ? await env.DB.prepare('SELECT * FROM venue_plans WHERE id = ?').bind(planId).first() : null
  return json({ doc, plan })
}

export const getSharedPlanImage = async (_req: Request, env: AppEnv, token: string) => {
  const { doc } = await byToken(env, token)
  const planId = doc.layout?.basePlan?.planId
  const plan = planId ? await env.DB.prepare('SELECT owner FROM venue_plans WHERE id = ?').bind(planId).first<{ owner: string }>() : null
  const obj = plan && (await env.FILES.get(`plans/${plan.owner}/${planId}.png`))
  if (!obj) throw new HttpError(404, 'No venue drawing')
  return new Response(obj.body, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=300' } })
}

/* ---------- Crew form responses ---------- */

const MAX_PENDING = 500

export const submitResponse = async (req: Request, env: AppEnv, token: string) => {
  const { row, doc } = await byToken(env, token)
  const body = await readJson<{ formId?: string; response?: { id?: string } }>(req, 3_000_000)
  if (!body.formId || !doc.docs?.some((f) => f.id === body.formId)) throw new HttpError(404, 'Form not found')
  if (!body.response?.id || !ID.test(body.response.id)) throw new HttpError(400, 'Invalid response')
  const pending = await env.DB.prepare('SELECT COUNT(*) AS n FROM form_responses WHERE event_id = ?').bind(row.id).first<{ n: number }>()
  if ((pending?.n ?? 0) >= MAX_PENDING) throw new HttpError(429, 'Too many responses waiting — ask the organiser to open the plan')
  await env.DB.prepare('INSERT INTO form_responses (id, event_id, form_id, response) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING')
    .bind(body.response.id, row.id, body.formId, JSON.stringify(body.response))
    .run()
  return json({ ok: true })
}

export const listResponses = async (req: Request, env: AppEnv, id: string) => {
  const u = await requireUser(req, env)
  await ownEvent(env, id, u.id)
  const { results } = await env.DB.prepare('SELECT id, form_id, response FROM form_responses WHERE event_id = ?').bind(id).all<{ id: string; form_id: string; response: string }>()
  return json(results.map((r) => ({ id: r.id, form_id: r.form_id, response: JSON.parse(r.response) })))
}

export const clearResponses = async (req: Request, env: AppEnv, id: string) => {
  const u = await requireUser(req, env)
  await ownEvent(env, id, u.id)
  const { ids } = await readJson<{ ids?: string[] }>(req)
  if (!Array.isArray(ids) || !ids.length) return json({ ok: true })
  await env.DB.batch(ids.slice(0, 500).map((r) => env.DB.prepare('DELETE FROM form_responses WHERE id = ? AND event_id = ?').bind(r, id)))
  return json({ ok: true })
}
