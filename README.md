# Plotline

Plan a whole event in one place: floor plan, satellite site map, guests and seating, run sheet, suppliers, budget, forms and crew. Open it and start — no signup.

Built as a faster, simpler competitor to GoodEvent. GoodEvent sells seven separate products (Maps, Layout, Docs, Planner, Time, Business, Network). Plotline puts all of that into **one event document**, so the modules are linked instead of re-typed:

| You do this… | …and this updates by itself |
|---|---|
| Drag a guest onto a chair | Guest list shows their table; seating counts update |
| Book a supplier's quote | Budget actual and forecast update; top-bar over/under changes |
| Set a supplier's arrival time | It appears on the run sheet |
| Set crew call times and rates | Calls go on the run sheet; hours × rate goes into the budget |
| Place tables, bars, marquees | The load list counts them |
| Crew fill a form on a share link | The response lands in Docs on your next open |

## What's in it

- **30-second onboarding.** Pick event type, headcount, date and venue. It generates a correctly spaced floor plan, a timed run sheet, a USD budget with typical costs, a supplier checklist linked to the budget, forms and crew call times.
- **Floor plan.** Drag and drop 27 furniture types. Rotate, resize, snap, align, measure, lock, and use layers. Chairs are drawn around tables. It flags walkways under 0.915 m (36 in) and anything blocking a fire exit.
- **Staging from real decks.** Stages are built from standard 2.44 × 1.22 m (8 × 4 ft) decks: speaker riser, DJ riser, bridal stage, band stage, presentation stage, main stage and catwalk. You can resize by whole decks, turn them, and set the leg height (200–1200 mm). The inspector and load list count the decks, legs, stair sets and skirting, and flag heights that usually need handrails.
- **Venue drawings.** Import DXF, DWG, PDF or a photo and design on top of it. DXF units are read from the file. PDFs can use their printed scale (1:100, etc.). For anything else, draw along one known wall to set the scale.
- **Venue library.** Plans are private by default. A venue can publish its plan so organisers can find it and plan on it.
- **Site map.** Real satellite imagery. Assets are placed at true size. Draw zones to get area and perimeter, and measure distances.
- **Guests.** Paste a list or import a CSV (columns are detected automatically). Track RSVPs, groups, dietary needs and plus-ones. Seat guests by dragging, or auto-seat by group.
- **Run sheet.** Split into set-up, event and pack-down. Handles overnight builds. "Shift this and everything after" moves the rest of the day when things slip.
- **Suppliers.** Group by category and compare quotes side by side against the budget. Choosing one books it and declines the others.
- **Budget.** Shows target, forecast, committed, paid and due, with a category breakdown.
- **Docs.** A form builder with 7 safety and ops templates. Forms support photo capture and on-screen signatures. You can get a crew QR link (no login needed), a CSV of responses, and PDFs.
- **Crew.** Roster with call and finish times, hours, rates and a call sheet.
- **Export event pack.** One PDF with the cover, floor plan (vector), site map, seating chart, place cards, guest list, run sheet, suppliers, crew, budget and load list.
- **Feedback button.** It's in the top bar on every screen, so anyone (no account needed) can say what they need. Submissions are saved to D1 with which screen they were on and their event type, never their event data. Read them with `npm run feedback`.
- **Also:** ⌘K command palette, undo/redo (drags count as one step), autosave, works on phones.

## Pricing

**One price: $39/month USD.** Everything is included, with no per-seat fees.

- **Free:** one event, stored in the browser, watermarked exports. DXF, PDF and image import all work, because they're parsed in the browser.
- **Pro ($39/mo):** unlimited events, cloud sync, live share links and crew form links, clean exports, DWG conversion, and publishing to the venue library.
- **Venues:** free to upload. Premium venue listings are planned as a later revenue line.

Unit economics at $39: Stripe takes about $1.43 and infrastructure a few cents, so each user contributes about **$37.40**. Fixed cost is the **Cloudflare Workers Paid plan at $5/mo**, which includes the database, file storage and 3,000 sign-in emails a month, plus your domain. **Break-even is 1 customer.** Satellite tiles from ArcGIS are free up to 2M a month, then $0.15 per 1,000.

## Stack

React 19 + TypeScript + Vite · Tailwind v4 · Zustand + Immer (undo/redo) · Leaflet with ArcGIS satellite imagery · hand-rolled SVG floor plan editor · `dxf`, `pdfjs-dist` for imports · jsPDF + svg2pdf for export.

Backend, all on **Cloudflare**:

