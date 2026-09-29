import Stripe from 'stripe'
import { type AppEnv, HttpError, json, origin, requireUser } from './lib'

const client = (env: AppEnv) => {
  if (!env.STRIPE_SECRET_KEY) throw new HttpError(503, 'Billing is not configured yet')
  return new Stripe(env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() })
}

/** Start the $39/mo subscription in Stripe Checkout. */
export const checkout = async (req: Request, env: AppEnv) => {
  const u = await requireUser(req, env)
  if (u.is_pro) return json({ url: `${origin(req, env)}/?checkout=success` })
  if (!env.STRIPE_PRICE_ID) throw new HttpError(503, 'Billing is not configured yet')
  const s = client(env)
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

/** Stripe's hosted page: change card, see invoices, cancel. */
export const portal = async (req: Request, env: AppEnv) => {
  const u = await requireUser(req, env)
  if (!u.stripe_customer_id) throw new HttpError(400, 'No billing account yet')
  const session = await client(env).billingPortal.sessions.create({ customer: u.stripe_customer_id, return_url: origin(req, env) })
  return json({ url: session.url })
}

const ACTIVE = new Set(['active', 'trialing'])

/** Mirror a subscription onto the user. This is the only thing that grants Pro. */
const sync = async (env: AppEnv, sub: Stripe.Subscription) => {
  const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  const periodEnd = sub.items.data[0]?.current_period_end
  const byMeta = sub.metadata?.user_id
  const res = await env.DB.prepare(
    `UPDATE users SET is_pro = ?, subscription_status = ?, stripe_customer_id = ?, current_period_end = ?
     WHERE id = ? OR stripe_customer_id = ?`,
  )
    .bind(ACTIVE.has(sub.status) ? 1 : 0, sub.status, customer, periodEnd ? new Date(periodEnd * 1000).toISOString() : null, byMeta ?? '', customer)
    .run()
  if (!res.meta.changes) throw new HttpError(400, `No user for customer ${customer}`)
}

export const webhook = async (req: Request, env: AppEnv) => {
  if (!env.STRIPE_WEBHOOK_SECRET) throw new HttpError(503, 'Webhook secret not configured')
  const signature = req.headers.get('stripe-signature')
  if (!signature) throw new HttpError(400, 'Missing signature')
  const s = client(env)
  let event: Stripe.Event
  try {
    // Verify against the raw body with WebCrypto (no Node crypto on Workers).
    event = await s.webhooks.constructEventAsync(await req.text(), signature, env.STRIPE_WEBHOOK_SECRET, undefined, Stripe.createSubtleCryptoProvider())
  } catch {
    throw new HttpError(400, 'Bad signature')
  }
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      if (session.mode === 'subscription' && session.subscription) {
        const id = typeof session.subscription === 'string' ? session.subscription : session.subscription.id
        await sync(env, await s.subscriptions.retrieve(id))
      }
      break
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      await sync(env, event.data.object)
      break
  }
  return json({ received: true })
}
