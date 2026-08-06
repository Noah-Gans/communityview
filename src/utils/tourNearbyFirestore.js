/**
 * Tour nearby POI cache stored on `maps/{mapId}.tourNearbyCache` in Firestore.
 * Keep field names in sync with `functions/tourNearbyCache.js`.
 */

import { TOUR_NEARBY_SEARCH_RADIUS_METERS } from './propertyTourSlides';
import { TOUR_NEARBY_DATA_VERSION } from './tourNearbyRanking';
import { normalizeSlidePrintElements } from './tourSlidePrintElements';

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
  'dining',
];

export const AMENITY_MAP_EXTRA_KEYS = [
  'fire_station',
  'police_station',
  'library',
];

const PERSISTED_NEARBY_AMENITY_KEYS = [
  ...TOUR_NEARBY_AMENITY_KEYS,
  ...AMENITY_MAP_EXTRA_KEYS,
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

export function isTourNearbyFirestoreRootValid(cache, searchCenter, expectedRadiusMeters) {
  if (!cache || typeof cache !== 'object') return false;
  if (Number(cache.dataVersion) !== TOUR_NEARBY_DATA_VERSION) return false;
  const expectedRadius = Number(expectedRadiusMeters) || TOUR_NEARBY_SEARCH_RADIUS_METERS;
  if (Number(cache.searchRadiusMeters) !== expectedRadius) return false;
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
  if (raw.formattedAddress != null && String(raw.formattedAddress).trim()) {
    props.formattedAddress = String(raw.formattedAddress).trim();
  }
  if (raw.vicinity != null && String(raw.vicinity).trim()) {
    props.vicinity = String(raw.vicinity).trim();
  }
  if (Array.isArray(raw.googleTypes) && raw.googleTypes.length) {
    props.googleTypes = raw.googleTypes.map((t) => String(t));
  }
  if (raw.tourHidden === true) props.tourHidden = true;
  if (raw.amenityMapHidden === true) props.amenityMapHidden = true;
  if (raw.isCustom === true) props.isCustom = true;

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
  const out = { type: 'FeatureCollection', features, fetched: true };
  if (Number.isFinite(Number(fc?.searchRadiusMeters))) {
    out.searchRadiusMeters = Number(fc.searchRadiusMeters);
  }
  return out;
}

function sanitizeHomeMarker(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const lat = finiteCoord(raw.lat);
  const lng = finiteCoord(raw.lng);
  if (lat == null || lng == null) return null;
  return { lat, lng };
}

function sanitizeAmenityMapBasemap(raw) {
  const id = String(raw || '').trim();
  if (
    id === 'outdoors-v12' ||
    id === 'imagery' ||
    id === 'satellite-streets-v12' ||
    id === 'streets-v11'
  ) {
    return id;
  }
  // Accept common aliases used elsewhere in the app (e.g. satellite → satellite-streets-v12).
  const aliases = {
    discover: 'outdoors-v12',
    outdoors: 'outdoors-v12',
    satellite: 'satellite-streets-v12',
    streets: 'streets-v11',
    'imagery-3d': 'imagery',
  };
  const lower = id.toLowerCase();
  return aliases[lower] || null;
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
  for (const key of PERSISTED_NEARBY_AMENITY_KEYS) {
    if (!src[key]) continue;
    byAmenity[key] = sanitizeAmenityCollection(src[key]);
  }
  const tourSettings =
    raw.tourSettings && typeof raw.tourSettings === 'object' ? raw.tourSettings : null;
  const homeMarker = sanitizeHomeMarker(raw.homeMarker);
  const amenityMapBasemap = sanitizeAmenityMapBasemap(raw.amenityMapBasemap);
  if (!Object.keys(byAmenity).length && !tourSettings && !homeMarker && !amenityMapBasemap) {
    return null;
  }

  const out = {
    dataVersion: Number(raw.dataVersion) || 0,
    searchRadiusMeters: Number(raw.searchRadiusMeters) || TOUR_NEARBY_SEARCH_RADIUS_METERS,
    searchCenter: { lat, lng },
    byAmenity,
    tourSettings,
  };
  if (homeMarker) out.homeMarker = homeMarker;
  if (amenityMapBasemap) out.amenityMapBasemap = amenityMapBasemap;
  return out;
}

/** Build React `nearbyContextByAmenity` from persisted tour cache. */
export function hydrateNearbyContextByAmenity(tourNearbyCache, searchCenter, expectedRadiusMeters) {
  const root = normalizeTourNearbyCacheFromFirestore(tourNearbyCache);
  const expectedRadius = Number(expectedRadiusMeters) || root?.searchRadiusMeters || TOUR_NEARBY_SEARCH_RADIUS_METERS;
  if (!root || !isTourNearbyFirestoreRootValid(root, searchCenter, expectedRadius)) return null;

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

/**
 * Package in-memory amenity state for `saveTourNearbyCache`.
 * @param {{ lat: number, lng: number }|null|undefined} searchCenter
 * @param {Record<string, { fetched?: boolean, features?: unknown[] }>|null|undefined} nearbyContextByAmenity
 * @param {number} searchRadiusMeters
 * @param {string[]} [enabledAmenityKeys] Only these categories are written (edit save).
 * @param {{ replace?: boolean, allowEmpty?: boolean }} [options]
 */
export function buildTourNearbyCacheForSave(
  searchCenter,
  nearbyContextByAmenity,
  searchRadiusMeters,
  enabledAmenityKeys = TOUR_NEARBY_AMENITY_KEYS,
  options = {}
) {
  const lat = finiteCoord(searchCenter?.lat);
  const lng = finiteCoord(searchCenter?.lng);
  if (lat == null || lng == null) return null;

  const radius = Math.min(
    50000,
    Math.max(500, Number(searchRadiusMeters) || TOUR_NEARBY_SEARCH_RADIUS_METERS)
  );

  const planKeys =
    Array.isArray(enabledAmenityKeys) && enabledAmenityKeys.length
      ? enabledAmenityKeys.filter((k) => PERSISTED_NEARBY_AMENITY_KEYS.includes(k))
      : [];
  const cacheKeys = Object.keys(nearbyContextByAmenity || {}).filter(
    (k) =>
      PERSISTED_NEARBY_AMENITY_KEYS.includes(k) && nearbyContextByAmenity[k]?.fetched === true
  );
  const keys = [];
  for (const k of [...planKeys, ...cacheKeys]) {
    if (!keys.includes(k)) keys.push(k);
  }
  if (!keys.length) {
    keys.push(...PERSISTED_NEARBY_AMENITY_KEYS);
  }

  const byAmenity = {};
  for (const key of keys) {
    const entry = nearbyContextByAmenity?.[key];
    if (!entry || entry.fetched !== true) continue;
    byAmenity[key] = sanitizeAmenityCollection(entry);
  }
  if (!Object.keys(byAmenity).length && !options.allowEmpty) return null;

  const payload = {
    dataVersion: TOUR_NEARBY_DATA_VERSION,
    searchRadiusMeters: radius,
    searchCenter: { lat, lng },
    byAmenity,
  };
  const homeMarker = sanitizeHomeMarker(options.homeMarker);
  if (homeMarker) payload.homeMarker = homeMarker;
  const amenityMapBasemap = sanitizeAmenityMapBasemap(options.amenityMapBasemap);
  if (amenityMapBasemap) payload.amenityMapBasemap = amenityMapBasemap;
  if (options.replace) payload.replace = true;
  if (options.tourSettings && typeof options.tourSettings === 'object') {
    const enabledKeys = Array.isArray(options.tourSettings.enabledAmenityKeys)
      ? options.tourSettings.enabledAmenityKeys.filter((k) =>
          PERSISTED_NEARBY_AMENITY_KEYS.includes(k)
        )
      : keys;
    payload.tourSettings = {
      searchRadiusMeters: radius,
      enabledAmenityKeys: enabledKeys.length ? enabledKeys : keys,
    };
    if (options.tourSettings.amenityRadiusMeters) {
      payload.tourSettings.amenityRadiusMeters = { ...options.tourSettings.amenityRadiusMeters };
    }
    const slidePrintElements = normalizeSlidePrintElements(options.tourSettings.slidePrintElements);
    if (Object.keys(slidePrintElements).length) {
      payload.tourSettings.slidePrintElements = slidePrintElements;
    }
    if (Array.isArray(options.tourSettings.slidePlan) && options.tourSettings.slidePlan.length) {
      payload.tourSettings.slidePlan = [...options.tourSettings.slidePlan];
    }
  }
  return payload;
}
