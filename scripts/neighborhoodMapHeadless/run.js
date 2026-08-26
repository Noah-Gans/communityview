#!/usr/bin/env node
/**
 * Local marketing neighborhood-map generator (headless Mapbox GL).
 *
 * Uses Playwright + Mapbox GL so pins align with the basemap (same approach as the app).
 * Amenities/parcel come from the existing Cloud Function (data only — we discard its PNG).
 *
 * Usage:
 *   node scripts/neighborhoodMapHeadless/run.js "1457 Baker St, San Francisco, CA"
 *
 *   node scripts/neighborhoodMapHeadless/run.js addresses.txt
 *
 * Env:
 *   MARKETING_NEIGHBORHOOD_MAP_KEY   (required — X-Api-Key for amenity/parcel API)
 *   REACT_APP_MAPBOX_ACCESS_TOKEN    (required)
 *   OUT_DIR                         (default: ./neighborhood-map-out)
 *   BRAND_NAME / BRAND_EMAIL / BRAND_PHONE
 *   BRAND_PHOTO_URL / BRAND_LOGO_URL
 *   BRAND_PHOTO_PATH / BRAND_LOGO_PATH  (local files → data URLs)
 *   PUBLIC_APP_ORIGIN               (default: https://www.communityview.ai — tour + QR)
 *
 * Cache visibility (API + manifest-headless.json):
 *   cache.status = "hit" | "miss"   curated amenity set for the ~500m grid cell
 *   fromCuratedCache               same as cache.status === "hit"
 *   cache.places.hit/total         Places category cache when curated missed
 *   curateSource                   e.g. gemini, heuristic, gemini+grid
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const QRCode = require('qrcode');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const RENDER_HTML = path.join(__dirname, 'render.html');
const CV_LOGO = path.join(ROOT, 'public', 'logo.png');
const DEFAULT_API =
  'https://us-central1-tetoncountygis.cloudfunctions.net/generateListingMarketingAssets';
/** Match in-app ShareMapPanel: `${origin}/tour/${shareToken}?basemap=imagery-3d` */
const DEFAULT_PUBLIC_APP_ORIGIN = 'https://communityview.ai';

function publicAppOrigin() {
  const raw = String(process.env.PUBLIC_APP_ORIGIN || DEFAULT_PUBLIC_APP_ORIGIN).trim();
  return (raw || DEFAULT_PUBLIC_APP_ORIGIN).replace(/\/$/, '');
}

/**
 * Prefer shareToken → brand-host tour URL (same as live app).
 * Falls back to rewriting legacy tetoncountygis.web.app hosts on API tourUrl.
 */
function toPublicTourUrl(shareToken, tourUrlFromApi) {
  const token = String(shareToken || '').trim();
  if (token) {
    return `${publicAppOrigin()}/tour/${token}?basemap=imagery-3d`;
  }
  const raw = String(tourUrlFromApi || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    if (/tetoncountygis\.(web\.app|firebaseapp\.com)$/i.test(u.hostname)) {
      u.protocol = 'https:';
      u.hostname = new URL(publicAppOrigin()).hostname;
      return u.toString();
    }
  } catch (_) {
    /* keep raw */
  }
  return raw;
}

