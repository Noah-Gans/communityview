import * as turf from '@turf/turf';

/** Food retail — matches tour map styling (`kind: grocery`). */
function isGroceryTags(tags) {
  if (!tags || typeof tags !== 'object') return false;
  const a = String(tags.amenity || '').toLowerCase();
  if (a === 'supermarket' || a === 'greengrocer') return true;
  const s = String(tags.shop || '').toLowerCase();
  return ['supermarket', 'convenience', 'grocery', 'general'].includes(s);
}

function isPoiLikeTags(tags) {
  if (!tags || typeof tags !== 'object') return false;
  return Boolean(
    tags.place ||
      tags.amenity ||
      tags.shop ||
      tags.tourism ||
      tags.leisure ||
      tags.historic ||
      tags.attraction ||
      tags.craft ||
      tags.office ||
      tags.healthcare ||
      tags['natural'] === 'peak' ||
      tags['natural'] === 'spring' ||
      tags['natural'] === 'cave_entrance'
  );
}

/**
 * Build a polygon query string for Overpass (lat lon pairs).
 * @param {[[number, number], [number, number]]} bounds
 */
function polygonStringFromBounds(bounds, bufferKm = 1.15) {
  if (!bounds || !Array.isArray(bounds[0]) || !Array.isArray(bounds[1])) return '';
  const west = Number(bounds[0][0]);
  const south = Number(bounds[0][1]);
  const east = Number(bounds[1][0]);
  const north = Number(bounds[1][1]);
  if (![west, south, east, north].every(Number.isFinite)) return '';
  try {
    const poly = turf.bboxPolygon([west, south, east, north]);
    const buffered = turf.buffer(poly, bufferKm, { units: 'kilometers' });
    const ring = buffered?.geometry?.coordinates?.[0] || [];
    const coords = ring
      .filter((c) => Array.isArray(c) && c.length >= 2)
      .map(([lng, lat]) => `${Number(lat).toFixed(6)} ${Number(lng).toFixed(6)}`);
    return coords.join(' ');
  } catch (_) {
    return '';
  }
}

function wayToFeature(way) {
  const geom = Array.isArray(way?.geometry) ? way.geometry : [];
  if (!geom.length) return null;
  const tags = way.tags || {};
  if (!isPoiLikeTags(tags)) return null;
  const coords = geom
    .map((g) => [Number(g.lon), Number(g.lat)])
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
  if (coords.length < 2) return null;
  const first = coords[0];
  const last = coords[coords.length - 1];
  const isClosed = Math.abs(first[0] - last[0]) < 1e-8 && Math.abs(first[1] - last[1]) < 1e-8;

  if (isClosed && coords.length >= 4) {
    const kind =
      tags.place
        ? 'place'
        : tags.boundary || tags.admin_level
          ? 'boundary'
          : tags.natural === 'water' || tags.waterway
            ? 'water'
            : tags.building
              ? 'building'
              : tags.landuse
                ? 'landuse'
                : 'area';
    return turf.feature(
      {
        type: 'Polygon',
        coordinates: [coords],
      },
      {
        kind,
        name: tags.name || '',
      }
    );
  }

  const kind = tags.place
    ? 'place'
    : tags.boundary || tags.admin_level
      ? 'boundary'
      : tags.highway
        ? 'road'
        : tags.waterway
          ? 'waterway'
          : 'line';
  return turf.feature(
    {
      type: 'LineString',
      coordinates: coords,
    },
    {
      kind,
      name: tags.name || tags.highway || tags.waterway || '',
    }
  );
}

function nodeToFeature(node) {
  const lng = Number(node?.lon);
  const lat = Number(node?.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  const tags = node.tags || {};
  if (!Object.keys(tags).length) return null;
  if (!isPoiLikeTags(tags)) return null;
  const kind = isGroceryTags(tags)
    ? 'grocery'
    : tags.place
      ? 'place'
      : tags.amenity
        ? 'amenity'
        : tags.shop
          ? 'shop'
          : tags.tourism
            ? 'tourism'
            : tags.leisure
              ? 'leisure'
              : 'poi';
  return turf.point([lng, lat], {
    kind,
    name:
      tags.name ||
      tags.place ||
      tags.amenity ||
      tags.shop ||
      tags.tourism ||
      tags.leisure ||
      '',
  });
}

function relationToFeature(rel) {
  const tags = rel?.tags || {};
  if (!isPoiLikeTags(tags)) return null;
  const members = Array.isArray(rel?.members) ? rel.members : [];
  if (!members.length) return null;

  const outerRings = [];
  for (const m of members) {
    if (m?.type !== 'way') continue;
    if (m?.role && m.role !== 'outer') continue;
    const g = Array.isArray(m?.geometry) ? m.geometry : [];
    const ring = g
      .map((p) => [Number(p.lon), Number(p.lat)])
      .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
    if (ring.length < 3) continue;
    const first = ring[0];
    const last = ring[ring.length - 1];
    const closed =
      Math.abs(first[0] - last[0]) < 1e-8 && Math.abs(first[1] - last[1]) < 1e-8
        ? ring
        : [...ring, first];
    if (closed.length >= 4) outerRings.push(closed);
  }

  if (!outerRings.length) return null;

  const kind = tags.place
    ? 'place'
    : tags.boundary || tags.admin_level
      ? 'boundary'
      : tags.natural === 'water'
        ? 'water'
        : tags.landuse
          ? 'landuse'
          : 'area';

  if (outerRings.length === 1) {
    return turf.feature(
      { type: 'Polygon', coordinates: [outerRings[0]] },
      { kind, name: tags.name || tags.place || tags.boundary || '' }
    );
  }
  return turf.feature(
    { type: 'MultiPolygon', coordinates: outerRings.map((r) => [r]) },
    { kind, name: tags.name || tags.place || tags.boundary || '' }
  );
}

function parseOverpassFeatureCollection(data, maxFeatures = 450) {
  const elements = Array.isArray(data?.elements) ? data.elements : [];
  const features = [];
  for (const el of elements) {
    let f = null;
    if (el?.type === 'way') f = wayToFeature(el);
    else if (el?.type === 'node') f = nodeToFeature(el);
    else if (el?.type === 'relation') f = relationToFeature(el);
    if (f) features.push(f);
    if (features.length >= maxFeatures) break;
  }
  return { type: 'FeatureCollection', features };
}

export async function fetchOverpassQuery(query, options = {}) {
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
  let lastErr = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: `data=${encodeURIComponent(query)}`,
        signal: options.signal,
      });
      if (!response.ok) throw new Error(`Overpass error ${response.status} @ ${endpoint}`);
      return await response.json();
    } catch (err) {
      lastErr = err;
      if (options.signal?.aborted) throw err;
    }
  }
  throw lastErr || new Error('Overpass request failed');
}

