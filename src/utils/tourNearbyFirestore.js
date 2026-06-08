/**
 * Tour nearby POI cache stored on `maps/{mapId}.tourNearbyCache` in Firestore.
 * Keep field names in sync with `functions/tourNearbyCache.js`.
 */

import { TOUR_NEARBY_SEARCH_RADIUS_METERS } from './propertyTourSlides';
import { TOUR_NEARBY_DATA_VERSION } from './tourNearbyRanking';

/** ~0.5 mi — search center drift beyond this invalidates cached amenities. */
const SEARCH_CENTER_MATCH_EPSILON_DEG = 0.008;

export const TOUR_NEARBY_AMENITY_KEYS = [
  'parks_rec',
  'grocery',
  'schools',
  'fitness',
  'trailheads',
  'essentials',
  'coffee',
  'transit',
  'airport',
];

function finiteCoord(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function tourNearbySearchCentersMatch(a, b) {
  const latA = finiteCoord(a?.lat);
  const lngA = finiteCoord(a?.lng);
  const latB = finiteCoord(b?.lat);
  const lngB = finiteCoord(b?.lng);
  if (latA == null || lngA == null || latB == null || lngB == null) return false;
  return (
    Math.abs(latA - latB) <= SEARCH_CENTER_MATCH_EPSILON_DEG &&
    Math.abs(lngA - lngB) <= SEARCH_CENTER_MATCH_EPSILON_DEG
  );
}

export function isTourNearbyFirestoreRootValid(cache, searchCenter) {
  if (!cache || typeof cache !== 'object') return false;
  if (Number(cache.dataVersion) !== TOUR_NEARBY_DATA_VERSION) return false;
  if (Number(cache.searchRadiusMeters) !== TOUR_NEARBY_SEARCH_RADIUS_METERS) return false;
  const cachedCenter = cache.searchCenter;
  if (!cachedCenter || !searchCenter) return false;
  if (!tourNearbySearchCentersMatch(cachedCenter, searchCenter)) return false;
  const byAmenity = cache.byAmenity;
  return Boolean(byAmenity && typeof byAmenity === 'object' && Object.keys(byAmenity).length > 0);
}

function sanitizeFeature(feature) {
  if (!feature || feature.type !== 'Feature') return null;
  const coords = feature.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const raw = feature.properties && typeof feature.properties === 'object' ? feature.properties : {};
  const name = String(raw.name || '').trim();
  if (!name) return null;

  const props = {
    name,
    amenityKey: String(raw.amenityKey || raw.kind || '').trim(),
    place_id: String(raw.place_id || raw.placeId || '').trim(),
    placeId: String(raw.placeId || raw.place_id || '').trim(),
  };
  if (typeof raw.rating === 'number' && Number.isFinite(raw.rating)) props.rating = raw.rating;
  if (typeof raw.user_ratings_total === 'number' && Number.isFinite(raw.user_ratings_total)) {
    props.user_ratings_total = raw.user_ratings_total;
  }
  if (raw.distanceText != null) props.distanceText = String(raw.distanceText);
  if (raw.driveMinutesEst != null) props.driveMinutesEst = String(raw.driveMinutesEst);
  if (typeof raw.straightLineMiles === 'number' && Number.isFinite(raw.straightLineMiles)) {
    props.straightLineMiles = raw.straightLineMiles;
  }
  if (raw.photoUrl != null && String(raw.photoUrl).trim()) props.photoUrl = String(raw.photoUrl).trim();
  if (Array.isArray(raw.googleTypes) && raw.googleTypes.length) {
    props.googleTypes = raw.googleTypes.map((t) => String(t));
  }

  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: props,
  };
}

function sanitizeAmenityCollection(fc) {
  const features = Array.isArray(fc?.features)
    ? fc.features.map(sanitizeFeature).filter(Boolean)
    : [];
  return { type: 'FeatureCollection', features, fetched: true };
}

/** Normalize Firestore `tourNearbyCache` for client state. */
export function normalizeTourNearbyCacheFromFirestore(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const searchCenter = raw.searchCenter;
  const lat = finiteCoord(searchCenter?.lat);
  const lng = finiteCoord(searchCenter?.lng);
  if (lat == null || lng == null) return null;

  const byAmenity = {};
  const src = raw.byAmenity && typeof raw.byAmenity === 'object' ? raw.byAmenity : {};
  for (const key of TOUR_NEARBY_AMENITY_KEYS) {
    if (!src[key]) continue;
    byAmenity[key] = sanitizeAmenityCollection(src[key]);
  }
  if (!Object.keys(byAmenity).length) return null;

  return {
    dataVersion: Number(raw.dataVersion) || 0,
    searchRadiusMeters: Number(raw.searchRadiusMeters) || TOUR_NEARBY_SEARCH_RADIUS_METERS,
    searchCenter: { lat, lng },
    byAmenity,
  };
}

/** Build React `nearbyContextByAmenity` from persisted tour cache. */
export function hydrateNearbyContextByAmenity(tourNearbyCache, searchCenter) {
  const root = normalizeTourNearbyCacheFromFirestore(tourNearbyCache);
  if (!root || !isTourNearbyFirestoreRootValid(root, searchCenter)) return null;

  const out = {};
  for (const [key, fc] of Object.entries(root.byAmenity)) {
    out[key] = {
      type: 'FeatureCollection',
      features: Array.isArray(fc.features) ? fc.features : [],
      searchRadiusMeters: root.searchRadiusMeters,
      dataVersion: root.dataVersion,
      fetched: true,
    };
  }
  return out;
}

/** Package in-memory amenity state for `saveTourNearbyCache`. */
export function buildTourNearbyCacheForSave(searchCenter, nearbyContextByAmenity) {
  const lat = finiteCoord(searchCenter?.lat);
  const lng = finiteCoord(searchCenter?.lng);
  if (lat == null || lng == null) return null;

  const byAmenity = {};
  for (const key of TOUR_NEARBY_AMENITY_KEYS) {
    const entry = nearbyContextByAmenity?.[key];
    if (!entry || entry.fetched !== true) continue;
    byAmenity[key] = sanitizeAmenityCollection(entry);
  }
  if (!Object.keys(byAmenity).length) return null;

  return {
    dataVersion: TOUR_NEARBY_DATA_VERSION,
    searchRadiusMeters: TOUR_NEARBY_SEARCH_RADIUS_METERS,
    searchCenter: { lat, lng },
    byAmenity,
  };
}
