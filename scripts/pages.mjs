// npm run pages — builds the static marketing pages, robots.txt and sitemap.xml into public/.
// Edit the words here, not the generated HTML. Each page targets one thing people search for.
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SITE = 'https://www.plotlineapp.online'
const OUT = fileURLToPath(new URL('../public/', import.meta.url))
const TODAY = new Date().toISOString().slice(0, 10)
const PRICE = 'US$39/month'

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const strip = (s) => s.replace(/<[^>]+>/g, '')

const NAV = [
  ['/event-floor-plan/', 'Floor plans'],
  ['/wedding-seating-chart/', 'Seating charts'],
  ['/marquee-layout-planner/', 'Marquees'],
  ['/event-run-sheet/', 'Run sheets'],
  ['/help/', 'Help'],
]

const FREE_FAQ = {
  q: 'Is it free?',
  a: `Yes. The free plan includes every planning feature for one event, saved in your browser, with no signup. Exports carry a small watermark. Pro (${PRICE}) adds unlimited events, clean exports, sync across devices and live share links for clients and crew.`,
}

/* ---------- Pages ---------- */

const PAGES = [
  {
    slug: 'event-floor-plan',
    title: 'Event Floor Plan Software — Free, To Scale, in 2D and 3D | Plotline',
    description: 'Draw an event floor plan to scale in your browser. Import the venue drawing, fill the room with tables, check walkways and exits, then walk through it in 3D. Free to start.',
    eyebrow: 'Event floor plans',
    h1: 'Event floor plans to scale, in 2D and 3D',
    lede: 'Start from the venue’s drawing or a blank room, fill it with tables in one go, and see straight away whether walkways, exits and sightlines work. Then walk through it in 3D.',
    hero: ['floor-plan.jpg', 'A wedding floor plan in Plotline with round tables, dance floor, bar and exits, checked for walkways'],
    features: [
      ['Import the venue’s drawing', 'Drop in a DXF from the venue’s CAD file, a PDF or a photo of the floor plan, set the scale, and design on top of it.'],
      ['176 items, to real sizes', 'Rounds, trestles, banquet and cocktail tables, staging, AV, bars, dance floors, marquees, toilets and barriers. Add your own kit with its sizes.'],
      ['Fill an area', 'Draw a box or pick a room and Plotline lays out rounds, trestle runs, theatre rows or cocktail tables, keeping exits and the stage front clear.'],
      ['Walkway and exit checks', 'Gaps under 915 mm are flagged as you work. A capacity guide shows how many people the space suits and whether the exit width is enough.'],
      ['3D and view from a seat', 'Orbit or walk through the room in Day, Golden hour or Night light, and see exactly what a guest sees from their chair.'],
      ['Exports people can use', 'A clean PDF pack for the venue, caterer and crew, a PNG of the 3D view, and a load list of everything to hire.'],
    ],
    split: ['3d-golden.jpg', 'The same floor plan in 3D at golden hour', 'See it before the day', 'Switch from 2D to 3D at any time. The sightline check flags seats with a pillar, pole or speaker stack between them and the stage, and tints those chairs on the plan so you can move them.'],
    steps: [
      ['Tell us the event', 'Pick the type and guest count. Plotline drafts a floor plan sized for them.'],
      ['Bring in the room', 'Import the venue drawing or set the room’s width and depth.'],
      ['Lay it out', 'Drag items from the library, or fill an area with tables in one click.'],
      ['Check and share', 'Fix anything flagged, then export the PDF or share a live link.'],
    ],
    faq: [
      { q: 'Is the floor plan really to scale?', a: 'Yes. Everything is drawn in metres (or feet), from table diameters and chair spacing to stage decks, so what fits on screen fits in the room.' },
      { q: 'Can I use the venue’s CAD drawing?', a: 'Yes. Import a DXF, a PDF or a photo of the plan, set two points of known distance, and it becomes the background you design on.' },
      { q: 'Does it check fire exits and walkways?', a: 'It flags walkways under 915 mm, items blocking an exit, and too little exit width for the number of people (5 mm per person, with at least two exits over 50 people). It’s a planning guide: your venue licence and local code decide the real numbers.' },
      { q: 'Do I need to install anything for 3D?', a: 'No. Plotline runs in your browser on a laptop, tablet or phone, including the 3D view.' },
      FREE_FAQ,
    ],
  },
  {
    slug: 'wedding-seating-chart',
    title: 'Free Wedding Seating Chart Maker — Drag, Drop and Print | Plotline',
    description: 'Make your wedding seating chart on a real floor plan. Paste your guest list, drag guests to seats or auto-seat them, then print a table plan and place cards. Free, no signup.',
    eyebrow: 'Wedding seating chart',
    h1: 'A wedding seating chart that matches the real room',
    lede: 'Paste your guest list, drop guests onto chairs on a to-scale floor plan, and print a table plan your venue, caterer and stationer can all use.',
    hero: ['guests.jpg', 'A wedding guest list in Plotline with RSVPs, dietary needs and table numbers'],
    features: [
      ['Paste your guest list', 'Copy names from a spreadsheet, Google Sheets or your RSVP site, or import a CSV. Groups, emails, RSVPs and dietary needs come with them.'],
      ['Seat guests in seconds', 'Drag a guest onto a chair, or press Auto-seat to fill tables and keep couples, families and groups together.'],
      ['Round tables or long tables', 'Use rounds, a head table, or long tables made from trestles joined end to end. Seats update as you change the layout.'],
      ['Dietary needs per table', 'Every guest’s dietary note travels with them, so the caterer’s list shows exactly what’s needed at each table.'],
      ['A table plan worth printing', 'Download an alphabetical list, a by-table plan, place cards or a caterer’s list, in a choice of eight fonts and paper sizes.'],
      ['RSVPs in one place', 'Track who’s attending, pending or declined, and see unseated guests at a glance.'],
    ],
    split: ['floor-plan.jpg', 'Guests seated at round tables on a wedding floor plan', 'Seat people where they’ll actually sit', 'Because the seating chart is the floor plan, you can see who’s near the speakers, who’s by the dance floor and who has a clear view of the speeches.'],
    steps: [
      ['Start your wedding', 'Choose Wedding and your guest count. You get a floor plan, run sheet and budget to edit.'],
      ['Add your guests', 'Paste the list or import a CSV.'],
      ['Seat everyone', 'Auto-seat, then drag to fine-tune.'],
      ['Print the table plan', 'Pick a layout and font, then download the PDF.'],
    ],
    faq: [
      FREE_FAQ,
      { q: 'Can I import my guest list from Excel or Google Sheets?', a: 'Yes. Copy the rows and paste them, or upload a CSV. Plotline recognises columns like name, group, email, RSVP and dietary.' },
      { q: 'Can I print place cards and an escort card list?', a: 'Yes. The table plan download includes place cards, an alphabetical list (for a welcome sign or escort board), a list by table, and a caterer’s list with dietary needs.' },
      { q: 'Is my guest list uploaded anywhere?', a: 'On the free plan your event stays in your browser on your device. If you sign in on Pro, it syncs to your account so you can use it on other devices.' },
      { q: 'Can I plan long tables instead of rounds?', a: 'Yes. Join trestles end to end into long runs; the end chairs drop out where tables meet and the seat count updates.' },
    ],
  },
  {
    slug: 'marquee-layout-planner',
    title: 'Marquee Layout Planner and Size Guide | Plotline',
    description: 'Plan a marquee or tent layout to scale: frame, clearspan, sailcloth, stretch, pole and tipi. Poles are where they really stand, and a size guide shows how many guests fit.',
    eyebrow: 'Marquees and tents',
    h1: 'Marquee layout planner',
    lede: 'Lay out a marquee to scale with its poles where they really stand, fill it with tables around them, and check exits and sightlines before anything goes up.',
    hero: ['marquee.jpg', 'A 15 by 24 metre sailcloth marquee laid out with round tables, dance floor and DJ, with exits checked'],
    features: [
      ['Every common marquee', 'Frame, clearspan, sailcloth, stretch, pole and tipi presets, or set your own width and bay length.'],
      ['Poles in the right place', 'Legs, king poles and perimeter poles are drawn where they stand, and tables placed on one are flagged.'],
      ['Fill the marquee', 'Fill it with rounds, trestle runs, theatre rows or cocktail tables, worked around the poles and the dance floor.'],
      ['Who can’t see?', 'The sightline check finds seats with a pole between them and the band or speeches, so you can move them.'],
      ['On the satellite map', 'Place the marquee on a satellite view of the property alongside the toilets, generator, food trucks and parking.'],
      ['For hire companies', 'Add your own marquees and furniture with prices and stock. The load list counts frame, sidewall and weights, and shows any shortfall.'],
    ],
    table: {
      h2: 'What size marquee do I need?',
      intro: 'A quick guide using common planning densities: 1.2 m² per guest for a seated dinner, 0.7 m² for theatre rows, and 0.5 m² for a standing cocktail event. Leave room for the dance floor, bar, buffet and stage. Plotline works out the exact number for your layout.',
      head: ['Marquee size', 'Floor area', 'Seated dinner', 'Theatre rows', 'Cocktail'],
      rows: [
        ['6 × 9 m', 54],
        ['9 × 12 m', 108],
        ['10 × 15 m', 150],
        ['12 × 18 m', 216],
        ['15 × 25 m', 375],
        ['20 × 30 m', 600],
      ].map(([s, a]) => [s, `${a} m²`, `${Math.floor(a / 1.2)}`, `${Math.floor(a / 0.7)}`, `${Math.floor(a / 0.5)}`]),
      note: 'Guide only. Your marquee supplier, site and local regulations decide the final capacity.',
    },
    split: ['3d.jpg', 'A wedding layout seen in 3D', 'Walk through it in 3D', 'See the canopy solid, ghosted or hidden, in Day, Golden hour or Night light with festoons and uplights on. Then stand at any seat and see that guest’s view.'],
    steps: [
      ['Add the marquee', 'Pick a type and size from the library.'],
      ['Fill it', 'Choose rounds, trestles, theatre or cocktail, and how much space between tables.'],
      ['Check it', 'Fix anything flagged: walkways, exits, poles and sightlines.'],
      ['Send it', 'Export a PDF for the client and crew, with the load list.'],
    ],
    faq: [
      { q: 'How many guests fit in a 10 × 20 m marquee?', a: 'About 166 for a seated dinner (1.2 m² each), 285 in theatre rows, or 400 standing for cocktails, before the dance floor, bar and stage. Lay it out in Plotline for the exact number with your tables.' },
      { q: 'Can I plan a tipi or stretch tent?', a: 'Yes. Tipis, joined tipis, stretch tents, sailcloth, pole, frame and clearspan marquees are all included, each with its own pole layout.' },
      { q: 'I run a marquee hire business. Can I use my own stock?', a: 'Yes. Add your marquees and furniture with sizes, prices and quantities owned. Plans built with them show the hire cost and any shortfall, and you can send clients a clean PDF.' },
      FREE_FAQ,
    ],
  },
  {
    slug: 'event-run-sheet',
    title: 'Event Run Sheet Template and Maker — Free | Plotline',
    description: 'Make an event run sheet from a ready-made template for weddings, corporate events, festivals and parties. Supplier arrivals and crew calls slot in automatically. Print it as a PDF.',
    eyebrow: 'Run sheets',
    h1: 'Event run sheet maker',
    lede: 'Start from a run sheet written for your kind of event, adjust the times, and supplier arrivals and crew calls slot in on their own. Print it or share a live link on the day.',
    hero: ['run-sheet.jpg', 'A wedding run sheet in Plotline with set-up, event and pack-down sections, supplier arrivals and crew'],
    features: [
      ['Templates that fit', 'Run sheets for weddings, corporate events, festivals and parties, split into set-up, event and pack-down.'],
      ['Suppliers built in', 'Each supplier’s arrival and departure appears at the right time, linked to their contact details.'],
      ['Crew calls', 'Rostered shifts show who’s on, where and when, next to the moments they’re needed for.'],
      ['Always in step', 'Change a time and the overview and PDF pack follow. Add a supplier and their arrival appears.'],
      ['Print or share', 'A clean PDF for the venue and suppliers, or a live link (Pro) that’s always up to date.'],
      ['Part of the whole plan', 'The same event holds the floor plan, guests, budget, docs and crew, so nothing gets out of step.'],
    ],
    sample: {
      h2: 'Wedding run sheet template',
      intro: 'A typical afternoon wedding, as Plotline drafts it. Change any time and the rest of the plan follows.',
      head: ['Time', 'What happens', 'Who'],
      rows: [
        ['9:00 am', 'Venue access: furniture hire and marquee deliveries', 'Venue, hire company'],
        ['10:30 am', 'Tables, linen and chairs set per floor plan', 'Hire company, crew'],
        ['12:00 pm', 'Florist and styling', 'Florist, stylist'],
        ['1:30 pm', 'AV and music sound check', 'DJ or band'],
        ['2:30 pm', 'Guests arrive, welcome drinks', 'Bar staff'],
        ['3:00 pm', 'Ceremony', 'Celebrant'],
        ['3:45 pm', 'Photos and canapés', 'Photographer, caterer'],
        ['5:30 pm', 'Guests seated, entrance of the couple', 'MC'],
        ['6:00 pm', 'Entrée, speeches, main', 'Caterer, MC'],
        ['8:00 pm', 'Cake cutting and first dance', 'DJ or band'],
        ['11:00 pm', 'Last song and farewell', 'MC'],
        ['11:30 pm', 'Pack down and venue handover', 'Crew, hire company'],
      ],
    },
    steps: [
      ['Pick your event', 'Choose the type, date and start time.'],
      ['Adjust the times', 'Type new times and add your own items.'],
      ['Add suppliers and crew', 'They appear on the run sheet automatically.'],
      ['Print or share', 'Download the PDF or send a live link.'],
    ],
    faq: [
      { q: 'What should an event run sheet include?', a: 'Times for set-up, the event itself and pack-down; what happens at each time; who’s responsible; and where. Supplier arrivals, sound checks and venue handover are the items most often forgotten.' },
      { q: 'Can I start from a template?', a: 'Yes. Pick wedding, corporate, festival or party and you get a full draft to edit, with times based on your start time.' },
      { q: 'Can my crew see the run sheet on the day?', a: 'On Pro you can share a live link that always shows the latest version, and crew can fill in your forms from a link or QR code.' },
      FREE_FAQ,
    ],
  },
  {
    slug: 'goodevent-alternative',
    title: 'GoodEvent Floor Plans Alternative | Plotline',
    description: 'Comparing Plotline and GoodEvent Floor Plans: floor plans, 3D, marquees and seating, plus guests, run sheets, suppliers and budget, all included for one price.',
    eyebrow: 'Comparison',
    h1: 'A GoodEvent Floor Plans alternative',
    lede: 'GoodEvent makes a capable floor plan tool. Plotline puts the floor plan, seating, run sheet, suppliers, budget and crew in one linked plan, for one price, with no object limits on the free plan.',
    hero: ['floor-plan.jpg', 'A Plotline floor plan with capacity, spacing and sightline checks'],
    compare: {
      h2: 'Side by side',
      intro: 'Based on GoodEvent’s public site in October 2026. Check their site for current details.',
      head: ['', 'Plotline', 'GoodEvent Floor Plans'],
      rows: [
        ['Free plan', 'One event, every feature, no object limit', '3 projects, 50 objects'],
        ['Paid price', `${PRICE} for everything`, 'US$32/month for Floor Plans, US$63/month bundle'],
        ['Floor plans to scale, 2D and 3D', 'Yes, including walk mode and view from a seat', 'Yes, including walk mode'],
        ['Marquees and tents', 'Yes, with poles as obstacles and sightline checks', 'Yes, with a tent editor'],
        ['Fill an area with tables', 'Yes, with grid, alternating and diamond patterns', 'Yes'],
        ['Walkway, exit and capacity checks', 'Yes, live as you work', 'Density guide'],
        ['Guests, seating and table plans', 'Linked to the floor plan', 'Separate product'],
        ['Run sheet, suppliers, budget, crew', 'Included and linked', 'Separate products'],
        ['Library size', '176 items, plus your own kit', 'About 700 assets'],
        ['Comments and templates', 'Not yet', 'Yes'],
      ],
    },
    features: [
      ['One plan, everything linked', 'Seat a guest and the caterer’s list updates. Add a supplier and their arrival lands on the run sheet. Change the layout and the hire list follows.'],
      ['Checks as you go', 'Walkways, exits, capacity, marquee poles and sightlines are checked live, not after the fact.'],
      ['No signup to start', 'Open it and plan. Your event saves in your browser until you choose to sign in.'],
    ],
    steps: [
      ['Open Plotline', 'No signup needed.'],
      ['Answer four questions', 'Event type, guests, date and venue.'],
      ['Edit the draft', 'Floor plan, run sheet, budget and suppliers are ready to adjust.'],
      ['Export or share', 'PDF pack, table plan, 3D images or a live link.'],
    ],
    faq: [
      { q: 'Can I bring a plan across from GoodEvent?', a: 'Export your plan as a PDF or image from GoodEvent and import it into Plotline as the venue drawing, then lay the furniture out on top.' },
      { q: 'What does GoodEvent do that Plotline doesn’t?', a: 'Today GoodEvent has a larger asset library, a ceiling view, comments and saved templates. If you need something missing from Plotline, use Request item or Feedback in the app.' },
      FREE_FAQ,
    ],
  },
]

