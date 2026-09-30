import Stripe from 'stripe'
import { type AppEnv, HttpError, json, origin, requireUser } from './lib'

/**
 * Billing works two ways:
 *  - Payment Link (current): no Stripe secret key needed. The link is tagged with the user's id;
 *    the signed webhook activates Pro. "Manage billing" uses Stripe's no-code portal login link.
 *  - Checkout Sessions API: used when STRIPE_SECRET_KEY + STRIPE_PRICE_ID are set instead.
 */

const client = (env: AppEnv) => {
  if (!env.STRIPE_SECRET_KEY) return null
  return new Stripe(env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() })
}

/** Start the $39/mo subscription. */
export const checkout = async (req: Request, env: AppEnv) => {
  const u = await requireUser(req, env)
  if (u.is_pro) return json({ url: `${origin(req, env)}/?checkout=success` })

  if (env.STRIPE_PAYMENT_LINK) {
    const url = new URL(env.STRIPE_PAYMENT_LINK)
    // Comes back on checkout.session.completed, so the webhook knows whose account to upgrade.
    url.searchParams.set('client_reference_id', u.id)
    url.searchParams.set('prefilled_email', u.email)
    return json({ url: url.toString() })
  }

  const s = client(env)
  if (!s || !env.STRIPE_PRICE_ID) throw new HttpError(503, 'Billing is not configured yet')
  let customer = u.stripe_customer_id
  if (!customer) {
    customer = (await s.customers.create({ email: u.email, metadata: { user_id: u.id } })).id
    await env.DB.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').bind(customer, u.id).run()
  }
  const session = await s.checkout.sessions.create({
    mode: 'subscription',
    customer,
    client_reference_id: u.id,
    line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
    subscription_data: { metadata: { user_id: u.id } },
    allow_promotion_codes: true,
    success_url: `${origin(req, env)}/?checkout=success`,
    cancel_url: `${origin(req, env)}/`,
  })
  return json({ url: session.url })
}

/** Change card, see invoices, cancel. */
export const portal = async (req: Request, env: AppEnv) => {
  const u = await requireUser(req, env)
  if (env.STRIPE_PORTAL_LINK) {
    const url = new URL(env.STRIPE_PORTAL_LINK)
    url.searchParams.set('prefilled_email', u.email)
    return json({ url: url.toString() })
  }
  const s = client(env)
  if (!s) throw new HttpError(503, 'Billing management is not configured yet')
  if (!u.stripe_customer_id) throw new HttpError(400, 'No billing account yet')
  const session = await s.billingPortal.sessions.create({ customer: u.stripe_customer_id, return_url: origin(req, env) })
  return json({ url: session.url })
}

/* ---------- Webhook ---------- */

const TOLERANCE_S = 300

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Stripe's signature scheme: HMAC-SHA256 of "<timestamp>.<raw body>", checked against every v1 value. */
export const verifyStripeSignature = async (payload: string, header: string, secret: string, now = Date.now() / 1000) => {
  const parts = header.split(',').map((p) => p.split('='))
  const t = parts.find(([k]) => k === 't')?.[1]
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v)
  if (!t || !sigs.length) return false
  if (Math.abs(now - Number(t)) > TOLERANCE_S) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`)))
  return sigs.some((s) => safeEqual(s, expected))
}

const ACTIVE = new Set(['active', 'trialing'])

type SubLike = { status: string; customer: string | { id: string }; metadata?: Record<string, string>; items?: { data?: { current_period_end?: number }[] } }

/** Mirror a subscription onto its user. Unknown customers are ignored — checkout.session.completed links them first. */
const syncSubscription = async (env: AppEnv, sub: SubLike) => {
  const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  const periodEnd = sub.items?.data?.[0]?.current_period_end
  const res = await env.DB.prepare(
    `UPDATE users SET is_pro = ?, subscription_status = ?, current_period_end = ?
     WHERE stripe_customer_id = ? OR id = ?`,
  )
    .bind(ACTIVE.has(sub.status) ? 1 : 0, sub.status, periodEnd ? new Date(periodEnd * 1000).toISOString() : null, customer, sub.metadata?.user_id ?? '')
    .run()
  if (!res.meta.changes) console.warn(`Subscription for unknown customer ${customer} — ignored`)
}

export const webhook = async (req: Request, env: AppEnv) => {
  if (!env.STRIPE_WEBHOOK_SECRET) throw new HttpError(503, 'Webhook secret not configured')
  const signature = req.headers.get('stripe-signature')
  const payload = await req.text()
  if (!signature || !(await verifyStripeSignature(payload, signature, env.STRIPE_WEBHOOK_SECRET))) throw new HttpError(400, 'Bad signature')

  const event = JSON.parse(payload) as { type: string; data: { object: Record<string, unknown> } }
  const obj = event.data.object

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = obj as { mode?: string; client_reference_id?: string | null; customer?: string | null; customer_details?: { email?: string } | null; subscription?: string | null; payment_status?: string }
      if (session.mode !== 'subscription') break
      const userId = session.client_reference_id
      if (!userId) {
        // Paid through the bare link without signing in first — nothing to attach it to.
        console.warn(`Checkout ${session.customer} had no client_reference_id (email ${session.customer_details?.email ?? '?'})`)
        break
      }
      await env.DB.prepare('UPDATE users SET is_pro = 1, subscription_status = ?, stripe_customer_id = COALESCE(?, stripe_customer_id) WHERE id = ?')
        .bind(session.payment_status === 'paid' ? 'active' : 'incomplete', session.customer ?? null, userId)
        .run()
      // With API access, pull the exact subscription state (period end etc.).
      const s = client(env)
      if (s && session.subscription) await syncSubscription(env, (await s.subscriptions.retrieve(session.subscription)) as unknown as SubLike)
      break
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      await syncSubscription(env, obj as unknown as SubLike)
      break
  }
  return json({ received: true })
}
