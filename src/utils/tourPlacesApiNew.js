/**
 * Google Places API (New) for tour nearby slides (browser).
 * One Nearby Search request per amenity category (wide radius, distance-ranked).
 */

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.location',
  'places.types',
  'places.primaryType',
  'places.rating',
  'places.userRatingCount',
  'places.businessStatus',
  'places.photos',
].join(',');

function placeIdFromNewPlace(place) {
  if (place?.id) return String(place.id);
  const name = String(place?.name || '');
  if (name.startsWith('places/')) return name.slice('places/'.length);
  return name;
}

function buildPlacePhotoMediaUrl(place, apiKey) {
  const photos = place?.photos;
  if (!apiKey || !Array.isArray(photos) || !photos.length) return '';
  const photoName = String(photos[0]?.name || '').trim();
  if (!photoName) return '';
  return (
    `https://places.googleapis.com/v1/${photoName}/media` +
    `?maxHeightPx=400&maxWidthPx=560&key=${encodeURIComponent(apiKey)}`
  );
}

function normalizeNewPlaceToLegacy(place, apiKey = '') {
  const placeId = placeIdFromNewPlace(place);
  const lat = Number(place?.location?.latitude);
  const lng = Number(place?.location?.longitude);
  const displayName = String(place?.displayName?.text || '').trim();
  const types = Array.isArray(place?.types) ? place.types.map((t) => String(t)) : [];
  const primary = place?.primaryType ? String(place.primaryType) : '';
  if (primary && !types.includes(primary)) types.push(primary);

  let businessStatus;
  const bs = String(place?.businessStatus || '').toUpperCase();
  if (bs === 'CLOSED_PERMANENTLY') businessStatus = 'CLOSED_PERMANENTLY';

  const out = {
    place_id: placeId,
    name: displayName,
    types,
    geometry: {
      location: { lat, lng },
    },
  };
  if (typeof place?.rating === 'number' && Number.isFinite(place.rating)) {
    out.rating = place.rating;
  }
  if (typeof place?.userRatingCount === 'number' && Number.isFinite(place.userRatingCount)) {
    out.user_ratings_total = place.userRatingCount;
  }
  if (businessStatus) out.business_status = businessStatus;
  const photoUrl = buildPlacePhotoMediaUrl(place, apiKey);
  if (photoUrl) out.photoUrl = photoUrl;
  return out;
}

function parsePlacesError(json, status) {
  const msg =
    json?.error?.message ||
    json?.error?.status ||
    (Array.isArray(json?.error?.details) && json.error.details[0]?.message) ||
    `HTTP ${status}`;
  return String(msg);
}

/**
 * Single Nearby Search (New) — one billable request per call.
 * @param {number} lat
 * @param {number} lng
 * @param {number} radiusMeters
 * @param {string} apiKey
 * @param {string[]} includedTypes
 * @param {{ rankPreference?: string }} [options]
 */
async function searchNearbyNew(lat, lng, radiusMeters, apiKey, includedTypes, options = {}) {
  const types = (includedTypes || []).filter(Boolean);
  if (!types.length) return { results: [], apiError: '' };

  const body = {
    includedTypes: types,
    maxResultCount: 20,
    rankPreference: options.rankPreference || 'DISTANCE',
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: Math.min(50000, Math.max(1, radiusMeters)),
      },
    },
  };

  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) {
    return { results: [], apiError: parsePlacesError(json, res.status) };
  }

  const places = Array.isArray(json?.places) ? json.places : [];
  return {
    results: places
      .map((p) => normalizeNewPlaceToLegacy(p, apiKey))
      .filter((p) => p.place_id && p.name),
    apiError: '',
  };
}

function mergePlacesById(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const place of list) {
      const id = String(place?.place_id || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(place);
    }
  }
  return out;
}

/**
 * Text Search (New) — finds named businesses (e.g. town grocery) that Nearby Search can miss.
 */
async function searchTextNew(lat, lng, radiusMeters, apiKey, textQuery) {
  const query = String(textQuery || '').trim();
  if (!query) return [];

  const body = {
    textQuery: query,
    maxResultCount: 20,
    locationBias: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: Math.min(50000, Math.max(500, radiusMeters)),
      },
    },
  };

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) return [];

  const places = Array.isArray(json?.places) ? json.places : [];
  return places
    .map((p) => normalizeNewPlaceToLegacy(p, apiKey))
    .filter((p) => p.place_id && p.name);
}

const GROCERY_NEARBY_TYPES = ['supermarket', 'grocery_store', 'food_store'];

/**
 * Grocery: one Nearby Search (same as other amenity categories).
 */
export async function fetchTourGroceryPlacesNew(lat, lng, radiusMeters, apiKey) {
  return searchNearbyNew(lat, lng, radiusMeters, apiKey, GROCERY_NEARBY_TYPES, {
    rankPreference: 'DISTANCE',
  });
}

/**
 * Tour nearby: exactly one Nearby Search per amenity (all types in one request).
 * @param {string[]} includedTypes
 */
export async function fetchTourNearbyPlacesNew(lat, lng, radiusMeters, apiKey, includedTypes) {
  return searchNearbyNew(lat, lng, radiusMeters, apiKey, includedTypes, {
    rankPreference: 'DISTANCE',
  });
}