/* ---------- Rendering ---------- */

const head = (p, path, extraLd = []) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}" />
<link rel="canonical" href="${SITE}${path}" />
<link rel="icon" href="/favicon.svg" />
<link rel="stylesheet" href="/site/site.css" />
<meta name="theme-color" content="#4f46e5" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Plotline" />
<meta property="og:title" content="${esc(p.title.replace(/ \| Plotline$/, ''))}" />
<meta property="og:description" content="${esc(p.description)}" />
<meta property="og:url" content="${SITE}${path}" />
<meta property="og:image" content="${SITE}/img/og.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
${extraLd.map((ld) => `<script type="application/ld+json">${JSON.stringify(ld)}</script>`).join('\n')}
</head>
<body>
<header class="top"><div class="w">
  <a class="brand" href="/"><img src="/favicon.svg" alt="" />Plotline</a>
  <nav aria-label="Main">${NAV.map(([h, t]) => `<a href="${h}"${h === path ? ' aria-current="page"' : ''}>${t}</a>`).join('')}</nav>
  <a class="btn sm" href="/">Start planning free</a>
</div></header>
`

const footer = `<footer class="site"><div class="w cols">
  <div><b>Plotline</b>Plan the whole event in one place. Free to start, no signup.</div>
  <div><b>Plan</b>${NAV.slice(0, 4).map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}</div>
  <div><b>Compare</b><a href="/goodevent-alternative/">GoodEvent alternative</a></div>
  <div><b>Help</b><a href="/help/">How to use Plotline</a><a href="/privacy/">Privacy policy</a><a href="mailto:hello@plotlineapp.online">hello@plotlineapp.online</a></div>
