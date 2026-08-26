#!/usr/bin/env node
/**
 * After CRA build, write route-specific HTML shells so GitHub Pages
 * serve correct <title>/meta/canonical for marketing URLs without full prerender.
 *
 * Canonical URLs use trailing slashes to match GitHub Pages directory URLs.
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
  },
  {
    route: '/features',
    file: path.join('features', 'index.html'),
    title: 'Features — Parcel Search, Listing Maps & Property Tours | Community View',
    description:
      'Explore Community View features: nationwide parcel search, ownership details, map layers, listing maps, and shareable property tours for agents.',
    h1: 'Community View features for real estate agents',
    body:
      'Parcel search, ownership details, map layers, listing maps, property tours, and embeddable maps in one platform.',
  },
  {
    route: '/pricing',
    file: path.join('pricing', 'index.html'),
    title: 'Pricing — Plans for Real Estate Agents | Community View',
    description:
      'Simple pricing for agents. Start with a 14-day free trial. Regular and Plus plans for parcel search, listing maps, and property tours.',
    h1: 'Community View pricing for real estate agents',
    body: 'Simple plans with a 14-day free trial for parcel search, listing maps, and property tours.',
  },
  {
    route: '/faq',
    file: path.join('faq', 'index.html'),
    title: 'FAQ — Parcel Research, Maps & Tours | Community View',
    description:
      'Answers about Community View nationwide parcel research, listing maps, property tours, sharing with buyers, trials, and billing.',
    h1: 'Community View frequently asked questions',
    body: 'Answers about parcel research, listing maps, property tours, trials, and billing.',
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
      'Parcel search, find property owner, ownership details, parcel maps, listing maps, property tours, map layers, and embedded maps.',
  },
  {
    route: '/use-cases/parcel-search',
    file: path.join('use-cases', 'parcel-search', 'index.html'),
    title: 'Nationwide Parcel Search for Real Estate Agents | Community View',
    description:
      'Search parcels nationwide by owner, address, or APN. Filter by county and open results on an interactive map built for real estate agents.',
    h1: 'Nationwide parcel search for real estate agents',
    body:
      'Search by owner, address, or APN. Filter by county and map results in Community View.',
  },
  {
    route: '/use-cases/find-property-owner',
    file: path.join('use-cases', 'find-property-owner', 'index.html'),
    title: 'Find Property Owner by Address | Community View',
    description:
      'Find a property owner by address, name, or APN. Search nationwide, map the parcel, and open ownership details. Start with a free trial — no county-site hopping.',
    h1: 'Find a property owner — by address, name, or parcel ID',
    body:
      'Search by address, owner name, or APN. Map the parcel and open ownership details for agents.',
  },
  {
    route: '/use-cases/ownership-details',
    file: path.join('use-cases', 'ownership-details', 'index.html'),
    title: 'Property Ownership Details & Parcel Records | Community View',
    description:
      'See property ownership and parcel details on the map — owner, mailing address, APN, legal description, acreage, and assessed values for real estate research.',
    h1: 'Ownership and property details on every parcel',
    body:
      'Owner, mailing address, APN, acreage, and assessed values on every parcel when available.',
  },
  {
    route: '/use-cases/ownership-map',
    file: path.join('use-cases', 'ownership-map', 'index.html'),
    title: 'Ownership Map — See Who Owns Land on a Parcel Map | Community View',
    description:
      'An ownership map for real estate agents: nationwide parcel boundaries, owner names, and property details on one interactive map. Click a parcel to confirm who owns it.',
    h1: 'Ownership map for real estate agents',
    body:
      'See parcel boundaries and who owns them on one map. Click a lot for owner, mailing address, APN, and acreage when available.',
  },
  {
    route: '/use-cases/public-land-map',
    file: path.join('use-cases', 'public-land-map', 'index.html'),
    title: 'Public Land Map for Real Estate Agents | Community View',
    description:
      'A public land map for real estate listings: see public land, parcel boundaries, and ownership context on one interactive map so you can pitch access, recreation, and neighbors accurately.',
    h1: 'Public land map for real estate listings',
    body:
      'Toggle public land next to private parcels on the same map you use for listings, ownership, and buyer-ready maps.',
  },
  {
    route: '/use-cases/parcel-maps',
    file: path.join('use-cases', 'parcel-maps', 'index.html'),
    title: 'Parcel Map Software for Real Estate Agents | Community View',
    description:
      'Interactive parcel map software for real estate agents. View parcel boundaries nationwide, check ownership, and create shareable listing maps buyers actually open.',
    h1: 'Parcel map software built for real estate agents',
    body:
      'Nationwide parcel boundaries, ownership on click, and shareable listing maps in one workflow.',
  },
  {
    route: '/use-cases/listing-maps',
    file: path.join('use-cases', 'listing-maps', 'index.html'),
    title: 'Listing Map Software for Real Estate Agents | Community View',
    description:
      'Create shareable listing maps and parcel maps for real estate marketing. Draw boundaries, add pins and photos, measure acreage, and send buyers a link.',
    h1: 'Listing maps for real estate marketing',
    body: 'Draw boundaries, add pins and photos, measure acreage, and share a buyer-ready map link.',
  },
  {
    route: '/use-cases/property-tours',
    file: path.join('use-cases', 'property-tours', 'index.html'),
    title: 'Digital Property Tours & Property Views for Listings | Community View',
    description:
      'Create digital property tours and interactive property views for listings. Show the parcel, nearby amenities, and send buyers one shareable link.',
    h1: 'Digital property tours and property views for listings',
    body:
      'Shareable property tours that show the parcel, nearby amenities, and listing context in one link.',
  },
  {
    route: '/use-cases/map-layers',
    file: path.join('use-cases', 'map-layers', 'index.html'),
    title: 'Real Estate Map Layers — Soil, Wetlands, Wildfire & More | Community View',
    description:
      'Toggle real estate map layers for land context: ownership boundaries, soil, wetlands, wildfire hazard, public land, and more on one interactive map.',
    h1: 'Real estate map layers for land context',
    body: 'Ownership, soil, wetlands, wildfire, public land, and more on one interactive map.',
  },
  {
    route: '/use-cases/embedded-maps',
    file: path.join('use-cases', 'embedded-maps', 'index.html'),
    title: 'Embed Listing Maps on Your Website | Community View',
    description:
      'Embed interactive listing maps on your real estate website. Copy an iframe snippet and let buyers explore the property map on your site.',
    h1: 'Embed listing maps on your website',
    body: 'Copy an iframe snippet and let buyers explore your listing map on your site.',
  },
  {
    route: '/compare/land-id',
    file: path.join('compare', 'land-id', 'index.html'),
    title: 'Community View vs Land id — Parcel Maps & Property Tours for Agents',
    description:
      'Comparing Community View and Land id for real estate agents: parcel search, ownership details, listing maps, property tours, embeds, and pricing simplicity.',
    h1: 'Community View vs Land id',
    body:
      'An honest comparison of parcel search, ownership details, listing maps, property tours, embeds, and pricing.',
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

function buildCrawlableBlock(page) {
  const title = escapeHtml(page.h1 || page.title);
  const body = escapeHtml(page.body || page.description);
  const links = NAV_LINKS.map((l) => `<a href="${l.href}">${escapeHtml(l.label)}</a>`).join(' · ');
  return [
    '<div id="cv-seo-static">',
    `<h1>${title}</h1>`,
    `<p>${body}</p>`,
    `<nav aria-label="Site">${links}</nav>`,
    '</div>',
  ].join('');
}

function applySeo(html, page) {
  const url = absoluteUrl(page.route);
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  const crawlable = buildCrawlableBlock(page);

  let out = html;
  out = out.replace(/<title>[^<]*<\/title>/i, `<title>${title}</title>`);
  out = out.replace(
    /<meta name="description" content="[^"]*"\s*\/>/i,
    `<meta name="description" content="${description}" />`
  );
  out = out.replace(
    /<meta property="og:url" content="[^"]*"\s*\/>/i,
    `<meta property="og:url" content="${url}" />`
  );
  out = out.replace(
    /<meta property="og:title" content="[^"]*"\s*\/>/i,
    `<meta property="og:title" content="${title}" />`
  );
  out = out.replace(
    /<meta property="og:description" content="[^"]*"\s*\/>/i,
    `<meta property="og:description" content="${description}" />`
  );
  out = out.replace(
    /<meta property="og:image" content="[^"]*"\s*\/>/i,
    `<meta property="og:image" content="${OG_IMAGE}" />`
  );
  out = out.replace(
    /<meta name="twitter:url" content="[^"]*"\s*\/>/i,
    `<meta name="twitter:url" content="${url}" />`
  );
  out = out.replace(
    /<meta name="twitter:title" content="[^"]*"\s*\/>/i,
    `<meta name="twitter:title" content="${title}" />`
  );
  out = out.replace(
    /<meta name="twitter:description" content="[^"]*"\s*\/>/i,
    `<meta name="twitter:description" content="${description}" />`
  );
  out = out.replace(
    /<link rel="canonical" href="[^"]*"\s*\/>/i,
    `<link rel="canonical" href="${url}" />`
  );
  out = out.replace(
    /<!-- SEO:[\s\S]*?<div id="cv-seo-static">[\s\S]*?<\/div>/i,
    `<!-- SEO: crawlable summary for non-JS / first paint -->\n  ${crawlable}`
  );
  if (!out.includes('id="cv-seo-static"')) {
    out = out.replace(/<div id="root"><\/div>/i, `${crawlable}\n  <div id="root"></div>`);
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

main();
