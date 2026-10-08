import { type AppEnv, HttpError, currentUser, isDev, json, newId, sha256 } from './lib'

const PER_HOUR = 6
const MAX_PHOTOS = 3
const MAX_PHOTO_BYTES = 2_500_000
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const num = (v: File | string | null) => {
  const n = parseFloat(String(v ?? ''))
  return Number.isFinite(n) && n > 0 && n < 200 ? n : null
}

/** POST multipart: name, category, w, d, z (metres), notes, email, context, photo×≤3. No sign-in needed. */
export const submitItemRequest = async (req: Request, env: AppEnv) => {
  if (Number(req.headers.get('content-length') ?? 0) > MAX_PHOTOS * MAX_PHOTO_BYTES + 100_000) throw new HttpError(413, 'Those photos are too big — try smaller ones')
  const form = await req.formData().catch(() => {
    throw new HttpError(400, 'Expected a form upload')
  })
  const name = String(form.get('name') ?? '').trim()
  if (name.length < 2) throw new HttpError(400, 'What’s the item called?')
  if (name.length > 120) throw new HttpError(400, 'Keep the name under 120 characters')
  const notes = String(form.get('notes') ?? '').trim().slice(0, 2000)
  const category = String(form.get('category') ?? '').trim().slice(0, 60)
  const email = String(form.get('email') ?? '').trim().toLowerCase()
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) throw new HttpError(400, 'That email doesn’t look right')
  const context = String(form.get('context') ?? '{}').slice(0, 2000)

  const files = form.getAll('photo').filter((f): f is File => typeof f !== 'string')
  if (files.length > MAX_PHOTOS) throw new HttpError(400, `Up to ${MAX_PHOTOS} photos`)
  for (const f of files) {
    if (!TYPES[f.type]) throw new HttpError(400, 'Photos need to be JPEG, PNG or WebP')
    if (f.size > MAX_PHOTO_BYTES) throw new HttpError(413, 'Each photo needs to be under 2.5 MB')
  }

  const ipHash = await sha256(`request:${req.headers.get('cf-connecting-ip') ?? 'local'}`)
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM item_requests WHERE ip_hash = ? AND created_at > datetime('now', '-1 hour')").bind(ipHash).first<{ n: number }>()
  if ((recent?.n ?? 0) >= PER_HOUR) throw new HttpError(429, 'Thanks — that’s plenty for now. Try again in an hour.')

  const user = await currentUser(req, env)
  const id = newId('q')
  const photos: string[] = []
  for (const [n, f] of files.entries()) {
    const key = `requests/${id}/${n + 1}.${TYPES[f.type]}`
    await env.FILES.put(key, f.stream(), { httpMetadata: { contentType: f.type } })
    photos.push(key)
  }
  await env.DB.prepare('INSERT INTO item_requests (id, user_id, email, name, category, w, d, z, notes, photos, context, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, user?.id ?? null, email || user?.email || null, name, category, num(form.get('w')), num(form.get('d')), num(form.get('z')), notes, JSON.stringify(photos), context, ipHash)
    .run()

  if (env.FEEDBACK_TO && !isDev(env)) {
    try {
      const from = email || user?.email
      const size = ['w', 'd', 'z'].map((k) => num(form.get(k))).filter(Boolean).join(' × ')
      await env.EMAIL.send({
        to: env.FEEDBACK_TO,
        from: { email: env.EMAIL_FROM, name: `${env.APP_NAME || 'Plotline'} item requests` },
        ...(from ? { replyTo: from } : {}),
        subject: `Item request: ${name}${size ? ` (${size} m)` : ''}`,
        text: `${name}${category ? ` · ${category}` : ''}${size ? `\n${size} m` : ''}\n\n${notes}\n\n${photos.length} photo(s): npm run requests\nFrom: ${from ?? 'anonymous'}`,
        html: `<div style="font-family:system-ui,sans-serif"><p><b>${escapeHtml(name)}</b>${category ? ` · ${escapeHtml(category)}` : ''}${size ? `<br>${size} m` : ''}</p><p style="white-space:pre-wrap">${escapeHtml(notes)}</p><p style="color:#64748b;font-size:13px">${photos.length} photo(s) — <code>npm run requests</code><br>From: ${escapeHtml(from ?? 'anonymous')}</p></div>`,
      })
    } catch (e) {
      console.error('item request email failed', e)
    }
  }
  return json({ ok: true, id })
}
