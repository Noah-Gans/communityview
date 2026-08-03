import {
  AMENITIES_WITH_LENIENT_FALLBACK,
  isAllowedNearbyFeatureProperties,
} from './tourNearbyAmenityFilters';

/** Preferred range for curated nearby results (fewer if quality is low). */
export const TOUR_NEARBY_TARGET_MIN = 5;
export const TOUR_NEARBY_MAX_RESULTS = 7;

/** Bump when fetch/filter logic changes so tour caches refetch. */
export const TOUR_NEARBY_DATA_VERSION = 29;

/** Edit tour: show as many Google results as we can (Places API nearby cap). */
export const TOUR_NEARBY_EDITOR_MAX_RESULTS = 20;

const METERS_PER_MILE = 1609.344;

const MAX_DISTANCE_METERS_BY_AMENITY = {
  fitness: 13000,
  grocery: 16000,
  schools: 13000,
  trailheads: 12000,
  coffee: 16000,
  parks_rec: 12000,
  essentials: 16000,
  transit: 16000,
  airport: 40000,
};

const DEFAULT_MAX_DISTANCE_METERS = 12000;

/** Transit: closest stop matters more than stars. */
const DISTANCE_FIRST_AMENITIES = new Set(['transit']);

/** Include unrated POIs after rated picks (parks / rural groceries often lack Google ratings). */
const ALLOW_UNRATED_AMENITIES = new Set(['parks_rec', 'trailheads', 'grocery']);

function distanceSortDivisor(amenityKey) {
  if (amenityKey === 'fitness') return 12;
  if (amenityKey === 'grocery' || amenityKey === 'coffee') return 22;
  return 40;
}

function maxDistanceMetersForAmenity(amenityKey) {
  return MAX_DISTANCE_METERS_BY_AMENITY[amenityKey] ?? DEFAULT_MAX_DISTANCE_METERS;
}

/**
 * Post-fetch distance cap — when the user chose a search radius, honor it instead of the legacy ~10 mi caps.
 * @param {string} amenityKey
 * @param {number} [searchRadiusMeters]
 */
export function resolveMaxDistanceMetersForCuration(amenityKey, searchRadiusMeters) {
  const fetchRadius = Number(searchRadiusMeters);
  if (Number.isFinite(fetchRadius) && fetchRadius > 0) {
    return fetchRadius;
  }
  return maxDistanceMetersForAmenity(amenityKey);
}

/**
 * @param {Record<string, unknown>|undefined|null} properties
 */
export function hasNearbyDisplayName(properties) {
  const name = String(properties?.name || '').trim();
  return name.length > 0 && !/^unnamed$/i.test(name);
}

function nearbyQualityScore(properties) {
  const rating = Number(properties?.rating);
  const reviews = Number(properties?.user_ratings_total) || 0;
  const r = Number.isFinite(rating) ? rating : 0;
  const reviewBoost = Math.min(Math.log10(reviews + 1) * 2.2, 5);
  return r + reviewBoost;
}

function hasGoogleRating(properties) {
  return Number.isFinite(Number(properties?.rating));
}

/**
 * Adaptive quality tiers — thin = high stars but too few reviews to trust.
 * @returns {'strong'|'solid'|'thin'|'weak'|'unrated'}
 */
function nearbyQualityTier(properties) {
  const rating = Number(properties?.rating);
  const reviews = Number(properties?.user_ratings_total) || 0;
  if (!Number.isFinite(rating)) return 'unrated';

  if (reviews >= 20 && rating >= 4.0) return 'strong';
  if (reviews >= 12 && rating >= 4.2) return 'strong';
  if (reviews >= 8 && rating >= 4.0) return 'solid';
  if (reviews >= 25 && rating >= 3.8) return 'solid';
  if (reviews >= 10 && rating >= 3.6) return 'solid';

  if (reviews < 8 && rating >= 4.2) return 'thin';
  if (reviews < 5) return 'weak';

  if (reviews >= 5 && rating >= 3.4) return 'weak';
  return 'weak';
}

function nearbyCompositeScore(properties, amenityKey) {
  const mi = Number(properties?.straightLineMiles);
  const miles = Number.isFinite(mi) ? mi : 999;
  const div = distanceSortDivisor(amenityKey);
  return nearbyQualityScore(properties) - miles / div;
}

function compareByDistanceThenRating(a, b) {
  const am = Number(a?.properties?.straightLineMiles);
  const bm = Number(b?.properties?.straightLineMiles);
  const distA = Number.isFinite(am) ? am : 999;
  const distB = Number.isFinite(bm) ? bm : 999;
  if (Math.abs(distA - distB) > 0.25) return distA - distB;

  const ar = Number(a?.properties?.rating);
  const br = Number(b?.properties?.rating);
  const ratA = Number.isFinite(ar) ? ar : 0;
  const ratB = Number.isFinite(br) ? br : 0;
  if (ratB !== ratA) return ratB - ratA;

  const revA = Number(a?.properties?.user_ratings_total) || 0;
  const revB = Number(b?.properties?.user_ratings_total) || 0;
  return revB - revA;
}

