import { type AppEnv, readJson, sha256 } from './lib'

/** The only events counted. Anything else is ignored, so the table can't fill with junk. */
const EVENTS = new Set([
  'app_open',
  'shared_view',
  'event_created',
  'export',
  'export_tableplan',
  'export_3d',
  'view_3d',
  'seat_view',
  'fill',
  'auto_seat',
  'guests_import',
  'import_drawing',
  'kit_item',
  'share_created',
  'signin_start',
  'upgrade_click',
])

const ok = () => new Response(null, { status: 204 })

/** POST { e, v?, d? } — an event name, an optional variant (e.g. the event type) and a random browser id. */
export const track = async (req: Request, env: AppEnv) => {
  const body = await readJson<{ e?: string; v?: string; d?: string }>(req, 500).catch(() => null)
  const name = body?.e ?? ''
  if (!EVENTS.has(name)) return ok()
  const variant = /^[a-z0-9_-]{1,24}$/.test(body?.v ?? '') ? body!.v : ''
  const day = new Date().toISOString().slice(0, 10)
  const stmts = [env.DB.prepare('INSERT INTO usage_daily (day, event, n) VALUES (?, ?, 1) ON CONFLICT (day, event) DO UPDATE SET n = n + 1').bind(day, variant ? `${name}:${variant}` : name)]
  if (/^[a-z0-9-]{8,64}$/.test(body?.d ?? '')) stmts.push(env.DB.prepare('INSERT OR IGNORE INTO usage_devices (day, device) VALUES (?, ?)').bind(day, await sha256(`${day}:${body!.d}`)))
  await env.DB.batch(stmts)
  return ok()
}