</div></footer>
</body>
</html>
`

const tableHtml = (t) => `<section class="band"><div class="w">
  <h2>${t.h2}</h2>
  <p class="intro">${t.intro}</p>
  <div class="table"><table>
    <thead><tr>${t.head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${t.rows.map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${c}</th>` : `<td>${c}</td>`)).join('')}</tr>`).join('')}</tbody>
  </table></div>
  ${t.note ? `<p class="note">${t.note}</p>` : ''}
</div></section>`

const render = (p) => {
  const path = `/${p.slug}/`
  const ld = [
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: p.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: strip(f.a) } })) },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Plotline', item: `${SITE}/` }, { '@type': 'ListItem', position: 2, name: p.eyebrow, item: `${SITE}${path}` }] },
  ]
  return `${head(p, path, ld)}
<main>
<section class="hero"><div class="w">
  <span class="eyebrow">${p.eyebrow}</span>
  <h1>${p.h1}</h1>
  <p class="lede">${p.lede}</p>
  <div class="cta"><a class="btn" href="/">Start planning free</a><a class="btn ghost" href="/help/">See how it works</a></div>
  <p class="small">No signup · works on laptop, tablet and phone</p>
  <div class="shot"><img src="/img/${p.hero[0]}" alt="${esc(p.hero[1])}" width="1600" height="1000" fetchpriority="high" /></div>
