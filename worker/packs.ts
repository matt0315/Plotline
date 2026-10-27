import type { Pack, PackAudience, PackOptions } from '../src/types/event'
import { type AppEnv, HttpError, json, randomToken, readJson, requirePro, requireUser } from './lib'
import { ownEvent } from './events'

interface PackRow {
  token: string
  event_id: string
  owner: string
  audience: string
  opts: string
}

const KINDS = new Set(['supplier', 'team', 'crew'])
const OPTS: (keyof PackOptions)[] = ['floor', 'site', 'run', 'load', 'dietary', 'contacts']

const toPack = (r: PackRow): Pack => ({ token: r.token, audience: JSON.parse(r.audience), opts: JSON.parse(r.opts) })

/** A pack token, if this is one. */
export const packByToken = async (env: AppEnv, token: string) => {
  const row = await env.DB.prepare('SELECT * FROM packs WHERE token = ?').bind(token).first<PackRow>()
  return row ? { row: { id: row.event_id, owner: row.owner }, pack: toPack(row) } : null
}

const clean = (body: { audience?: Partial<PackAudience>; opts?: Partial<PackOptions> }) => {
  const a = body.audience
  if (!a || !KINDS.has(a.kind ?? '') || typeof a.id !== 'string' || !a.id || a.id.length > 80) throw new HttpError(400, 'Who is this pack for?')
  const audience: PackAudience = { kind: a.kind!, id: a.id, label: String(a.label ?? '').slice(0, 80) }
  const opts = Object.fromEntries(OPTS.map((k) => [k, !!body.opts?.[k]])) as unknown as PackOptions
  return { audience, opts }
}

export const listPacks = async (req: Request, env: AppEnv, id: string) => {
  const u = await requireUser(req, env)
  await ownEvent(env, id, u.id)
  const { results } = await env.DB.prepare('SELECT * FROM packs WHERE event_id = ? ORDER BY created_at').bind(id).all<PackRow>()
  return json(results.map(toPack))
}

/** Create a pack, or update the one this audience already has (one link per audience, so it never changes). */
export const savePack = async (req: Request, env: AppEnv, id: string) => {
  const u = await requirePro(req, env)
  await ownEvent(env, id, u.id)
  const { audience, opts } = clean(await readJson(req, 4000))
  const { results } = await env.DB.prepare('SELECT * FROM packs WHERE event_id = ?').bind(id).all<PackRow>()
  const existing = results.map(toPack).find((p) => p.audience.kind === audience.kind && p.audience.id === audience.id)
  if (existing) {
    await env.DB.prepare('UPDATE packs SET audience = ?, opts = ? WHERE token = ?').bind(JSON.stringify(audience), JSON.stringify(opts), existing.token).run()
    return json({ token: existing.token, audience, opts })
  }
  if (results.length >= 200) throw new HttpError(429, 'That’s a lot of packs — remove some first')
  const token = randomToken(24)
  await env.DB.prepare('INSERT INTO packs (token, event_id, owner, audience, opts) VALUES (?, ?, ?, ?, ?)').bind(token, id, u.id, JSON.stringify(audience), JSON.stringify(opts)).run()
  return json({ token, audience, opts })
}

export const deletePack = async (req: Request, env: AppEnv, id: string, token: string) => {
  const u = await requireUser(req, env)
  await ownEvent(env, id, u.id)
  await env.DB.prepare('DELETE FROM packs WHERE token = ? AND event_id = ?').bind(token, id).run()
  return json({ ok: true })
}
