import { type AppEnv, HttpError, currentUser, json, readJson, requirePro, requireUser } from './lib'

const ID = /^[\w-]{3,64}$/
const imageKey = (owner: string, id: string) => `plans/${owner}/${id}.png`
const COLUMNS = 'id, owner, name, source, nat_w, nat_h, meters_per_px, calibrated_by, visibility, venue_name, city, created_at'

export const listOwnPlans = async (req: Request, env: AppEnv) => {
  const u = await requireUser(req, env)
  const { results } = await env.DB.prepare(`SELECT ${COLUMNS} FROM venue_plans WHERE owner = ? ORDER BY created_at DESC`).bind(u.id).all()
  return json(results)
}

/** The public venue library — no sign-in needed to browse. */
export const searchPublicPlans = async (req: Request, env: AppEnv) => {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 80)
  const like = `%${q.replace(/[%_]/g, '')}%`
  const { results } = await env.DB.prepare(
    `SELECT ${COLUMNS} FROM venue_plans WHERE visibility = 'public'
     AND (? = '' OR venue_name LIKE ? OR city LIKE ? OR name LIKE ?) ORDER BY created_at DESC LIMIT 30`,
  )
    .bind(q, like, like, like)
    .all()
  return json(results)
}

const assertWritable = async (env: AppEnv, id: string, userId: string) => {
  if (!ID.test(id)) throw new HttpError(400, 'Bad plan id')
  const row = await env.DB.prepare('SELECT owner FROM venue_plans WHERE id = ?').bind(id).first<{ owner: string }>()
  if (row && row.owner !== userId) throw new HttpError(403, 'Not your plan')
}

export const putPlanImage = async (req: Request, env: AppEnv, id: string) => {
  const u = await requirePro(req, env)
  await assertWritable(env, id, u.id)
  const bytes = await req.arrayBuffer()
  if (bytes.byteLength > 25_000_000) throw new HttpError(413, 'Drawing is too large')
  // PNG signature check — we only ever store rendered PNGs.
  const sig = new Uint8Array(bytes.slice(0, 4))
  if (sig[0] !== 0x89 || sig[1] !== 0x50 || sig[2] !== 0x4e || sig[3] !== 0x47) throw new HttpError(400, 'Expected a PNG')
  await env.FILES.put(imageKey(u.id, id), bytes, { httpMetadata: { contentType: 'image/png' } })
  return json({ ok: true })
}

export const putPlan = async (req: Request, env: AppEnv, id: string) => {
  const u = await requirePro(req, env)
  await assertWritable(env, id, u.id)
  const p = await readJson<Record<string, unknown>>(req, 20_000)
  const str = (k: string, max = 200) => String(p[k] ?? '').slice(0, max)
  const num = (k: string) => {
    const n = Number(p[k])
    if (!Number.isFinite(n) || n <= 0) throw new HttpError(400, `Bad ${k}`)
    return n
  }
  const source = str('source')
  if (!['dxf', 'dwg', 'pdf', 'image'].includes(source)) throw new HttpError(400, 'Bad source')
  const visibility = p.visibility === 'public' ? 'public' : 'private'
  await env.DB.prepare(
    `INSERT INTO venue_plans (id, owner, name, source, nat_w, nat_h, meters_per_px, calibrated_by, visibility, venue_name, city)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET name = excluded.name, meters_per_px = excluded.meters_per_px, calibrated_by = excluded.calibrated_by,
       visibility = excluded.visibility, venue_name = excluded.venue_name, city = excluded.city`,
  )
    .bind(id, u.id, str('name'), source, Math.round(num('natW')), Math.round(num('natH')), num('metersPerPx'), str('calibratedBy', 20), visibility, str('venueName'), str('city', 100))
    .run()
  return json({ ok: true })
}

/** The owner, or anyone if the plan is published. Shared events use /api/shared/:token/plan-image. */
export const getPlanImage = async (req: Request, env: AppEnv, id: string) => {
  const row = await env.DB.prepare('SELECT owner, visibility FROM venue_plans WHERE id = ?').bind(id).first<{ owner: string; visibility: string }>()
  if (!row) throw new HttpError(404, 'Plan not found')
  if (row.visibility !== 'public') {
    const u = await currentUser(req, env)
    if (u?.id !== row.owner) throw new HttpError(404, 'Plan not found')
  }
  const obj = await env.FILES.get(imageKey(row.owner, id))
  if (!obj) throw new HttpError(404, 'Plan image missing')
  return new Response(obj.body, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=300' } })
}

export const deletePlan = async (req: Request, env: AppEnv, id: string) => {
  const u = await requireUser(req, env)
  const row = await env.DB.prepare('SELECT owner FROM venue_plans WHERE id = ?').bind(id).first<{ owner: string }>()
  if (!row || row.owner !== u.id) throw new HttpError(404, 'Plan not found')
  await env.FILES.delete(imageKey(u.id, id))
  await env.DB.prepare('DELETE FROM venue_plans WHERE id = ?').bind(id).run()
  return json({ ok: true })
}
