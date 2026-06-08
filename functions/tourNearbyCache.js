/**
 * Persist tour nearby POIs on maps/{mapId}.tourNearbyCache (Firestore).
 * Keep in sync with `src/utils/tourNearbyFirestore.js`.
 */

const NEARBY_FETCH_RADIUS_METERS = 25000;
const NEARBY_TOUR_DATA_VERSION = 26;
const SEARCH_CENTER_MATCH_EPSILON_DEG = 0.008;

const TOUR_NEARBY_AMENITY_KEYS = [
  "parks_rec",
  "grocery",
  "schools",
  "fitness",
  "trailheads",
  "essentials",
  "coffee",
  "transit",
  "airport",
];

function finiteCoord(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function tourNearbySearchCentersMatch(a, b) {
  const latA = finiteCoord(a && a.lat);
  const lngA = finiteCoord(a && a.lng);
  const latB = finiteCoord(b && b.lat);
  const lngB = finiteCoord(b && b.lng);
  if (latA == null || lngA == null || latB == null || lngB == null) return false;
  return (
    Math.abs(latA - latB) <= SEARCH_CENTER_MATCH_EPSILON_DEG &&
    Math.abs(lngA - lngB) <= SEARCH_CENTER_MATCH_EPSILON_DEG
  );
}

function isRootCacheValid(cache, searchCenter) {
  if (!cache || typeof cache !== "object") return false;
  if (Number(cache.dataVersion) !== NEARBY_TOUR_DATA_VERSION) return false;
  if (Number(cache.searchRadiusMeters) !== NEARBY_FETCH_RADIUS_METERS) return false;
  if (!cache.searchCenter || !searchCenter) return false;
  if (!tourNearbySearchCentersMatch(cache.searchCenter, searchCenter)) return false;
  const byAmenity = cache.byAmenity;
  return Boolean(byAmenity && typeof byAmenity === "object");
}

function sanitizeFeature(feature) {
  if (!feature || feature.type !== "Feature") return null;
  const coords = feature.geometry && feature.geometry.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const raw = feature.properties && typeof feature.properties === "object" ? feature.properties : {};
  const name = String(raw.name || "").trim();
  if (!name) return null;

  const props = {
    name,
    amenityKey: String(raw.amenityKey || raw.kind || "").trim(),
    place_id: String(raw.place_id || raw.placeId || "").trim(),
    placeId: String(raw.placeId || raw.place_id || "").trim(),
  };
  if (typeof raw.rating === "number" && Number.isFinite(raw.rating)) props.rating = raw.rating;
  if (typeof raw.user_ratings_total === "number" && Number.isFinite(raw.user_ratings_total)) {
    props.user_ratings_total = raw.user_ratings_total;
  }
  if (raw.distanceText != null) props.distanceText = String(raw.distanceText);
  if (raw.driveMinutesEst != null) props.driveMinutesEst = String(raw.driveMinutesEst);
  if (typeof raw.straightLineMiles === "number" && Number.isFinite(raw.straightLineMiles)) {
    props.straightLineMiles = raw.straightLineMiles;
  }
  if (raw.photoUrl != null && String(raw.photoUrl).trim()) props.photoUrl = String(raw.photoUrl).trim();
  if (Array.isArray(raw.googleTypes) && raw.googleTypes.length) {
    props.googleTypes = raw.googleTypes.map((t) => String(t));
  }

  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties: props,
  };
}

function sanitizeAmenityCollection(fc) {
  const features = Array.isArray(fc && fc.features)
    ? fc.features.map(sanitizeFeature).filter(Boolean)
    : [];
  return { type: "FeatureCollection", features, fetched: true };
}

function normalizeTourNearbyCache(raw) {
  if (!raw || typeof raw !== "object") return null;
  const lat = finiteCoord(raw.searchCenter && raw.searchCenter.lat);
  const lng = finiteCoord(raw.searchCenter && raw.searchCenter.lng);
  if (lat == null || lng == null) return null;

  const byAmenity = {};
  const src = raw.byAmenity && typeof raw.byAmenity === "object" ? raw.byAmenity : {};
  for (const key of TOUR_NEARBY_AMENITY_KEYS) {
    if (!src[key]) continue;
    byAmenity[key] = sanitizeAmenityCollection(src[key]);
  }

  return {
    dataVersion: Number(raw.dataVersion) || NEARBY_TOUR_DATA_VERSION,
    searchRadiusMeters: Number(raw.searchRadiusMeters) || NEARBY_FETCH_RADIUS_METERS,
    searchCenter: { lat, lng },
    byAmenity,
  };
}

function readAmenityFromTourCache(mapData, amenityKey, searchCenter) {
  const cache = normalizeTourNearbyCache(mapData && mapData.tourNearbyCache);
  if (!cache || !isRootCacheValid(cache, searchCenter)) return null;
  const entry = cache.byAmenity && cache.byAmenity[amenityKey];
  if (!entry || entry.fetched !== true) return null;
  return {
    type: "FeatureCollection",
    features: Array.isArray(entry.features) ? entry.features : [],
    nearbyDataVersion: cache.dataVersion,
    fromTourNearbyCache: true,
  };
}

function mergeTourNearbyCachePayload(existingRaw, incomingRaw) {
  const existing = normalizeTourNearbyCache(existingRaw) || {
    dataVersion: NEARBY_TOUR_DATA_VERSION,
    searchRadiusMeters: NEARBY_FETCH_RADIUS_METERS,
    searchCenter: null,
    byAmenity: {},
  };
  const incoming = normalizeTourNearbyCache(incomingRaw);
  if (!incoming) return null;

  const merged = {
    dataVersion: NEARBY_TOUR_DATA_VERSION,
    searchRadiusMeters: NEARBY_FETCH_RADIUS_METERS,
    searchCenter: incoming.searchCenter || existing.searchCenter,
    byAmenity: { ...existing.byAmenity },
  };

  for (const key of TOUR_NEARBY_AMENITY_KEYS) {
    if (incoming.byAmenity[key]) {
      merged.byAmenity[key] = incoming.byAmenity[key];
    }
  }

  return merged;
}

function buildSingleAmenityCachePayload(searchCenter, amenityKey, featureCollection) {
  const lat = finiteCoord(searchCenter && searchCenter.lat);
  const lng = finiteCoord(searchCenter && searchCenter.lng);
  if (lat == null || lng == null || !amenityKey) return null;

  return {
    dataVersion: NEARBY_TOUR_DATA_VERSION,
    searchRadiusMeters: NEARBY_FETCH_RADIUS_METERS,
    searchCenter: { lat, lng },
    byAmenity: {
      [amenityKey]: sanitizeAmenityCollection(featureCollection),
    },
  };
}

module.exports = {
  NEARBY_TOUR_DATA_VERSION,
  TOUR_NEARBY_AMENITY_KEYS,
  isRootCacheValid,
  tourNearbySearchCentersMatch,
  normalizeTourNearbyCache,
  readAmenityFromTourCache,
  mergeTourNearbyCachePayload,
  buildSingleAmenityCachePayload,
  sanitizeAmenityCollection,
};