function compareByQualityScore(a, b, amenityKey) {
  const scoreA = nearbyCompositeScore(a?.properties, amenityKey);
  const scoreB = nearbyCompositeScore(b?.properties, amenityKey);
  if (scoreB !== scoreA) return scoreB - scoreA;

  const ar = Number(a?.properties?.rating);
  const br = Number(b?.properties?.rating);
  const ratA = Number.isFinite(ar) ? ar : 0;
  const ratB = Number.isFinite(br) ? br : 0;
  if (ratB !== ratA) return ratB - ratA;

  const revA = Number(a?.properties?.user_ratings_total) || 0;
  const revB = Number(b?.properties?.user_ratings_total) || 0;
  if (revB !== revA) return revB - revA;

  const am = Number(a?.properties?.straightLineMiles);
  const bm = Number(b?.properties?.straightLineMiles);
  return (Number.isFinite(am) ? am : 999) - (Number.isFinite(bm) ? bm : 999);
}

/**
 * Pick rated results: prefer strong/solid; only fall back to thin/weak when needed.
 * @param {unknown[]} features
 * @param {string} amenityKey
 */
function selectByAdaptiveQuality(features, amenityKey) {
  const maxCap = TOUR_NEARBY_MAX_RESULTS;
  const sortFn = (a, b) => compareByQualityScore(a, b, amenityKey);

  const buckets = { strong: [], solid: [], thin: [], weak: [], unrated: [] };
  for (const f of features) {
    const tier = nearbyQualityTier(f?.properties);
    buckets[tier].push(f);
  }

  buckets.strong.sort(sortFn);
  buckets.solid.sort(sortFn);
  buckets.thin.sort(sortFn);
  buckets.weak.sort(sortFn);
  buckets.unrated.sort((a, b) => {
    const am = Number(a?.properties?.straightLineMiles);
    const bm = Number(b?.properties?.straightLineMiles);
    return (Number.isFinite(am) ? am : 999) - (Number.isFinite(bm) ? bm : 999);
  });

  let selected = [];
  const goodCount = buckets.strong.length + buckets.solid.length;

  if (goodCount > 0) {
    selected = [...buckets.strong, ...buckets.solid];
  } else if (buckets.thin.length > 0) {
    selected = [...buckets.thin, ...buckets.weak];
  } else {
    selected = [...buckets.weak];
  }

  return selected.slice(0, maxCap);
}

function assignStablePlaceIds(features, amenityKey) {
  return features.map((f, i) => {
    const pk = { ...(f.properties || {}) };
    let pid = String(pk.placeId || pk.place_id || '').trim();
    if (!pid && f.geometry?.type === 'Point') {
      const c = f.geometry.coordinates || [];
      pid = `cv:${amenityKey}:${i}:${Number(c[0]).toFixed(5)}|${Number(c[1]).toFixed(5)}`;
    }
    if (pid) {
      pk.placeId = pid;
      if (!pk.place_id) pk.place_id = pid;
    }
    return { ...f, properties: pk };
  });
}

/**
 * Category filter + distance cap + adaptive quality selection (not a fixed count).
 * @param {unknown[]} features
 * @param {{ amenityKey?: string, maxResults?: number, searchRadiusMeters?: number }} [options]
 */
