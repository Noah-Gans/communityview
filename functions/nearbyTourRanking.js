const {
  AMENITIES_WITH_LENIENT_FALLBACK,
  isAllowedNearbyFeatureProperties,
} = require("./nearbyAmenityFilters");

const TOUR_NEARBY_MAX_RESULTS = 7;
const TOUR_NEARBY_EDITOR_MAX_RESULTS = 20;

const METERS_PER_MILE = 1609.344;

const MAX_DISTANCE_METERS_BY_AMENITY = {
  fitness: 13000,
  grocery: 16000,
  schools: 13000,
  trailheads: 12000,
  coffee: 16000,
  parks_rec: 12000,
  essentials: 16000,
  airport: 40000,
};

const DEFAULT_MAX_DISTANCE_METERS = 12000;

const ALLOW_UNRATED_AMENITIES = new Set(["parks_rec", "trailheads", "grocery"]);

/**
 * Keep in sync with PROMINENCE_ANCHOR_AMENITIES in src/utils/tourNearbyRanking.js.
 * Chain anchors sit at 3.6-3.9 stars and would otherwise tier below any 4.0-star
 * corner shop and fall out of the result cap.
 */
const PROMINENCE_ANCHOR_AMENITIES = new Set(["grocery", "essentials", "fitness"]);

function distanceSortDivisor(amenityKey) {
  if (amenityKey === "fitness") return 12;
  if (amenityKey === "grocery" || amenityKey === "coffee") return 22;
  return 40;
}

function maxDistanceMetersForAmenity(amenityKey) {
  return MAX_DISTANCE_METERS_BY_AMENITY[amenityKey] ?? DEFAULT_MAX_DISTANCE_METERS;
}

function resolveMaxDistanceMetersForCuration(amenityKey, searchRadiusMeters) {
  const fetchRadius = Number(searchRadiusMeters);
  if (Number.isFinite(fetchRadius) && fetchRadius > 0) {
    return fetchRadius;
  }
  return maxDistanceMetersForAmenity(amenityKey);
}

function hasNearbyDisplayName(properties) {
  const name = String(properties?.name || "").trim();
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

function nearbyQualityTier(properties, amenityKey) {
  const rating = Number(properties?.rating);
  const reviews = Number(properties?.user_ratings_total) || 0;
  if (!Number.isFinite(rating)) return "unrated";

  if (PROMINENCE_ANCHOR_AMENITIES.has(amenityKey)) {
    if (reviews >= 150 && rating >= 3.5) return "strong";
    if (reviews >= 500 && rating >= 3.2) return "strong";
  }

  if (reviews >= 20 && rating >= 4.0) return "strong";
  if (reviews >= 12 && rating >= 4.2) return "strong";
  if (reviews >= 8 && rating >= 4.0) return "solid";
  if (reviews >= 25 && rating >= 3.8) return "solid";
  if (reviews >= 10 && rating >= 3.6) return "solid";

  if (reviews < 8 && rating >= 4.2) return "thin";
  if (reviews < 5) return "weak";

  if (reviews >= 5 && rating >= 3.4) return "weak";
  return "weak";
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

function selectByAdaptiveQuality(features, amenityKey) {
  const maxCap = TOUR_NEARBY_MAX_RESULTS;
  const sortFn = (a, b) => compareByQualityScore(a, b, amenityKey);

  const buckets = { strong: [], solid: [], thin: [], weak: [], unrated: [] };
  for (const f of features) {
    const tier = nearbyQualityTier(f?.properties, amenityKey);
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
    let pid = String(pk.placeId || pk.place_id || "").trim();
    if (!pid && f.geometry?.type === "Point") {
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

function curateNearbyTourFeatures(features, options = {}) {
  const amenityKey = options.amenityKey != null ? String(options.amenityKey) : "";
  const maxCap = Math.min(
    TOUR_NEARBY_MAX_RESULTS,
    options.maxResults ?? TOUR_NEARBY_MAX_RESULTS
  );
  const maxMiles =
    resolveMaxDistanceMetersForCuration(amenityKey, options.searchRadiusMeters) / METERS_PER_MILE;

  const passesRowFilters = (f, lenient) => {
    if (!f || f.geometry?.type !== "Point") return false;
    const p = f.properties || {};
    if (amenityKey && p.amenityKey && String(p.amenityKey) !== amenityKey) return false;
    if (!hasNearbyDisplayName(p)) return false;
    if (amenityKey && !isAllowedNearbyFeatureProperties(p, amenityKey, { lenient })) return false;
    const mi = Number(p.straightLineMiles);
    if (!Number.isFinite(mi) || mi > maxMiles) return false;
    if (p.business_status === "CLOSED_PERMANENTLY") return false;
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
    selected = unrated;
  }

  return assignStablePlaceIds(selected.slice(0, maxCap), amenityKey);
}

function sortNearbyTourFeaturesForEditor(features, options = {}) {
  const amenityKey = options.amenityKey != null ? String(options.amenityKey) : "";
  const maxCap = TOUR_NEARBY_EDITOR_MAX_RESULTS;
  const maxMiles =
    resolveMaxDistanceMetersForCuration(amenityKey, options.searchRadiusMeters) / METERS_PER_MILE;

  const passesRowFilters = (f, lenient) => {
    if (!f || f.geometry?.type !== "Point") return false;
    const p = f.properties || {};
    if (amenityKey && p.amenityKey && String(p.amenityKey) !== amenityKey) return false;
    if (!hasNearbyDisplayName(p)) return false;
    if (amenityKey && !isAllowedNearbyFeatureProperties(p, amenityKey, { lenient })) return false;
    const mi = Number(p.straightLineMiles);
    if (!Number.isFinite(mi) || mi > maxMiles) return false;
    if (p.business_status === "CLOSED_PERMANENTLY") return false;
    return true;
  };

  let filtered = (features || []).filter((f) => passesRowFilters(f, true));
  if (!filtered.length) {
    filtered = (features || []).filter((f) => passesRowFilters(f, false));
  }

  const rated = filtered.filter((f) => hasGoogleRating(f?.properties));
  const unrated = filtered.filter((f) => !hasGoogleRating(f?.properties));
  rated.sort((a, b) => compareByQualityScore(a, b, amenityKey));
  unrated.sort(compareByDistanceThenRating);

  return assignStablePlaceIds([...rated, ...unrated].slice(0, maxCap), amenityKey);
}

module.exports = {
  curateNearbyTourFeatures,
  sortNearbyTourFeaturesForEditor,
  TOUR_NEARBY_MAX_RESULTS,
  distanceSortDivisor,
  maxDistanceMetersForAmenity,
};
