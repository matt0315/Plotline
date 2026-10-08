import { type AppEnv, json, readJson, requirePro, requireUser, HttpError } from './lib'

const key = (owner: string) => `kit/${owner}.json`
const MAX = 500_000

/** GET — the signed-in person's kit, or an empty one. */
export const getKit = async (req: Request, env: AppEnv) => {
  const u = await requireUser(req, env)
  const obj = await env.FILES.get(key(u.id))
  return obj ? new Response(obj.body, { headers: { 'Content-Type': 'application/json' } }) : json({ entries: [], updated: '' })
}

/** PUT { entries, updated } — Pro only, like the rest of cloud sync. */
export const putKit = async (req: Request, env: AppEnv) => {
  const u = await requirePro(req, env)
  const body = await readJson<{ entries?: unknown; updated?: unknown }>(req, MAX)
  if (!Array.isArray(body.entries) || typeof body.updated !== 'string') throw new HttpError(400, 'Expected { entries, updated }')
  if (body.entries.length > 2000) throw new HttpError(413, 'That’s a lot of kit — keep it under 2,000 items')
  await env.FILES.put(key(u.id), JSON.stringify({ entries: body.entries, updated: body.updated }), { httpMetadata: { contentType: 'application/json' } })
  return json({ ok: true })
}
