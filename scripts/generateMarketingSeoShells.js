#!/usr/bin/env node
/**
 * After CRA build, write route-specific HTML shells so Firebase/GitHub Pages
 * serve correct <title>/meta/canonical for marketing URLs without full prerender.
 *
 * Creates: build/features/index.html, build/pricing/index.html, etc.
 * Firebase Hosting serves these files before the SPA ** rewrite.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BUILD = path.join(ROOT, 'build');
const SITE = 'https://communityview.ai';
const OG_IMAGE = `${SITE}/logo_only.png`;

const PAGES = [
  {
    route: '/',
    file: 'index.html',
    title: 'CommunityView — Parcel Maps & Property Tours for Agents',
    description:
      'Nationwide parcel search, listing maps, and digital property tours for real estate agents. Build shareable maps and tours buyers actually open.',
  },
  {
    route: '/features',
    file: path.join('features', 'index.html'),
    title: 'Features — Parcel Search, Listing Maps & Property Tours | CommunityView',
    description:
      'Explore CommunityView features: nationwide parcel search, ownership details, map layers, listing maps, and shareable property tours for agents.',
  },
  {
    route: '/pricing',
    file: path.join('pricing', 'index.html'),
    title: 'Pricing — Plans for Real Estate Agents | CommunityView',
    description:
      'Simple pricing for agents. Start with a 14-day free trial. Regular and Plus plans for parcel search, listing maps, and property tours.',
  },
  {
    route: '/faq',
    file: path.join('faq', 'index.html'),
    title: 'FAQ — Parcel Research, Maps & Tours | CommunityView',
    description:
      'Answers about nationwide parcel research, listing maps, property tours, sharing with buyers, trials, and billing on CommunityView.',
  },
  {
    route: '/map',
    file: path.join('map', 'index.html'),
    title: 'Interactive Parcel Map | CommunityView',
    description:
      'Open the CommunityView map to explore parcels, ownership, and land layers nationwide.',
  },
  {
    route: '/use-cases',
    file: path.join('use-cases', 'index.html'),
    title: 'Use Cases — Parcel Search, Maps & Property Tours | CommunityView',
    description:
      'How real estate agents use CommunityView for parcel search, ownership details, map layers, listing maps, property tours, and embeddable maps.',
  },
  {
    route: '/use-cases/parcel-search',
    file: path.join('use-cases', 'parcel-search', 'index.html'),
    title: 'Nationwide Parcel Search for Real Estate Agents | CommunityView',
    description:
      'Search parcels nationwide by owner, address, or APN. Filter by county and open results on an interactive map built for real estate agents.',
  },
  {
    route: '/use-cases/ownership-details',
    file: path.join('use-cases', 'ownership-details', 'index.html'),
    title: 'Property Ownership Details & Parcel Records | CommunityView',
    description:
      'See property ownership and parcel details on the map — owner, mailing address, APN, legal description, acreage, and assessed values for real estate research.',
  },
  {
    route: '/use-cases/listing-maps',
    file: path.join('use-cases', 'listing-maps', 'index.html'),
    title: 'Listing Map Software for Real Estate Agents | CommunityView',
    description:
      'Create shareable listing maps for real estate marketing. Draw boundaries, add pins and photos, measure acreage, and send buyers a link.',
  },
  {
    route: '/use-cases/property-tours',
    file: path.join('use-cases', 'property-tours', 'index.html'),
    title: 'Digital Property Tours for Real Estate Listings | CommunityView',
    description:
      'Create digital property tours for listings. Show the parcel, nearby amenities, and send buyers one shareable link on any device.',
  },
  {
    route: '/use-cases/map-layers',
    file: path.join('use-cases', 'map-layers', 'index.html'),
    title: 'Real Estate Map Layers — Soil, Wetlands, Wildfire & More | CommunityView',
    description:
      'Toggle real estate map layers for land context: ownership boundaries, soil, wetlands, wildfire hazard, public land, and more on one interactive map.',
  },
  {
    route: '/use-cases/embedded-maps',
    file: path.join('use-cases', 'embedded-maps', 'index.html'),
    title: 'Embed Listing Maps on Your Website | CommunityView',
    description:
      'Embed interactive listing maps on your real estate website. Copy an iframe snippet and let buyers explore the property map on your site.',
  },
  {
    route: '/compare/land-id',
    file: path.join('compare', 'land-id', 'index.html'),
    title: 'CommunityView vs Land id — Parcel Maps & Property Tours for Agents',
    description:
      'Comparing CommunityView and Land id for real estate agents: parcel search, ownership details, listing maps, property tours, embeds, and pricing simplicity.',
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
  return route === '/' ? `${SITE}/` : `${SITE}${route}`;
}

function applySeo(html, page) {
  const url = absoluteUrl(page.route);
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);

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
    /<h1\b[^>]*>[^<]*<\/h1>/i,
    `<h1 style="position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden;">${title}</h1>`
  );
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
