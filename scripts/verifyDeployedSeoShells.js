#!/usr/bin/env node
/**
 * Fetches the RAW HTML (no JS execution) for every route from a live site
 * and checks it actually reflects generateMarketingSeoShells.js's output —
 * distinct per-route h1, FAQPage schema where expected, and no mangled
 * dollar amounts. This is the check that GSC's "rendered HTML" tab can't
 * answer: Google always executes JS correctly regardless of the shell bug,
 * so a rendered snapshot looks fine even when the raw crawl doesn't. Run
 * this after every deploy instead of eyeballing view-source by hand.
 *
 * Usage: node scripts/verifyDeployedSeoShells.js [baseUrl]
 *   baseUrl defaults to the production SITE constant.
 */
const https = require('https');
const http = require('http');
const { PAGES, SITE } = require('./generateMarketingSeoShells');

const baseUrl = process.argv[2] || SITE;

function routeUrl(route) {
  if (route === '/') return `${baseUrl}/`;
  const base = route.endsWith('/') ? route.slice(0, -1) : route;
  return `${baseUrl}${base}/`;
}

function fetch(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetch(res.headers.location).then(resolve, reject);
          return;
        }
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      })
      .on('error', reject);
  });
}

function extractH1(html) {
  const m = html.match(/<h1[^>]*>([^<]*)<\/h1>/i);
  return m ? m[1].trim() : null;
}

function extractDollarAmounts(text) {
  return (text.match(/\$\d+(?:\/mo)?/g) || []).sort();
}

async function main() {
  let failures = 0;
  const seenH1s = new Map();

  for (const page of PAGES) {
    const url = routeUrl(page.route);
    let result;
    try {
      result = await fetch(url);
    } catch (err) {
      console.log(`FAIL  ${page.route}  fetch error: ${err.message}`);
      failures++;
      continue;
    }

    const problems = [];
    const { status, body } = result;

    if (status !== 200) problems.push(`HTTP ${status}`);

    const h1 = extractH1(body);
    if (!h1) {
      problems.push('no <h1> found');
    } else if (h1 !== page.h1) {
      problems.push(`h1 mismatch: expected "${page.h1}", got "${h1}"`);
    } else if (seenH1s.has(h1) && page.route !== seenH1s.get(h1)) {
      problems.push(`h1 duplicated from route ${seenH1s.get(h1)} (stale/homepage-fallback shell?)`);
    }
    if (h1 && !seenH1s.has(h1)) seenH1s.set(h1, page.route);

    if (page.faqs && page.faqs.length) {
      if (!body.includes('"@type":"FAQPage"') && !body.includes('"@type": "FAQPage"')) {
        problems.push('expected FAQPage JSON-LD missing');
      }
    }

    const expectedDollars = extractDollarAmounts(
      [page.body, ...(page.bullets || []), ...((page.faqs || []).flatMap((f) => [f.question, f.answer]))].join(' ')
    );
    if (expectedDollars.length) {
      const gotDollars = new Set(extractDollarAmounts(body));
      const missing = expectedDollars.filter((d) => !gotDollars.has(d));
      if (missing.length) problems.push(`dollar amounts missing/mangled: ${missing.join(', ')}`);
    }

    if (problems.length) {
      console.log(`FAIL  ${page.route}\n        ${problems.join('\n        ')}`);
      failures++;
    } else {
      console.log(`OK    ${page.route}`);
    }
  }

  console.log(`\n${PAGES.length - failures}/${PAGES.length} routes passed`);
  if (failures) process.exit(1);
}

main();