- **Workers** serve the app and the `/api` routes (`worker/`).
- **D1** holds accounts, sessions, event metadata, venue plans and pending crew responses (`migrations/`).
- **R2** holds event documents and venue drawings.
- **Email Service** sends magic-link sign-in emails.
- **Stripe** (Checkout and Customer Portal) handles billing. **CloudConvert** handles DWG conversion.

How it's put together:

- `src/types/event.ts` is the whole data model. Every module reads and writes one `EventDoc`.
- `src/store/persistence.ts` is the **only** code that knows where data lives. It always writes to the browser (IndexedDB), and also writes to the Worker when signed in on Pro.
- The browser never talks to the database. Every `/api` route checks the session cookie and, for paid features, the user's Pro flag, so the paywall can't be bypassed from the client. `src/store/account.ts#gate()` mirrors those checks in the UI.
- `src/lib/derived.ts` holds every cross-module link (budget read-through, run-sheet rows from suppliers and crew, seating stats, load list, "what's next"). These are computed, not copied, so they can't drift.

Security notes:

- Sessions are HttpOnly, SameSite=Lax cookies, and the database stores only hashes of session and sign-in tokens.
- Sign-in links work once, expire after 20 minutes, and are rate-limited per email.
- Mutating requests from another origin are rejected.
- Share tokens are 192-bit random values.
- Crew responses go to a holding table rather than into the event, so an organiser's autosave can never overwrite one.

## Run it locally

Needs **Node 22+** (Wrangler requires it; there's an `.nvmrc`).

```bash
npm install
npm run db:migrate:local   # creates the local D1 database
npm run dev
```

`npm run dev` runs the app and the Worker together, with a local D1 database, local R2 and a simulated email binding. In development (`APP_ENV=development` in `.dev.vars`):

- Sign-in links appear on screen instead of being emailed.
- The account menu has a **Dev: switch to Pro** toggle for testing paid features without Stripe.

## Going live on Cloudflare

1. **Log in and create resources**

   ```bash
   npx wrangler login
   npx wrangler d1 create plotline          # copy the database_id into wrangler.jsonc
   npx wrangler r2 bucket create plotline-files
   npm run db:migrate:remote
   ```

2. **Email.** Onboard your sending domain with `npx wrangler email sending enable yourdomain.com` (this adds the SPF/DKIM records). Then set `EMAIL_FROM` in `wrangler.jsonc`, for example `hello@yourdomain.com`.

3. **Satellite imagery.** Create an API key in the ArcGIS Location Platform developer dashboard, scoped to basemaps. Set `VITE_ARCGIS_KEY` in `.env.local` or your build environment. **Don't launch without a key:** the dev fallback uses Esri's public endpoint, which isn't licensed for commercial use. MapTiler and Mapbox keys also work (see `.env.example`).

4. **Stripe**
   - Create a product "Plotline Pro" with a **recurring $39.00 USD monthly** price.
   - Run `npx wrangler secret put STRIPE_SECRET_KEY` and `npx wrangler secret put STRIPE_PRICE_ID`.
   - Add a webhook endpoint at `https://<your-domain>/api/stripe-webhook` for `checkout.session.completed` and `customer.subscription.created`, `.updated`, `.deleted`, `.paused` and `.resumed`. Then run `npx wrangler secret put STRIPE_WEBHOOK_SECRET`.
   - Turn on the Customer Portal and allow cancellation.

   The webhook is the only thing that grants Pro.

5. **Feedback alerts (optional).** Feedback is always saved to D1; run `npm run feedback` to read the latest 50. To also get each one by email, set a `FEEDBACK_TO` variable (for example `npx wrangler secret put FEEDBACK_TO`). This needs Email Sending set up (step 2). Replies go straight to the sender when they left an email.

6. **DWG (optional).** Run `npx wrangler secret put CLOUDCONVERT_API_KEY`. The browser uploads directly to CloudConvert, and jobs are tagged with the user's ID. LibreDWG is deliberately not used because it's GPL v3.

7. **Deploy**

   ```bash
   npm run deploy
   ```

   Then attach your domain under Workers → plotline → Domains & Routes.

## Deliberately not built (yet)

- Live multi-cursor editing. Cloud sync and share links are in; Cloudflare Durable Objects would add this without a rewrite.
- GoodEvent Time's geofenced clock-in with selfies. Crew rosters and call times are in.
- A two-sided supplier marketplace (GoodEvent Network). Suppliers is your own private directory. A good next step is "find suppliers near this venue" via an Apify Google Maps actor.
- Hire-company tooling: stock control, invoicing your own clients, Xero sync.
- DXF text, dimensions and hatches. Imports carry geometry and line colour only.
