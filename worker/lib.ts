/** Secrets set with `wrangler secret put` — not in wrangler.jsonc, so not in generated types. */
export interface Secrets {
  STRIPE_SECRET_KEY?: string
  STRIPE_PRICE_ID?: string
  STRIPE_WEBHOOK_SECRET?: string
  CLOUDCONVERT_API_KEY?: string
  APP_URL?: string
  /** Stripe Payment Link for the $39/mo plan (no secret key needed). */
  STRIPE_PAYMENT_LINK?: string
  /** Stripe no-code customer portal login link, for "Manage billing". */
  STRIPE_PORTAL_LINK?: string
  /** Where feedback notifications go (optional; needs Email Sending set up). */
  FEEDBACK_TO?: string
}

export type AppEnv = Env & Secrets

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

export const isDev = (env: AppEnv) => env.APP_ENV === 'development'

/** Where links in emails and Stripe redirects point. Local dev always uses the address it's running on. */
export const origin = (req: Request, env: AppEnv) => (isDev(env) ? new URL(req.url).origin : env.APP_URL || new URL(req.url).origin)

/* ---------- Tokens ---------- */

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export const randomToken = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)))

export const sha256 = async (s: string) => b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))))

export const newId = (prefix: string) => prefix + randomToken(9).replace(/[-_]/g, '').slice(0, 12).toLowerCase()

/* ---------- Sessions ---------- */

export const COOKIE = 'plotline_session'
const SESSION_DAYS = 30

export const sessionCookie = (env: AppEnv, value: string, maxAge = SESSION_DAYS * 86400) =>
  [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`, isDev(env) ? '' : 'Secure'].filter(Boolean).join('; ')

const readCookie = (req: Request, name: string) => {
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(req.headers.get('cookie') ?? '')
  return m ? m[1] : null
}

export interface User {
  id: string
  email: string
  is_pro: number
  stripe_customer_id: string | null
}

export const createSession = async (env: AppEnv, userId: string) => {
  const token = randomToken()
  await env.DB.prepare('INSERT INTO sessions (id_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), userId, Date.now() + SESSION_DAYS * 86400_000)
    .run()
  return token
}

export const currentUser = async (req: Request, env: AppEnv): Promise<User | null> => {
  const token = readCookie(req, COOKIE)
  if (!token) return null
  return env.DB.prepare(
    `SELECT u.id, u.email, u.is_pro, u.stripe_customer_id FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id_hash = ? AND s.expires_at > ?`,
  )
    .bind(await sha256(token), Date.now())
    .first<User>()
}

export const requireUser = async (req: Request, env: AppEnv) => {
  const u = await currentUser(req, env)
  if (!u) throw new HttpError(401, 'Sign in first')
  return u
}

export const requirePro = async (req: Request, env: AppEnv) => {
  const u = await requireUser(req, env)
  if (!u.is_pro) throw new HttpError(402, 'This needs a Pro plan')
  return u
}

export const endSession = async (req: Request, env: AppEnv) => {
  const token = readCookie(req, COOKIE)
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(await sha256(token)).run()
}

/**
 * Cookies are SameSite=Lax, which already blocks cross-site POSTs carrying them.
 * As a second guard, mutating requests must come from our own origin.
 */
export const checkOrigin = (req: Request) => {
  if (req.method === 'GET' || req.method === 'HEAD') return
  const o = req.headers.get('origin')
  if (o && o !== new URL(req.url).origin) throw new HttpError(403, 'Cross-origin request blocked')
}

export const readJson = async <T>(req: Request, maxBytes = 1_000_000): Promise<T> => {
  const text = await req.text()
  if (text.length > maxBytes) throw new HttpError(413, 'Request too large')
  try {
    return JSON.parse(text) as T
  } catch {
    throw new HttpError(400, 'Invalid JSON')
  }
}
