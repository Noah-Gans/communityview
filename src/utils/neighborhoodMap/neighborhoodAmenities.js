/**
 * Neighborhood map amenity categories (urban marketing layout).
 * Uses the same Places Nearby path as property tours (one request per key).
 */
export const NEIGHBORHOOD_AMENITY_CATEGORIES = [
  { key: 'dining', label: 'Dining', max: 5, min: 2 },
  { key: 'coffee', label: 'Coffee & Bakeries', max: 4, min: 1 },
  { key: 'grocery', label: 'Groceries & Essentials', max: 3, min: 1 },
  { key: 'fitness', label: 'Fitness & Wellness', max: 4, min: 1 },
  { key: 'parks_rec', label: 'Parks & Recreation', max: 5, min: 2 },
  { key: 'transit', label: 'Transit', max: 3, min: 1 },
  { key: 'essentials', label: 'Essentials', max: 3, min: 1 },
];

export const NEIGHBORHOOD_AMENITY_KEYS = NEIGHBORHOOD_AMENITY_CATEGORIES.map((c) => c.key);

/** ~0.005° ≈ 550m N–S / ~440m E–W in SF — urban mass-gen cells. */
const CELL_STEP_DEG = 0.005;

export function amenityGridCellKey(lat, lng, step = CELL_STEP_DEG) {
  const s = Number(step) || CELL_STEP_DEG;
  const round = (v) => {
    const n = Math.round(Number(v) / s) * s;
    return n.toFixed(3);
  };
  return `${round(lat)}_${round(lng)}`;
}

/**
 * Score: prefer close + high stars + many reviews.
 * Higher is better.
 */
export function neighborhoodAmenityScore(properties) {
  const miles = Number(properties?.straightLineMiles);
  const dist = Number.isFinite(miles) ? miles : 99;
  const rating = Number(properties?.rating);
  const stars = Number.isFinite(rating) ? rating : 0;
  const reviews = Number(properties?.user_ratings_total) || 0;
  const reviewBoost = Math.log10(reviews + 1) * 1.35;
  const distPenalty = dist * 1.8;
  return stars * 3.2 + reviewBoost - distPenalty;
}

function haversineFeet(aLat, aLng, bLat, bLng) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 20902231; // earth radius in feet
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function isSpatiallyClear(candidate, accepted, minFeet) {
  for (const other of accepted) {
    const ft = haversineFeet(candidate.lat, candidate.lng, other.lat, other.lng);
    if (ft < minFeet) return false;
  }
  return true;
}

function featureToRow(f, cat) {
  const p = f?.properties || {};
  const name = String(p.name || '').trim();
  const coords = f?.geometry?.coordinates;
  const lng = Number(coords?.[0]);
  const lat = Number(coords?.[1]);
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const placeId = String(p.placeId || p.place_id || `${cat.key}:${name}:${lat}`).trim();
  return {
    id: placeId,
    placeId,
    name,
    amenityKey: cat.key,
    category: cat.label,
    categoryLabel: cat.label,
    lat,
    lng,
    miles: Number.isFinite(Number(p.straightLineMiles))
      ? Math.round(Number(p.straightLineMiles) * 10) / 10
      : null,
    rating: Number.isFinite(Number(p.rating)) ? Number(p.rating) : null,
    reviews: Number(p.user_ratings_total) || 0,
    score: neighborhoodAmenityScore(p),
  };
}

