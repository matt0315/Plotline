import { type AppEnv, HttpError, checkOrigin, json } from './lib'
import { devSetPro, me, signOut, startSignIn, verifySignIn } from './auth'
import * as events from './events'
import * as plans from './plans'
import * as billing from './billing'
import * as dwg from './dwg'

type Handler = (req: Request, env: AppEnv, ...params: string[]) => Promise<Response>

/** [method, path pattern, handler]. `:x` segments are passed to the handler in order. */
const ROUTES: [string, string, Handler][] = [
  ['GET', '/api/me', me],
  ['POST', '/api/auth/start', startSignIn],
  ['GET', '/api/auth/verify', verifySignIn],
  ['POST', '/api/auth/logout', signOut],
  ['POST', '/api/dev/pro', devSetPro],

  ['GET', '/api/events', events.listEvents],
  ['GET', '/api/events/:id', events.getEvent],
  ['PUT', '/api/events/:id', events.putEvent],
  ['DELETE', '/api/events/:id', events.deleteEvent],
  ['GET', '/api/events/:id/share', events.getShare],
  ['POST', '/api/events/:id/share', events.createShare],
  ['DELETE', '/api/events/:id/share', events.revokeShare],
  ['GET', '/api/events/:id/responses', events.listResponses],
  ['DELETE', '/api/events/:id/responses', events.clearResponses],

  ['GET', '/api/shared/:token', events.getShared],
  ['GET', '/api/shared/:token/plan-image', events.getSharedPlanImage],
  ['POST', '/api/shared/:token/responses', events.submitResponse],

  ['GET', '/api/plans', plans.listOwnPlans],
  ['GET', '/api/plans/public', plans.searchPublicPlans],
  ['PUT', '/api/plans/:id', plans.putPlan],
  ['PUT', '/api/plans/:id/image', plans.putPlanImage],
  ['GET', '/api/plans/:id/image', plans.getPlanImage],
  ['DELETE', '/api/plans/:id', plans.deletePlan],

  ['POST', '/api/checkout', billing.checkout],
  ['POST', '/api/portal', billing.portal],
  ['POST', '/api/stripe-webhook', billing.webhook],

  ['POST', '/api/convert-dwg', dwg.startDwg],
  ['GET', '/api/convert-dwg', dwg.pollDwg],
]

const match = (pattern: string, path: string): string[] | null => {
  const a = pattern.split('/')
  const b = path.split('/')
  if (a.length !== b.length) return null
  const params: string[] = []
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params.push(decodeURIComponent(b[i]))
    else if (a[i] !== b[i]) return null
  }
  return params
}

export default {
  async fetch(req, env) {
    const path = new URL(req.url).pathname.replace(/\/+$/, '') || '/'
    try {
      let pathMatched = false
      for (const [method, pattern, handler] of ROUTES) {
        const params = match(pattern, path)
        if (!params) continue
        pathMatched = true
        if (method !== req.method) continue
        // Stripe signs its webhook; it doesn't send our Origin.
        if (path !== '/api/stripe-webhook') checkOrigin(req)
        return await handler(req, env, ...params)
      }
      return json({ error: pathMatched ? 'Method not allowed' : 'Not found' }, pathMatched ? 405 : 404)
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status)
      console.error(e)
      return json({ error: 'Something went wrong' }, 500)
    }
  },
} satisfies ExportedHandler<AppEnv>
