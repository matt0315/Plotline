// npm run stats — who's using Plotline: accounts and Pro from D1, app opens from Cloudflare analytics.
// Free users plan in their own browser without an account, so app opens are the only way to count them.
import { execSync } from 'node:child_process'

const ZONE = 'dc733bae3707d1ed2a759ccb26995fca' // plotlineapp.online
// Cloudflare's free plan keeps about 30 days of request analytics.
const DAYS = Math.min(29, Number(process.argv[2]) || 7)
const run = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

/* ---------- Accounts (D1) ---------- */
const sql = `SELECT
  (SELECT COUNT(*) FROM users) AS accounts,
  (SELECT COUNT(*) FROM users WHERE is_pro = 1) AS pro,
  (SELECT COUNT(*) FROM users WHERE created_at > datetime('now','-7 days')) AS new_7d,
  (SELECT COUNT(*) FROM users WHERE created_at > datetime('now','-30 days')) AS new_30d,
  (SELECT COUNT(DISTINCT owner) FROM events) AS syncing,
  (SELECT COUNT(*) FROM events) AS cloud_events,
  (SELECT COUNT(*) FROM feedback WHERE created_at > datetime('now','-30 days')) AS feedback_30d,
  (SELECT COUNT(*) FROM item_requests WHERE created_at > datetime('now','-30 days')) AS requests_30d`
const db = JSON.parse(run(`npx wrangler d1 execute plotline --remote --json --command "${sql.replace(/\n/g, ' ')}"`))[0].results[0]

console.log('\nAccounts')
console.log(`  Signed-up accounts   ${db.accounts}   (+${db.new_7d} this week, +${db.new_30d} in 30 days)`)
console.log(`  Paying (Pro)         ${db.pro}   ≈ US$${db.pro * 39}/month`)
console.log(`  Syncing events       ${db.cloud_events} events from ${db.syncing} people`)
console.log(`  Feedback / requests  ${db.feedback_30d} / ${db.requests_30d} in the last 30 days`)

/* ---------- Usage (anonymous counts from the app) ---------- */
const q = (sql) => JSON.parse(run(`npx wrangler d1 execute plotline --remote --json --command "${sql}"`))[0].results
const LABEL = {
  app_open: 'App opened',
  shared_view: 'Shared link viewed',
  event_created: 'Event created',
  export: 'PDF exported',
  export_tableplan: 'Table plan downloaded',
  export_3d: '3D picture saved',
  view_3d: '3D view opened',
  seat_view: 'View from a seat',
  fill: 'Fill an area used',
  auto_seat: 'Auto-seat used',
  guests_import: 'Guest list imported',
  import_drawing: 'Venue drawing imported',
  kit_item: 'Kit item added',
  share_created: 'Share link made',
  signin_start: 'Sign-in started',
  upgrade_click: 'Upgrade clicked',
}
try {
  const since = `date('now','-${DAYS} days')`
  const daily = q(`SELECT day, COUNT(*) AS browsers FROM usage_devices WHERE day > ${since} GROUP BY day ORDER BY day`)
  const events = q(`SELECT event, SUM(n) AS n FROM usage_daily WHERE day > ${since} GROUP BY event ORDER BY n DESC`)
  console.log(`\nUsage, last ${DAYS} days (anonymous — counts only, never event content)`)
  if (!events.length) console.log('  Nothing counted yet.')
  else {
    const avg = daily.length ? (daily.reduce((s, r) => s + r.browsers, 0) / daily.length).toFixed(1) : '0'
    console.log(`  Active browsers         ${avg} a day on average · busiest ${Math.max(0, ...daily.map((r) => r.browsers))}`)
    // Group variants under their event: "Event created  12  (wedding 7, party 3, blank 2)".
    const byName = new Map()
    for (const r of events) {
      const [name, variant] = r.event.split(':')
      const g = byName.get(name) ?? { n: 0, parts: [] }
      g.n += r.n
      if (variant) g.parts.push(`${variant} ${r.n}`)
      byName.set(name, g)
    }
    for (const [name, g] of [...byName.entries()].sort((a, b) => b[1].n - a[1].n))
      console.log(`  ${(LABEL[name] ?? name).padEnd(24)}${String(g.n).padStart(4)}${g.parts.length ? `   (${g.parts.join(', ')})` : ''}`)
  }
} catch (e) {
  console.log(`\nUsage: couldn't read the counts (${e.message.split('\n')[0]})`)
}

/* ---------- Visitors (Cloudflare analytics) ---------- */
// The app calls /api/me every time it opens in a real browser; bots that only fetch the page don't.
try {
  const token = run('npx wrangler auth token').trim().split('\n').pop()
  const since = new Date(Date.now() - DAYS * 86400e3).toISOString()
  const query = `{ viewer { zones(filter:{zoneTag:"${ZONE}"}) {
    opens: httpRequestsAdaptiveGroups(limit:5000, filter:{datetime_geq:"${since}", clientRequestPath:"/api/me"}) { count dimensions { clientIP clientCountryName userAgentBrowser } }
  } } }`
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })
  const body = await res.json()
  if (body.errors?.length) throw new Error(body.errors[0].message)
  const rows = body.data.viewer.zones[0].opens.filter((r) => !/bot|crawler|spider|headless|curl/i.test(r.dimensions.userAgentBrowser))
  const people = new Set(rows.map((r) => r.dimensions.clientIP))
  const opens = rows.reduce((n, r) => n + r.count, 0)
  const byCountry = new Map()
  for (const r of rows) byCountry.set(r.dimensions.clientCountryName, (byCountry.get(r.dimensions.clientCountryName) ?? new Set()).add(r.dimensions.clientIP))
  const top = [...byCountry.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, 6).map(([c, s]) => `${c} ${s.size}`).join(' · ')
  console.log(`\nVisitors, last ${DAYS} days (anyone who opened the app, with or without an account)`)
  console.log(`  People (by connection)  ${people.size}`)
  console.log(`  App opens               ${opens}`)
  if (top) console.log(`  Where                   ${top}`)
  console.log('  Note: counts include you, and automated site checkers that run JavaScript.')
} catch (e) {
  console.log(`\nVisitors: couldn't read Cloudflare analytics (${e.message.split('\n')[0]})`)
}
console.log(`\nMore detail: dash.cloudflare.com → plotlineapp.online → Analytics & Logs. Try: npm run stats 29 (the longest Cloudflare keeps)\n`)