function rankedForCategory(byAmenity, cat) {
  const features = Array.isArray(byAmenity?.[cat.key]?.features)
    ? byAmenity[cat.key].features
    : [];
  return features
    .map((f) => featureToRow(f, cat))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

function passesSoftQuality(row) {
  if (row.amenityKey === 'transit' || row.amenityKey === 'parks_rec') return true;
  if (row.rating != null && row.rating < 3.6 && row.reviews < 25) return false;
  return true;
}

function toNumbered(rows) {
  return rows.map((row, idx) => ({
    number: idx + 1,
    placeId: row.placeId,
    name: row.name,
    amenityKey: row.amenityKey,
    categoryLabel: row.categoryLabel || row.category,
    lat: row.lat,
    lng: row.lng,
    miles: row.miles,
    rating: row.rating,
    reviews: row.reviews,
    score: row.score,
  }));
}

/**
 * Number visible amenity-map features for the neighborhood PDF (same places the agent curated).
 */
export function numberedAmenitiesFromFeatures(features, options = {}) {
  const maxTotal = Number(options.maxTotal) || 40;
  const allowed = new Set(
    Array.isArray(options.keys) && options.keys.length
      ? options.keys
      : NEIGHBORHOOD_AMENITY_KEYS
  );
  const rows = [];
  const seenPlaceIds = new Set();
  for (const f of features || []) {
    if (rows.length >= maxTotal) break;
    const key = String(f?.properties?.amenityKey || '').trim();
    if (!allowed.has(key)) continue;
    const cat =
      NEIGHBORHOOD_AMENITY_CATEGORIES.find((c) => c.key === key) || {
        key,
        label: key.replace(/_/g, ' '),
      };
    const row = featureToRow(f, cat);
    if (!row || seenPlaceIds.has(row.placeId)) continue;
    seenPlaceIds.add(row.placeId);
    rows.push(row);
  }
  return toNumbered(rows);
}

/**
 * Heuristic pick: guarantee mins per category, then fill up to max.
 */
export function selectNeighborhoodAmenities(byAmenity, options = {}) {
  const categories = Array.isArray(options.categories)
    ? options.categories
    : NEIGHBORHOOD_AMENITY_CATEGORIES;
  const globalMax = Number(options.maxTotal) || 26;
  const minSeparationFeet = Number(options.minSeparationFeet) || 200;
  const picked = [];
  const seenPlaceIds = new Set();

  const tryAdd = (row, separation = minSeparationFeet) => {
    if (!row || seenPlaceIds.has(row.placeId)) return false;
    if (!passesSoftQuality(row)) return false;
    if (!isSpatiallyClear(row, picked, separation)) return false;
    seenPlaceIds.add(row.placeId);
    picked.push(row);
    return true;
  };

  // Pass 1: ensure at least `min` per category (relax separation if needed).
  for (const cat of categories) {
    if (picked.length >= globalMax) break;
    const ranked = rankedForCategory(byAmenity, cat);
    const need = Math.max(0, Number(cat.min) || 1);
    let taken = 0;
    for (const row of ranked) {
      if (taken >= need || picked.length >= globalMax) break;
      if (tryAdd(row, minSeparationFeet * 0.65)) taken += 1;
    }
    // Last resort for empty category: ignore spatial filter once.
    if (taken < need) {
      for (const row of ranked) {
        if (taken >= need || picked.length >= globalMax) break;
        if (seenPlaceIds.has(row.placeId) || !passesSoftQuality(row)) continue;
        seenPlaceIds.add(row.placeId);
        picked.push(row);
        taken += 1;
      }
    }
  }

  // Pass 2: fill remaining slots up to per-category max / global max.
  for (const cat of categories) {
    if (picked.length >= globalMax) break;
    const ranked = rankedForCategory(byAmenity, cat);
    const already = picked.filter((p) => p.amenityKey === cat.key).length;
    const max = Number(cat.max) || 4;
    let taken = already;
    for (const row of ranked) {
      if (taken >= max || picked.length >= globalMax) break;
      if (tryAdd(row, minSeparationFeet)) taken += 1;
    }
  }

  return toNumbered(picked);
}

/**
 * Wider pool for AI curation (before final map pins).
 */
export function buildNeighborhoodCandidatePool(byAmenity, options = {}) {
  const categories = Array.isArray(options.categories)
    ? options.categories
    : NEIGHBORHOOD_AMENITY_CATEGORIES;
  const perCategory = Number(options.perCategory) || 10;
  const globalMax = Number(options.maxTotal) || 56;
  const pool = [];
  const seenPlaceIds = new Set();

  for (const cat of categories) {
    if (pool.length >= globalMax) break;
    const ranked = rankedForCategory(byAmenity, cat);
    let taken = 0;
    for (const row of ranked) {
      if (taken >= perCategory || pool.length >= globalMax) break;
      if (seenPlaceIds.has(row.placeId)) continue;
      seenPlaceIds.add(row.placeId);
      pool.push(row);
      taken += 1;
    }
  }
  return pool;
}

/**
 * Apply AI-chosen placeIds; guarantee each category with candidates gets ≥1;
 * then fill toward maxTotal with mild spatial separation.
 */
export function applyCuratedNeighborhoodIds(candidates, placeIds, options = {}) {
  const minSeparationFeet = Number(options.minSeparationFeet) || 200;
  const maxTotal = Number(options.maxTotal) || 26;
  const categories = Array.isArray(options.categories)
    ? options.categories
    : NEIGHBORHOOD_AMENITY_CATEGORIES;

  const byId = new Map();
  (candidates || []).forEach((c) => {
    const id = String(c.id || c.placeId || '').trim();
    if (id) byId.set(id, c);
  });
  const byCategory = new Map();
  (candidates || []).forEach((c) => {
    const key = c.amenityKey;
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(c);
  });
  for (const list of byCategory.values()) {
    list.sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  const ordered = [];
  const seen = new Set();

  const tryAdd = (row, separation = minSeparationFeet, force = false) => {
    if (!row) return false;
    const id = String(row.placeId || row.id || '').trim();
    if (!id || seen.has(id)) return false;
    if (!force && !isSpatiallyClear(row, ordered, separation)) return false;
    seen.add(id);
    ordered.push(row);
    return true;
  };

  // AI order first.
  for (const rawId of placeIds || []) {
    if (ordered.length >= maxTotal) break;
    tryAdd(byId.get(String(rawId || '').trim()), minSeparationFeet);
  }

  // Guarantee coverage: at least `min` per category when candidates exist.
  for (const cat of categories) {
    if (ordered.length >= maxTotal) break;
    const have = ordered.filter((o) => o.amenityKey === cat.key).length;
    const need = Math.max(0, (Number(cat.min) || 1) - have);
    if (need <= 0) continue;
    const list = byCategory.get(cat.key) || [];
    let added = 0;
    for (const row of list) {
      if (added >= need || ordered.length >= maxTotal) break;
      if (tryAdd(row, minSeparationFeet * 0.7)) added += 1;
    }
    if (added < need) {
      for (const row of list) {
        if (added >= need || ordered.length >= maxTotal) break;
        if (tryAdd(row, 0, true)) added += 1;
      }
    }
  }

  // Fill remaining from AI leftovers + high scores.
  const rest = [
    ...(placeIds || []).map((id) => byId.get(String(id).trim())).filter(Boolean),
    ...[...(candidates || [])].sort((a, b) => (b.score || 0) - (a.score || 0)),
  ];
  for (const row of rest) {
    if (ordered.length >= maxTotal) break;
    tryAdd(row, minSeparationFeet);
  }

  return toNumbered(ordered);
}

export function groupAmenitiesByCategory(amenities) {
  const groups = [];
  const byKey = new Map();
  for (const cat of NEIGHBORHOOD_AMENITY_CATEGORIES) {
    const g = { key: cat.key, label: cat.label, items: [] };
    byKey.set(cat.key, g);
    groups.push(g);
  }
  for (const a of amenities || []) {
    const g = byKey.get(a.amenityKey);
    if (g) g.items.push(a);
  }
  return groups.filter((g) => g.items.length > 0);
}

/**
 * When the agent curated amenities on the amenity map / tour, use that visible set
 * as the neighborhood PDF pin list (same places across all three).
 */
export function selectedAmenitiesFromVisibleByAmenity(byAmenity, options = {}) {
  const maxTotal = Number(options.maxTotal) || 40;
  const rows = [];
  const seenPlaceIds = new Set();
  for (const cat of NEIGHBORHOOD_AMENITY_CATEGORIES) {
    if (rows.length >= maxTotal) break;
    for (const row of rankedForCategory(byAmenity, cat)) {
      if (rows.length >= maxTotal) break;
      if (seenPlaceIds.has(row.placeId)) continue;
      seenPlaceIds.add(row.placeId);
      rows.push(row);
    }
  }
  return toNumbered(rows);
}