export function curateNearbyTourFeatures(features, options = {}) {
  const amenityKey = options.amenityKey != null ? String(options.amenityKey) : '';
  const maxCap = Math.min(
    TOUR_NEARBY_MAX_RESULTS,
    options.maxResults ?? TOUR_NEARBY_MAX_RESULTS
  );
  const maxMiles =
    resolveMaxDistanceMetersForCuration(amenityKey, options.searchRadiusMeters) / METERS_PER_MILE;
  const distanceFirst = DISTANCE_FIRST_AMENITIES.has(amenityKey);

  const passesRowFilters = (f, lenient) => {
    if (!f || f.geometry?.type !== 'Point') return false;
    const p = f.properties || {};
    if (amenityKey && p.amenityKey && String(p.amenityKey) !== amenityKey) return false;
    if (!hasNearbyDisplayName(p)) return false;
    if (amenityKey && !isAllowedNearbyFeatureProperties(p, amenityKey, { lenient })) return false;
    const mi = Number(p.straightLineMiles);
    if (!Number.isFinite(mi) || mi > maxMiles) return false;
    if (p.business_status === 'CLOSED_PERMANENTLY') return false;
    return true;
  };

  let filtered = (features || []).filter((f) => passesRowFilters(f, false));
  if (
    !filtered.length &&
    AMENITIES_WITH_LENIENT_FALLBACK.has(amenityKey) &&
    (features || []).length
  ) {
    filtered = (features || []).filter((f) => passesRowFilters(f, true));
  }

  if (distanceFirst) {
    const rated = filtered.filter((f) => hasGoogleRating(f?.properties));
    const unrated = filtered.filter((f) => !hasGoogleRating(f?.properties));
    rated.sort(compareByDistanceThenRating);
    unrated.sort(compareByDistanceThenRating);

    const goodRated = [];
    const thinRated = [];
    for (const f of rated) {
      const tier = nearbyQualityTier(f?.properties);
      if (tier === 'strong' || tier === 'solid') goodRated.push(f);
      else thinRated.push(f);
    }

    let selected = goodRated.length > 0 ? goodRated : thinRated;
    if (ALLOW_UNRATED_AMENITIES.has(amenityKey)) {
      selected = [...selected, ...unrated];
    } else if (selected.length === 0) {
      selected = unrated;
    }
    return assignStablePlaceIds(selected.slice(0, maxCap), amenityKey);
  }

  const rated = filtered.filter((f) => hasGoogleRating(f?.properties));
  const unrated = filtered.filter((f) => !hasGoogleRating(f?.properties));
  const selectedRated = selectByAdaptiveQuality(rated, amenityKey);

  unrated.sort((a, b) => {
    const am = Number(a?.properties?.straightLineMiles);
    const bm = Number(b?.properties?.straightLineMiles);
    return (Number.isFinite(am) ? am : 999) - (Number.isFinite(bm) ? bm : 999);
  });

  let selected = selectedRated;
  if (ALLOW_UNRATED_AMENITIES.has(amenityKey) && selected.length < maxCap) {
    const room = maxCap - selected.length;
    selected = [...selected, ...unrated.slice(0, room)];
  } else if (selected.length === 0 && unrated.length > 0) {
    // Schools and similar civic POIs often have no Google star rating — show closest matches.
    selected = unrated;
  }

  return assignStablePlaceIds(selected.slice(0, maxCap), amenityKey);
}

/**
 * Edit tour: keep up to 20 matches, best-rated and closest first (lenient filters).
 * @param {unknown[]} features
 * @param {{ amenityKey?: string, searchRadiusMeters?: number }} [options]
 */
export function sortNearbyTourFeaturesForEditor(features, options = {}) {
  const amenityKey = options.amenityKey != null ? String(options.amenityKey) : '';
  const maxCap = TOUR_NEARBY_EDITOR_MAX_RESULTS;
  const maxMiles =
    resolveMaxDistanceMetersForCuration(amenityKey, options.searchRadiusMeters) / METERS_PER_MILE;

  const passesRowFilters = (f, lenient) => {
    if (!f || f.geometry?.type !== 'Point') return false;
    const p = f.properties || {};
    if (amenityKey && p.amenityKey && String(p.amenityKey) !== amenityKey) return false;
    if (!hasNearbyDisplayName(p)) return false;
    if (amenityKey && !isAllowedNearbyFeatureProperties(p, amenityKey, { lenient })) return false;
    const mi = Number(p.straightLineMiles);
    if (!Number.isFinite(mi) || mi > maxMiles) return false;
    if (p.business_status === 'CLOSED_PERMANENTLY') return false;
    return true;
  };

  let filtered = (features || []).filter((f) => passesRowFilters(f, true));
  if (!filtered.length) {
    filtered = (features || []).filter((f) => passesRowFilters(f, false));
  }

  const rated = filtered.filter((f) => hasGoogleRating(f?.properties));
  const unrated = filtered.filter((f) => !hasGoogleRating(f?.properties));
  const groceryTypeBoost = (f) => {
    if (amenityKey !== 'grocery') return 0;
    const types = f?.properties?.googleTypes;
    if (!Array.isArray(types)) return 0;
    if (types.includes('supermarket') || types.includes('grocery_store')) return 2;
    if (types.includes('food_store')) return 1;
    return 0;
  };
  rated.sort((a, b) => {
    const boost = groceryTypeBoost(b) - groceryTypeBoost(a);
    if (boost !== 0) return boost;
    return compareByQualityScore(a, b, amenityKey);
  });
  unrated.sort((a, b) => {
    const boost = groceryTypeBoost(b) - groceryTypeBoost(a);
    if (boost !== 0) return boost;
    return compareByDistanceThenRating(a, b);
  });

  const merged = [...rated, ...unrated].slice(0, maxCap);
  return assignStablePlaceIds(merged, amenityKey);
}