</div></section>

${p.compare ? tableHtml(p.compare) : ''}

<section class="band soft"><div class="w">
  <h2>${p.compare ? 'Why planners switch' : 'What you can do'}</h2>
  <div class="grid">${p.features.map(([t, d]) => `<div class="card"><h3>${t}</h3><p>${d}</p></div>`).join('')}</div>
</div></section>

${p.table ? tableHtml(p.table) : ''}
${p.sample ? tableHtml(p.sample) : ''}

${p.split ? `<section class="band"><div class="w split">
  <div><h2>${p.split[2]}</h2><p>${p.split[3]}</p></div>
  <div class="shot"><img src="/img/${p.split[0]}" alt="${esc(p.split[1])}" width="1600" height="1000" loading="lazy" /></div>
</div></section>` : ''}

<section class="band soft"><div class="w">
  <h2>How it works</h2>
  <ol class="steps">${p.steps.map(([t, d]) => `<li><b>${t}</b>${d}</li>`).join('')}</ol>
</div></section>

<section class="band"><div class="w">
  <h2>Questions</h2>
  ${p.faq.map((f) => `<details><summary>${f.q}</summary><p>${f.a}</p></details>`).join('\n  ')}
</div></section>

<section class="final"><div class="w">
  <h2>Plan your event now</h2>
  <p>Answer four questions and get a floor plan, run sheet, budget and supplier list to edit.</p>
  <a class="btn" href="/">Start planning free</a>
</div></section>
</main>
${footer}`
}

for (const p of PAGES) {
  mkdirSync(`${OUT}${p.slug}`, { recursive: true })
  writeFileSync(`${OUT}${p.slug}/index.html`, render(p))
}

/* ---------- robots.txt and sitemap.xml ---------- */

const urls = ['/', ...PAGES.map((p) => `/${p.slug}/`), '/help/', '/privacy/']
writeFileSync(
  `${OUT}sitemap.xml`,
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${TODAY}</lastmod></url>`).join('\n')}
</urlset>
`,
)
writeFileSync(`${OUT}robots.txt`, `User-agent: *\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`)
console.log(`Built ${PAGES.length} pages, sitemap.xml (${urls.length} URLs) and robots.txt`)
