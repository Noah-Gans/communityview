#!/usr/bin/env node
/**
 * After CRA build, write route-specific HTML shells so GitHub Pages
 * serve correct <title>/meta/canonical for marketing URLs without full prerender.
 *
 * Canonical URLs use trailing slashes to match GitHub Pages directory URLs.
 *
 * IMPORTANT: CRA's production build strips HTML comments during minification,
 * so the crawlable-block replacement below matches on the <div id="cv-seo-static">
 * markup itself, NOT on a preceding "<!-- SEO: ... -->" comment. An earlier
 * version of this script matched on that comment, which meant the block never
 * actually got replaced against the minified build/index.html — every route
 * silently kept the homepage's h1/body text even though <title>/meta updated
 * correctly. Keep this comment-free matching if you touch this again.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BUILD = path.join(ROOT, 'build');
const SITE = 'https://communityview.ai';
const OG_IMAGE = `${SITE}/logo_only.png`;

const NAV_LINKS = [
  { href: `${SITE}/features/`, label: 'Features' },
  { href: `${SITE}/use-cases/`, label: 'Use cases' },
  { href: `${SITE}/use-cases/find-property-owner/`, label: 'Find property owner' },
  { href: `${SITE}/use-cases/ownership-map/`, label: 'Ownership map' },
  { href: `${SITE}/use-cases/public-land-map/`, label: 'Public land map' },
  { href: `${SITE}/use-cases/parcel-maps/`, label: 'Parcel maps' },
  { href: `${SITE}/pricing/`, label: 'Pricing' },
  { href: `${SITE}/faq/`, label: 'FAQ' },
];

// FAQ content mirrors src/pages/landingPages/content/faq.js (main FAQ page).
// Kept as a literal copy here (not require()'d) because this script runs as
// plain CommonJS Node against the CRA build, and the content files are ES
// modules bundled for the React app. If you edit the FAQ copy, update both.
const MAIN_FAQ_ITEMS = [
  {
    question: 'What is Community View?',
    answer:
      'Community View (communityview.ai) is parcel map software for real estate agents. Search parcels nationwide, find property owners, review ownership details, build listing maps, and send digital property tours buyers can open on any device.',
  },
  {
    question: 'Does Community View work nationwide?',
    answer:
      'Yes. Parcel search and mapping use nationwide Regrid data. Search across the country and filter results by county when you want to narrow results to a specific market.',
  },
  {
    question: 'Can I filter search results by county?',
    answer:
      'Yes. Search nationwide, then filter by one or multiple counties so you only see parcels in the areas you care about. Search by owner name, address, or parcel ID.',
  },
  {
    question: 'What property details can I see on a parcel?',
    answer:
      'Click any parcel for ownership and assessor-style records — owner and mailing address, APN, legal description, acreage, assessed values, building size, zoning, flood zone data, and more when available from the source county.',
  },
  {
    question: 'What map layers are available?',
    answer:
      'Toggle ownership boundaries, public land, conservation easements, soil, surface water, wetlands, opportunity zones, principal aquifers, transmission lines, wildfire hazard, and US boundary layers including counties, places, congressional districts, and tribal lands.',
  },
  {
    question: 'What are listing maps?',
    answer:
      'Listing maps are custom maps you build in Community View — property boundaries, labeled points for wells and outbuildings, photos pinned to features, and annotations. Export or share a link with buyers.',
  },
  {
    question: 'What are property tours?',
    answer:
      'Property tours are shareable, interactive presentations for a listing — your parcel on the map, nearby schools, dining, trails, and recreation, plus a link you can send to buyers from any device.',
  },
  {
    question: 'Can I send maps and tours to buyers?',
    answer:
      'Yes. Build a listing map or property tour and share a link. Buyers do not need an account to view a shared map or tour.',
  },
  {
    question: 'What is the difference between a listing map and a property tour?',
    answer:
      'Listing maps are annotated maps you design for a property — boundaries, icons, photos, and notes. Property tours are slide-based presentations that combine map context, orbit views, and nearby amenity highlights in one shareable experience.',
  },
  {
    question: 'Is there a mobile app?',
    answer:
      'Yes. Community View is available on iOS, and the web app works on mobile browsers for search, maps, and sharing tours and listing maps.',
  },
  {
    question: 'What payment methods do you accept?',
    answer: 'We accept all major credit and debit cards through secure Stripe payment processing.',
  },
  {
    question: 'Is there a free trial?',
    answer:
      'Paid plans include a 14-day free trial so you can search parcels, build maps, and create tours before you commit.',
  },
  {
    question: 'Can I cancel anytime?',
    answer: 'Yes. Cancel your subscription at any time. You keep access until the end of your billing period.',
  },
  {
    question: 'Can I switch between plans?',
    answer: 'Yes. Upgrade or downgrade at any time. Changes apply on your next billing cycle.',
  },
  {
    question: 'Do you offer brokerage or team pricing?',
    answer: 'Yes. Contact us for Enterprise pricing with multiple seats, onboarding, and dedicated support.',
  },
];

const PAGES = [
  {
    route: '/',
    file: 'index.html',
    title: 'Community View — Parcel Maps & Property Tours for Agents',
    description:
      'Community View (communityview.ai) is parcel map software for real estate agents: nationwide parcel search, listing maps, and digital property tours buyers actually open.',
    h1: 'Community View — parcel maps and property tours for real estate agents',
    body:
      'Nationwide parcel search, find property owners, ownership details, parcel maps, listing maps, and shareable digital property tours — built for agents.',
    bullets: [
      'Nationwide Parcel Search',
      'Ownership & Property Details',
      'Interactive Map & Layers',
      'Listing Maps',
      'Property Tours',
    ],
  },
  {
    route: '/features',
    file: path.join('features', 'index.html'),
    title: 'Features — Parcel Search, Listing Maps & Property Tours | Community View',
    description:
      'Explore Community View features: nationwide parcel search, ownership details, map layers, listing maps, and shareable property tours for agents.',
    h1: 'Community View features for real estate agents',
    body:
      'Nationwide parcel search, map layers, ownership details, listing maps, and property tours — built for real estate agents marketing land and residential listings.',
    bullets: [
      'Nationwide Parcel Search — search nationwide or narrow to your county by owner, address, or parcel ID',
      'Ownership & Property Details — click any parcel for owner, APN, legal description, acreage, and assessed values',
      'Interactive Map & Layers — stack environmental, boundary, and hazard layers on any parcel nationwide',
      'Listing Maps — draw boundaries, drop icons, attach photos, and share a polished map',
      'Property Tours — shareable tours with orbit views, nearby amenities, and your branding',
    ],
  },
  {
    route: '/pricing',
    file: path.join('pricing', 'index.html'),
    title: 'Pricing — Plans for Real Estate Agents | Community View',
    description:
      'Simple pricing for agents. Start with a 14-day free trial. Regular and Plus plans for parcel search, listing maps, and property tours.',
    h1: 'Community View pricing for real estate agents',
    body: 'Maps and property tours for agents — nationwide parcel data included. Start with a 14-day free trial.',
    bullets: [
      'Regular — $18/mo ($15/mo billed annually): parcel search, map layers, basic listing maps, limited tours',
      'Plus — $24/mo ($20/mo billed annually): unlimited listing maps and property tours, advanced search filters',
      'Enterprise — custom pricing for brokerages and teams with multiple agent accounts',
    ],
  },
  {
    route: '/faq',
    file: path.join('faq', 'index.html'),
    title: 'FAQ — Parcel Research, Maps & Tours | Community View',
    description:
      'Answers about Community View nationwide parcel research, listing maps, property tours, sharing with buyers, trials, and billing.',
    h1: 'Community View frequently asked questions',
    body:
      'Answers about nationwide parcel research, listing maps, property tours, and sharing with buyers.',
    faqs: MAIN_FAQ_ITEMS,
  },
  {
    route: '/map',
    file: path.join('map', 'index.html'),
    title: 'Interactive Parcel Map | Community View',
    description:
      'Open the Community View map to explore parcels, ownership, and land layers nationwide.',
    h1: 'Interactive parcel map',
    body: 'Explore parcels, ownership, and land layers nationwide on the Community View map.',
  },
  {
    route: '/use-cases',
    file: path.join('use-cases', 'index.html'),
    title: 'Use Cases — Parcel Search, Ownership & Parcel Maps | Community View',
    description:
      'How real estate agents use Community View for parcel search, finding property owners, ownership details, parcel maps, listing maps, property tours, and embeds.',
    h1: 'What agents use Community View for',
    body:
      'From finding who owns a parcel to sending a buyer-ready map — jobs agents actually do on one platform.',
    bullets: [
      'Parcel search',
      'Find property owner',
      'Ownership details',
      'Ownership map',
      'Public land map',
      'Parcel maps',
      'Listing maps',
      'Property tours',
      'Map layers',
      'Embedded maps',
    ],
  },
  {
    route: '/use-cases/parcel-search',
    file: path.join('use-cases', 'parcel-search', 'index.html'),
    title: 'Nationwide Parcel Search for Real Estate Agents | Community View',
    description:
      'Search parcels nationwide by owner, address, or APN. Filter by county and open results on an interactive map built for real estate agents.',
    h1: 'Nationwide parcel search for real estate agents',
    body:
      'Sometimes county search is slow or inaccurate. Community View gives agents fast parcel search by owner name, address, and county ID — on computer and phone, across counties.',
    bullets: [
      'Search by owner, address, or county ID',
      'Filter by county or search nationwide',
      'Works on computer and phone',
      'Map It to center, highlight, and open details',
    ],
    faqs: [
      {
        question: 'Can I search parcels by owner name?',
        answer:
          'Yes. Search nationwide or filter by county, then look up parcels by owner name, street address, or parcel / county ID. Map It opens the parcel with property details.',
      },
      {
        question: 'Does parcel search work outside my home county?',
        answer:
          'Yes. Search the entire country, or narrow results to the county your map is centered on. Change your home county anytime from search.',
      },
      {
        question: 'Is there a free trial for parcel search?',
        answer:
          'Yes. Paid plans include a 14-day free trial so you can run nationwide parcel search before you commit.',
      },
    ],
  },
  {
    route: '/use-cases/find-property-owner',
    file: path.join('use-cases', 'find-property-owner', 'index.html'),
    title: 'Find Property Owner by Address | Community View',
    description:
      'Find a property owner by address, name, or APN. Search nationwide, map the parcel, and open ownership details. Start with a free trial — no county-site hopping.',
    h1: 'Find a property owner — by address, name, or parcel ID',
    body:
      'Stop bouncing between county assessor sites. Search, map the parcel, and see who owns it — built for agents who need answers before they list or call.',
    bullets: [
      'Search by address, owner, or APN',
      'County filter or nationwide',
      'Owner & mailing address on click',
      'Continue into maps and tours',
    ],
    faqs: [
      {
        question: 'How do I find who owns a property?',
        answer:
          'In Community View, search by street address, owner name, or parcel ID. Open a result with Map It, then click the parcel for ownership and mailing details when available.',
      },
      {
        question: 'Can I look up property owners outside my county?',
        answer:
          'Yes. Search nationwide, or filter to one or more counties so you only see local matches.',
      },
      {
        question: 'Is this the same as county assessor lookup?',
        answer:
          'You get assessor-style ownership and parcel details on the map when the source data includes them — without hopping between separate county websites for every market you work.',
      },
      {
        question: 'Can I find a property owner by address for free?',
        answer:
          'County sites are often free and slow. Community View is a paid agent tool with a 14-day free trial: search by address, map the parcel, and open ownership details without hopping counties.',
      },
    ],
  },
  {
    route: '/use-cases/ownership-details',
    file: path.join('use-cases', 'ownership-details', 'index.html'),
    title: 'Property Ownership Details & Parcel Records | Community View',
    description:
      'See property ownership and parcel details on the map — owner, mailing address, APN, legal description, acreage, and assessed values for real estate research.',
    h1: 'Ownership and property details on every parcel',
    body:
      'Research the deal before you list or price it. Click a parcel and get the assessor-style records agents actually need — without leaving the map.',
    bullets: [
      'Owner & mailing address',
      'APN / parcel number',
      'Acreage & assessed values',
      'Zoning and flood when available',
    ],
    faqs: [
      {
        question: 'What ownership details can I see on a parcel?',
        answer:
          'When available from the source county: owner and mailing address, APN, legal description, acreage, assessed land and improvement values, building size, and related assessor-style fields.',
      },
      {
        question: 'Do I need a separate assessor login?',
        answer:
          'No. Community View surfaces parcel ownership and property details on the interactive map for agents researching listings and land.',
      },
      {
        question: 'How is this different from finding a property owner by search?',
        answer:
          'Finding an owner starts with search by name, address, or ID. Ownership details is the on-map panel once you have the parcel selected — the full record view agents use to confirm the deal.',
      },
    ],
  },
  {
    route: '/use-cases/ownership-map',
    file: path.join('use-cases', 'ownership-map', 'index.html'),
    title: 'Ownership Map — See Who Owns Land on a Parcel Map | Community View',
    description:
      'An ownership map for real estate agents: nationwide parcel boundaries, owner names, and property details on one interactive map. Click a parcel to confirm who owns it.',
    h1: 'Ownership map for real estate agents',
    body:
      'An ownership map shows parcels and who owns them in one view — not a spreadsheet of assessor rows. Toggle ownership on the map, then click a lot for the record.',
    bullets: [
      'Parcel boundaries on the map',
      'Owner names and click-through details',
      'Nationwide coverage',
      'Pairs with listing maps and tours',
    ],
    faqs: [
      {
        question: 'What is an ownership map?',
        answer:
          'An ownership map shows land parcels and property ownership on an interactive map. In Community View you toggle ownership boundaries, then click a parcel for owner and assessor-style details when available.',
      },
      {
        question: 'Can I see neighboring owners on the map?',
        answer:
          'Yes. Ownership and parcel layers let you inspect lots around a listing so you can see who owns adjacent land, not just the subject property.',
      },
      {
        question: 'Is this the same as finding a property owner by address?',
        answer:
          'Finding an owner by address starts in search. An ownership map is the map view: boundaries, nearby lots, and click-to-open records. Use both in one workflow.',
      },
    ],
  },
  {
    route: '/use-cases/public-land-map',
    file: path.join('use-cases', 'public-land-map', 'index.html'),
    title: 'Public Land Map for Real Estate Agents | Community View',
    description:
      'A public land map for real estate listings: see public land, parcel boundaries, and ownership context on one interactive map so you can pitch access, recreation, and neighbors accurately.',
    h1: 'Public land map for real estate listings',
    body:
      'Buyers ask what is public around the property. A public land map answers that on the same map as the parcel — not in a separate government GIS tab.',
    bullets: [
      'Public land on the listing map',
      'Parcel boundaries for context',
      'Stack with ownership and hazards',
      'Share or embed for buyers',
    ],
    faqs: [
      {
        question: 'What is a public land map?',
        answer:
          'A public land map shows land held by public agencies (federal, state, and related ownership) on a map. In Community View you toggle public land next to parcel boundaries so agents can explain access and recreation around a listing.',
      },
      {
        question: 'Can I see public land next to a private parcel?',
        answer:
          'Yes. That is the point for listing work — the subject parcel plus nearby public land on one interactive map.',
      },
      {
        question: 'Is this the same as an ownership map?',
        answer:
          'No. An ownership map highlights private parcel owners. A public land map highlights public ownership. Use both when a listing sits against forest, BLM, or other public ground.',
      },
    ],
  },
  {
    route: '/use-cases/parcel-maps',
    file: path.join('use-cases', 'parcel-maps', 'index.html'),
    title: 'Parcel Map Software for Real Estate Agents | Community View',
    description:
      'Interactive parcel map software for real estate agents. View parcel boundaries nationwide, check ownership, and create shareable listing maps buyers actually open.',
    h1: 'Parcel map software built for real estate agents',
    body:
      'County GIS is for lookup. Community View is parcel maps you can research on — and marketing maps you can send — in one workflow.',
    bullets: [
      'Nationwide parcel boundaries',
      'Ownership on click',
      'Listing maps buyers open',
      'Share link or website embed',
    ],
    faqs: [
      {
        question: 'What is parcel map software for real estate agents?',
        answer:
          'It is software that shows parcel boundaries and property context on a map, and helps agents create shareable listing maps — not just a one-off county GIS lookup.',
      },
      {
        question: 'Can I create a parcel map for a listing?',
        answer:
          'Yes. Research the parcel on the map, then build a listing map with boundaries, pins, photos, and notes. Share a link buyers can open without signing up.',
      },
      {
        question: 'Does Community View show parcels nationwide?',
        answer:
          'Yes. Explore parcels and ownership context nationwide, then filter search by county when you want a tighter market focus.',
      },
    ],
  },
  {
    route: '/use-cases/listing-maps',
    file: path.join('use-cases', 'listing-maps', 'index.html'),
    title: 'Listing Map Software for Real Estate Agents | Community View',
    description:
      'Create shareable listing maps and parcel maps for real estate marketing. Draw boundaries, add pins and photos, measure acreage, and send buyers a link.',
    h1: 'Listing maps for real estate marketing',
    body:
      'County sites are for lookup. Listing maps are for marketing — a parcel map your buyers will actually open.',
    bullets: [
      'Boundaries with acreage',
      'Pins, photos, annotations',
      'Shareable buyer link',
      'Export when you need it',
    ],
    faqs: [
      {
        question: 'What is a listing map?',
        answer:
          'A listing map is a custom map you build for a property — boundaries, labeled points, photos, and notes — that you share with buyers as a link or export.',
      },
      {
        question: 'Can buyers open the map without an account?',
        answer: 'Yes. Share a link and buyers view the listing map without creating a Community View account.',
      },
      {
        question: 'How is a listing map different from a parcel map lookup?',
        answer:
          'Parcel lookup shows boundaries and records for research. A listing map is the marketing deliverable you design and send — annotations, photos, and a polished share experience.',
      },
    ],
  },
  {
    route: '/use-cases/property-tours',
    file: path.join('use-cases', 'property-tours', 'index.html'),
    title: 'Digital Property Tours & Property Views for Listings | Community View',
    description:
      'Create digital property tours and interactive property views for listings. Show the parcel, nearby amenities, and send buyers one shareable link.',
    h1: 'Digital property tours and property views for listings',
    body:
      'Give buyers a clear property view of the land and lifestyle in one link — without a custom website for each listing.',
    bullets: ['Slide-based listing tours', 'Parcel + amenity context', 'Agent branding', 'Works on mobile'],
  },
  {
    route: '/use-cases/map-layers',
    file: path.join('use-cases', 'map-layers', 'index.html'),
    title: 'Real Estate Map Layers — Soil, Wetlands, Wildfire & More | Community View',
    description:
      'Toggle real estate map layers for land context: ownership boundaries, soil, wetlands, wildfire hazard, public land, and more on one interactive map.',
    h1: 'Real estate map layers for land context',
    body:
      'Ownership tells you who. Layers tell you what is on the ground — so you price and pitch with better context.',
    bullets: ['Ownership & boundaries', 'Soil, water, wetlands', 'Wildfire and public land', 'County and place overlays'],
  },
  {
    route: '/use-cases/embedded-maps',
    file: path.join('use-cases', 'embedded-maps', 'index.html'),
    title: 'Embed Listing Maps on Your Website | Community View',
    description:
      'Embed interactive listing maps on your real estate website. Copy an iframe snippet and let buyers explore the property map on your site.',
    h1: 'Embed listing maps on your website',
    body: 'You built the map. Put it where listings already live — your site, a landing page, or a campaign page.',
    bullets: ['iframe embed snippet', 'Map-first embed layout', 'Works with shared listing maps', 'Stays on your website'],
  },
  {
    route: '/compare/land-id',
    file: path.join('compare', 'land-id', 'index.html'),
    title: 'Community View vs Land id — Parcel Maps & Property Tours for Agents',
    description:
      'Comparing Community View and Land id for real estate agents: parcel search, ownership details, listing maps, property tours, embeds, and pricing simplicity.',
    h1: 'Community View vs Land id',
    body:
      'Both help agents work with parcels and maps. The better fit depends on whether you want a broad land platform or a focused agent workflow for search, listing maps, and buyer-ready tours.',
    bullets: [
      'Choose Community View if you want nationwide parcel search plus ownership details in a simple agent workflow',
      'Choose Community View if listing maps and cinematic property tours are central to how you market',
      'Choose Community View if you want share links and website embeds buyers can open without friction',
      'Choose Community View if you prefer straightforward agent pricing and a fast path from research to a sendable deliverable',
    ],
  },
];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function absoluteUrl(route) {
  if (route === '/') return `${SITE}/`;
  const base = route.endsWith('/') ? route.slice(0, -1) : route;
  return `${SITE}${base}/`;
}

function buildFaqJsonLd(faqs) {
  if (!faqs || !faqs.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

function buildCrawlableBlock(page) {
  const title = escapeHtml(page.h1 || page.title);
  const body = escapeHtml(page.body || page.description);
  const links = NAV_LINKS.map((l) => `<a href="${l.href}">${escapeHtml(l.label)}</a>`).join(' · ');
  const bulletsHtml =
    page.bullets && page.bullets.length
      ? `<ul>${page.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`
      : '';
  const faqsHtml =
    page.faqs && page.faqs.length
      ? page.faqs
          .map(
            (f) =>
              `<h2>${escapeHtml(f.question)}</h2><p>${escapeHtml(f.answer)}</p>`
          )
          .join('')
      : '';
  const jsonLd = buildFaqJsonLd(page.faqs);
  const jsonLdScript = jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`
    : '';
  return [
    '<div id="cv-seo-static">',
    `<h1>${title}</h1>`,
    `<p>${body}</p>`,
    bulletsHtml,
    faqsHtml,
    `<nav aria-label="Site">${links}</nav>`,
    '</div>',
    jsonLdScript,
  ].join('');
}

function applySeo(html, page) {
  const url = absoluteUrl(page.route);
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  const crawlable = buildCrawlableBlock(page);

  // NOTE: every replacement below uses a replacer FUNCTION (`() => value`),
  // never a bare string. String.prototype.replace() treats "$1", "$18", "$&"
  // etc. in a *string* replacement as special patterns (backreferences), so
  // any real content containing a literal dollar amount — e.g. pricing
  // copy like "$18/mo" — gets silently mangled ("$18/mo" -> "8/mo") if
  // passed as a plain string. A function's return value is inserted
  // verbatim with no special-character interpretation. Keep this pattern
  // for any future replace() calls added here.
  let out = html;
  out = out.replace(/<title>[^<]*<\/title>/i, () => `<title>${title}</title>`);
  out = out.replace(
    /<meta name="description" content="[^"]*"\s*\/>/i,
    () => `<meta name="description" content="${description}" />`
  );
  out = out.replace(
    /<meta property="og:url" content="[^"]*"\s*\/>/i,
    () => `<meta property="og:url" content="${url}" />`
  );
  out = out.replace(
    /<meta property="og:title" content="[^"]*"\s*\/>/i,
    () => `<meta property="og:title" content="${title}" />`
  );
  out = out.replace(
    /<meta property="og:description" content="[^"]*"\s*\/>/i,
    () => `<meta property="og:description" content="${description}" />`
  );
  out = out.replace(
    /<meta property="og:image" content="[^"]*"\s*\/>/i,
    () => `<meta property="og:image" content="${OG_IMAGE}" />`
  );
  out = out.replace(
    /<meta name="twitter:url" content="[^"]*"\s*\/>/i,
    () => `<meta name="twitter:url" content="${url}" />`
  );
  out = out.replace(
    /<meta name="twitter:title" content="[^"]*"\s*\/>/i,
    () => `<meta name="twitter:title" content="${title}" />`
  );
  out = out.replace(
    /<meta name="twitter:description" content="[^"]*"\s*\/>/i,
    () => `<meta name="twitter:description" content="${description}" />`
  );
  out = out.replace(
    /<link rel="canonical" href="[^"]*"\s*\/>/i,
    () => `<link rel="canonical" href="${url}" />`
  );

  // Match on the cv-seo-static div itself — NOT a preceding HTML comment.
  // CRA's production minifier strips HTML comments, so anchoring on a
  // comment (as an earlier version of this script did) silently fails to
  // match against build/index.html and every route keeps the homepage's
  // static content. This regex works against both the raw public/index.html
  // (dev) and the minified build/index.html (prod).
  const cvSeoStaticRe = /<div id="cv-seo-static">[\s\S]*?<\/div>(\s*<script type="application\/ld\+json">[\s\S]*?<\/script>)?/i;
  if (cvSeoStaticRe.test(out)) {
    out = out.replace(cvSeoStaticRe, () => crawlable);
  } else {
    out = out.replace(/<div id="root"><\/div>/i, () => `${crawlable}\n  <div id="root"></div>`);
  }
  return out;
}

function main() {
  const templatePath = path.join(BUILD, 'index.html');
  if (!fs.existsSync(templatePath)) {
    console.error('generateMarketingSeoShells: build/index.html missing — run build first');
    process.exit(1);
  }

  const template = fs.readFileSync(templatePath, 'utf8');

  for (const page of PAGES) {
    const html = applySeo(template, page);
    const outPath = path.join(BUILD, page.file);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, html);
    console.log(`generateMarketingSeoShells: wrote ${page.file}`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { PAGES, SITE };