/**
 * Fetch nearby context via Overpass and return a lightweight GeoJSON FeatureCollection.
 * @param {[[number, number], [number, number]]} bounds
 */
export async function fetchNearbyContextGeoJson(bounds, options = {}) {
  const maxFeatures = options.maxFeatures ?? 450;
  const poly = polygonStringFromBounds(bounds, options.bufferKm ?? 1.15);
  if (!poly) return { type: 'FeatureCollection', features: [] };

  // POI-focused query in buffered surrounding area.
  const targetedPolyQuery = `
[out:json][timeout:25];
(
  nwr["place"](poly:"${poly}");
  nwr["amenity"](poly:"${poly}");
  nwr["shop"](poly:"${poly}");
  nwr["tourism"](poly:"${poly}");
  nwr["leisure"](poly:"${poly}");
  nwr["historic"](poly:"${poly}");
  nwr["attraction"](poly:"${poly}");
  nwr["craft"](poly:"${poly}");
  nwr["office"](poly:"${poly}");
  nwr["healthcare"](poly:"${poly}");
  nwr["natural"~"^(peak|spring|cave_entrance)$"](poly:"${poly}");
);
out geom;
  `.trim();

  const targetedData = await fetchOverpassQuery(targetedPolyQuery, options);
  const targeted = parseOverpassFeatureCollection(targetedData, maxFeatures);
  if (targeted.features.length >= 60) return targeted;

  const west = Number(bounds?.[0]?.[0]);
  const south = Number(bounds?.[0]?.[1]);
  const east = Number(bounds?.[1]?.[0]);
  const north = Number(bounds?.[1]?.[1]);
  if (![west, south, east, north].every(Number.isFinite)) {
    return targeted;
  }
  const centerLat = (south + north) / 2;
  const centerLng = (west + east) / 2;
  const diagonalKm = turf.distance([west, south], [east, north], { units: 'kilometers' });
  const radiusM = Math.round(Math.min(6000, Math.max(1200, (diagonalKm + (options.bufferKm ?? 1.15)) * 900)));

  // Fallback in a radial neighborhood around the property center: POI-focused categories.
  const generalNearbyQuery = `
[out:json][timeout:25];
(
  nwr["place"](around:${radiusM},${centerLat},${centerLng});
  nwr["amenity"](around:${radiusM},${centerLat},${centerLng});
  nwr["shop"](around:${radiusM},${centerLat},${centerLng});
  nwr["tourism"](around:${radiusM},${centerLat},${centerLng});
  nwr["leisure"](around:${radiusM},${centerLat},${centerLng});
  nwr["historic"](around:${radiusM},${centerLat},${centerLng});
  nwr["attraction"](around:${radiusM},${centerLat},${centerLng});
  nwr["craft"](around:${radiusM},${centerLat},${centerLng});
  nwr["office"](around:${radiusM},${centerLat},${centerLng});
  nwr["healthcare"](around:${radiusM},${centerLat},${centerLng});
  nwr["natural"~"^(peak|spring|cave_entrance)$"](around:${radiusM},${centerLat},${centerLng});
);
out geom;
  `.trim();
  const broadData = await fetchOverpassQuery(generalNearbyQuery, options);
  const broad = parseOverpassFeatureCollection(broadData, maxFeatures);

  if (!targeted.features.length) return broad;
  const merged = [...targeted.features, ...broad.features];
  const seen = new Set();
  const deduped = [];
  for (const f of merged) {
    const key = `${f.geometry?.type}:${JSON.stringify(f.geometry?.coordinates)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(f);
    if (deduped.length >= maxFeatures) break;
  }

  return { type: 'FeatureCollection', features: deduped };
}