function loadEnvFiles() {
  for (const name of ['.env.local', '.env.development', '.env']) {
    const p = path.join(ROOT, name);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

function parseInputs(arg) {
  if (!arg) {
    console.error('Usage: node scripts/neighborhoodMapHeadless/run.js <address|addresses.txt>');
    process.exit(1);
  }
  const full = path.resolve(arg);
  if (fs.existsSync(full) && fs.statSync(full).isFile()) {
    return fs
      .readFileSync(full, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        if (line.startsWith('{')) {
          try {
            return JSON.parse(line);
          } catch (_) {
            return { address: line };
          }
        }
        return { address: line };
      });
  }
  return [{ address: arg }];
}

function safeName(s) {
  return (
    String(s || 'map')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'map'
  );
}

async function buildTourQrDataUrl(tourUrl) {
  const url = String(tourUrl || '').trim();
  if (!url) return '';
  return QRCode.toDataURL(url, {
    width: 512,
    margin: 1,
    color: { dark: '#0f172a', light: '#ffffff' },
  });
}

async function fetchListingAssets(address, brand, coords = {}, options = {}) {
  const apiKey = String(process.env.MARKETING_NEIGHBORHOOD_MAP_KEY || '').trim();
  const endpoint = String(process.env.LISTING_ASSETS_HTTP_URL || DEFAULT_API).trim();
  if (!apiKey) throw new Error('Set MARKETING_NEIGHBORHOOD_MAP_KEY');

  // "data" = amenities + parcel only (no server PNG, no new Firestore tour).
  // Use when regenerating letter PNGs for maps that already exist.
  const products = Array.isArray(options.products) && options.products.length
    ? options.products
    : options.dataOnly
      ? ['data']
      : ['tour'];

  const body = {
    address,
    title: brand.title || address,
    products,
    brand,
  };
  const lat = Number(coords.lat);
  const lng = Number(coords.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    body.lat = lat;
    body.lng = lng;
  }
  const radiusMeters = Number(coords.radiusMeters);
  if (Number.isFinite(radiusMeters) && radiusMeters > 0) {
    body.radiusMeters = radiusMeters;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `API HTTP ${res.status}`);
  return json;
}

function startRenderServer() {
  const html = fs.readFileSync(RENDER_HTML);
  const server = http.createServer((req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(html);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

function fileToDataUrl(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return '';
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === '.jpg' || ext === '.jpeg'
      ? 'image/jpeg'
      : ext === '.webp'
        ? 'image/webp'
        : ext === '.svg'
          ? 'image/svg+xml'
          : 'image/png';
  return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function resolveBrandImage(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(https?:|data:)/i.test(raw)) return raw;
  const full = path.resolve(raw);
  if (fs.existsSync(full)) return fileToDataUrl(full);
  return raw;
}

async function main() {
  loadEnvFiles();
  const mapboxToken = String(process.env.REACT_APP_MAPBOX_ACCESS_TOKEN || '').trim();
  if (!mapboxToken) throw new Error('Set REACT_APP_MAPBOX_ACCESS_TOKEN');

  const items = parseInputs(process.argv[2]);
  const outDir = path.resolve(process.env.OUT_DIR || path.join(ROOT, 'neighborhood-map-out'));
  fs.mkdirSync(outDir, { recursive: true });

  const brand = {
    name: process.env.BRAND_NAME || 'Listing agent',
    email: process.env.BRAND_EMAIL || '',
    phone: process.env.BRAND_PHONE || '',
    photoUrl: resolveBrandImage(process.env.BRAND_PHOTO_URL || process.env.BRAND_PHOTO_PATH),
    logoUrl: resolveBrandImage(process.env.BRAND_LOGO_URL || process.env.BRAND_LOGO_PATH),
  };

  let cvLogoDataUrl = '';
  if (fs.existsSync(CV_LOGO)) {
    const b64 = fs.readFileSync(CV_LOGO).toString('base64');
    cvLogoDataUrl = `data:image/png;base64,${b64}`;
  }

  const { server, url } = await startRenderServer();
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__READY__ === true);

  const manifest = [];
  let curatedHits = 0;
  let curatedMisses = 0;

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const address = item.address;
    process.stdout.write(`[${i + 1}/${items.length}] ${address} … `);
    try {
      const data = await fetchListingAssets(
        address,
        {
          ...brand,
          title: item.title || address,
          name: item.brandName || brand.name,
          email: item.brandEmail || brand.email,
          phone: item.brandPhone || brand.phone,
          photoUrl: item.brandPhotoUrl || brand.photoUrl,
          logoUrl: item.brandLogoUrl || brand.logoUrl,
        },
        { lat: item.lat, lng: item.lng, radiusMeters: item.radiusMeters },
        {
          dataOnly: Boolean(item.dataOnly || item.shareToken),
          products: item.products,
        }
      );

      if (Array.isArray(item.amenities) && item.amenities.length) {
        data.amenities = item.amenities;
        data.amenityCount = item.amenities.length;
      }
      data.amenities = (data.amenities || [])
        .filter((a) => String(a?.amenityKey || '') !== 'transit')
        .map((a, idx) => ({ ...a, number: idx + 1 }));
      data.amenityCount = data.amenities.length;
      if (!data.amenities.length) throw new Error('No amenities returned');

      // Prefer existing share token so QR points at the live digital map.
      const shareToken = String(item.shareToken || data.tour?.shareToken || '').trim();
      const tourUrl = toPublicTourUrl(shareToken, data.tour?.tourUrl);
      const tourQrDataUrl = tourUrl ? await buildTourQrDataUrl(tourUrl) : '';

      const job = {
        mapboxToken,
        title: data.title || address,
        placeLabel: data.address || address,
        address: data.address || address,
        lat: data.parcel.lat,
        lng: data.parcel.lng,
        parcel: {
          geometry: data.parcel.geometry || null,
          lat: data.parcel.lat,
          lng: data.parcel.lng,
        },
        amenities: data.amenities,
        brand: {
          name: item.brandName || brand.name,
          email: item.brandEmail || brand.email,
          phone: item.brandPhone || brand.phone,
          photoUrl: item.brandPhotoUrl || brand.photoUrl,
          logoUrl: item.brandLogoUrl || brand.logoUrl,
        },
        cvLogoDataUrl,
        tourUrl,
        tourQrDataUrl,
      };

      const result = await page.evaluate(async (j) => window.__renderNeighborhoodMap(j), job);
      if (!result?.ok) throw new Error(result?.error || 'Render failed');

      const base = `${String(i + 1).padStart(3, '0')}_${safeName(data.title || address)}`;
      const file = path.join(outDir, `${base}.png`);
      const b64 = result.pngDataUrl.replace(/^data:image\/png;base64,/, '');
      fs.writeFileSync(file, Buffer.from(b64, 'base64'));

      let qrFile = null;
      if (tourQrDataUrl) {
        qrFile = path.join(outDir, `${base}-tour-qr.png`);
        fs.writeFileSync(
          qrFile,
          Buffer.from(tourQrDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64')
        );
      }

      const cache = data.cache || {
        status: data.fromCuratedCache ? 'hit' : 'miss',
        curated: Boolean(data.fromCuratedCache),
        curateSource: data.curateSource || null,
        places: { hit: 0, total: 0, byCategory: data.cacheHits || {} },
        gridCell: data.gridCell || null,
      };
      if (cache.status === 'hit') curatedHits += 1;
      else curatedMisses += 1;

      const placesNote =
        cache.status === 'miss' && cache.places?.total
          ? `, places ${cache.places.hit}/${cache.places.total}`
          : '';
      const cacheNote = `cache=${String(cache.status || 'miss').toUpperCase()}${
        cache.status === 'hit' ? ' curated' : ` ${cache.curateSource || 'new'}${placesNote}`
      }`;

      const row = {
        index: i + 1,
        address: data.address,
        amenityCount: data.amenityCount,
        curateSource: data.curateSource,
        fromCuratedCache: Boolean(data.fromCuratedCache),
        cache,
        gridCell: data.gridCell || null,
        tourUrl: tourUrl || null,
        tourShareToken: data.tour?.shareToken || null,
        tourSlidePlan: data.tour?.slidePlan || null,
        file,
        qrFile,
      };
      manifest.push(row);
      fs.appendFileSync(
        path.join(outDir, 'results.jsonl'),
        `${JSON.stringify({
          ...row,
          file: path.basename(file),
          qrFile: qrFile ? path.basename(qrFile) : null,
        })}\n`
      );
      const tourNote = tourUrl ? `, tour ready` : '';
      console.log(`ok (${data.amenityCount} amenities, ${cacheNote}${tourNote}) → ${path.basename(file)}`);
      if (tourUrl) console.log(`    tour: ${tourUrl}`);
      if (qrFile) console.log(`    qr:   ${path.basename(qrFile)}`);
    } catch (err) {
      console.log(`FAIL ${err.message || err}`);
      manifest.push({ address, error: err.message || String(err) });
    }
  }

  await browser.close();
  server.close();
  const summary = {
    total: items.length,
    ok: manifest.filter((m) => !m.error).length,
    fail: manifest.filter((m) => m.error).length,
    curatedCacheHits: curatedHits,
    curatedCacheMisses: curatedMisses,
  };
  fs.writeFileSync(
    path.join(outDir, 'manifest-headless.json'),
    JSON.stringify({ summary, results: manifest }, null, 2)
  );
  console.log(
    `\nDone → ${path.join(outDir, 'manifest-headless.json')} | curated cache ${curatedHits} hit / ${curatedMisses} miss`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
