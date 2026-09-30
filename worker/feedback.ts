import { type AppEnv, HttpError, currentUser, isDev, json, newId, readJson, sha256 } from './lib'

const KINDS = new Set(['idea', 'problem', 'other'])
const PER_HOUR = 10
const KIND_LABEL: Record<string, string> = { idea: 'Idea', problem: 'Problem', other: 'Other' }

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** POST { kind, message, email?, context? } — no sign-in needed. */
export const submitFeedback = async (req: Request, env: AppEnv) => {
  const body = await readJson<{ kind?: string; message?: string; email?: string; context?: Record<string, unknown> }>(req, 20_000)
  const kind = KINDS.has(body.kind ?? '') ? body.kind! : 'other'
  const message = (body.message ?? '').trim()
  if (message.length < 3) throw new HttpError(400, 'Tell us a little more')
  if (message.length > 4000) throw new HttpError(400, 'That’s a bit long — keep it under 4,000 characters')
  const email = (body.email ?? '').trim().toLowerCase()
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) throw new HttpError(400, 'That email doesn’t look right')
  const context = JSON.stringify(body.context ?? {}).slice(0, 2000)

  // Rate limit per visitor without storing their IP.
  const ipHash = await sha256(`feedback:${req.headers.get('cf-connecting-ip') ?? 'local'}`)
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM feedback WHERE ip_hash = ? AND created_at > datetime('now', '-1 hour')").bind(ipHash).first<{ n: number }>()
  if ((recent?.n ?? 0) >= PER_HOUR) throw new HttpError(429, 'Thanks — that’s plenty for now. Try again in an hour.')

  const user = await currentUser(req, env)
  const id = newId('f')
  await env.DB.prepare('INSERT INTO feedback (id, user_id, email, kind, message, context, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, user?.id ?? null, email || user?.email || null, kind, message, context, ipHash)
    .run()

  // Optional heads-up by email once a sending domain is set up. Never fails the request.
  if (env.FEEDBACK_TO && !isDev(env)) {
    try {
      const from = email || user?.email
      await env.EMAIL.send({
        to: env.FEEDBACK_TO,
        from: { email: env.EMAIL_FROM, name: `${env.APP_NAME || 'Plotline'} feedback` },
        ...(from ? { replyTo: from } : {}),
        subject: `${KIND_LABEL[kind]}: ${message.slice(0, 60)}${message.length > 60 ? '…' : ''}`,
        text: `${message}\n\nFrom: ${from ?? 'anonymous'}\nContext: ${context}`,
        html: `<div style="font-family:system-ui,sans-serif"><p style="white-space:pre-wrap">${escapeHtml(message)}</p><p style="color:#64748b;font-size:13px">From: ${escapeHtml(from ?? 'anonymous')}<br>Context: ${escapeHtml(context)}</p></div>`,
      })
    } catch (e) {
      console.error('feedback email failed', e)
    }
  }
  return json({ ok: true })
}
