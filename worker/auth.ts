import { type AppEnv, HttpError, createSession, currentUser, endSession, isDev, json, newId, origin, randomToken, readJson, sessionCookie, sha256 } from './lib'

const LINK_MINUTES = 20
const MAX_LINKS_PER_15_MIN = 5

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** POST { email } — emails a one-time sign-in link. */
export const startSignIn = async (req: Request, env: AppEnv) => {
  const { email: raw } = await readJson<{ email?: string }>(req, 2000)
  const email = (raw ?? '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new HttpError(400, 'Enter a valid email address')

  const since = Date.now() - 15 * 60_000
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_tokens WHERE email = ? AND created_at > ?').bind(email, since).first<{ n: number }>()
  if ((recent?.n ?? 0) >= MAX_LINKS_PER_15_MIN) throw new HttpError(429, 'Too many sign-in emails — try again in a few minutes')

  const token = randomToken()
  await env.DB.prepare('INSERT INTO login_tokens (token_hash, email, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), email, Date.now() + LINK_MINUTES * 60_000, Date.now())
    .run()
  const link = `${origin(req, env)}/api/auth/verify?token=${token}`

  // Local dev has no email domain: hand the link back so it can be clicked on screen.
  if (isDev(env)) return json({ sent: true, devLink: link })

  const name = env.APP_NAME || 'Plotline'
  await env.EMAIL.send({
    to: email,
    from: { email: env.EMAIL_FROM, name },
    subject: `Your ${name} sign-in link`,
    text: `Sign in to ${name}:\n\n${link}\n\nThis link works once and expires in ${LINK_MINUTES} minutes. If you didn't ask for it, ignore this email.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px;color:#0f172a">
      <h1 style="font-size:20px">Sign in to ${escapeHtml(name)}</h1>
      <p><a href="${link}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Sign in</a></p>
      <p style="color:#64748b;font-size:13px">This link works once and expires in ${LINK_MINUTES} minutes. If you didn't ask for it, you can ignore this email.</p>
    </div>`,
  })
  return json({ sent: true })
}

/** GET ?token= — the link in the email. Signs in and returns to the app. */
export const verifySignIn = async (req: Request, env: AppEnv) => {
  const token = new URL(req.url).searchParams.get('token') ?? ''
  const back = (q: string) => Response.redirect(`${origin(req, env)}/?${q}`, 302)
  const row = await env.DB.prepare('SELECT email, expires_at, used FROM login_tokens WHERE token_hash = ?')
    .bind(await sha256(token))
    .first<{ email: string; expires_at: number; used: number }>()
  if (!row || row.used || row.expires_at < Date.now()) return back('signin=expired')

  // Single use, even if two clicks race.
  const claim = await env.DB.prepare('UPDATE login_tokens SET used = 1 WHERE token_hash = ? AND used = 0').bind(await sha256(token)).run()
  if (!claim.meta.changes) return back('signin=expired')

  await env.DB.prepare('INSERT INTO users (id, email) VALUES (?, ?) ON CONFLICT (email) DO NOTHING').bind(newId('u'), row.email).run()
  const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(row.email).first<{ id: string }>()
  const session = await createSession(env, user!.id)
  return new Response(null, { status: 302, headers: { Location: `${origin(req, env)}/?signin=ok`, 'Set-Cookie': sessionCookie(env, session) } })
}

export const signOut = async (req: Request, env: AppEnv) => {
  await endSession(req, env)
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(env, '', 0) })
}

export const me = async (req: Request, env: AppEnv) => {
  const u = await currentUser(req, env)
  return json({ user: u ? { id: u.id, email: u.email } : null, isPro: !!u?.is_pro, dev: isDev(env) })
}

/** Development only: flip Pro without Stripe so paid features can be tested. */
export const devSetPro = async (req: Request, env: AppEnv) => {
  if (!isDev(env)) throw new HttpError(404, 'Not found')
  const u = await currentUser(req, env)
  if (!u) throw new HttpError(401, 'Sign in first')
  const { on } = await readJson<{ on: boolean }>(req)
  await env.DB.prepare('UPDATE users SET is_pro = ? WHERE id = ?').bind(on ? 1 : 0, u.id).run()
  return json({ isPro: on })
}
