/**
 * Tour nearby POIs via Google Places API (New).
 *
 * Env: `REACT_APP_GOOGLE_MAPS_API_KEY`
 * Enable **Places API (New)** in Google Cloud (legacy "Places API" alone is not enough).
 */

import {
  AMENITIES_WITH_LENIENT_FALLBACK,
  isAllowedGooglePlaceForAmenity,
} from './tourNearbyAmenityFilters';
import { TOUR_NEARBY_SEARCH_RADIUS_METERS } from './propertyTourSlides';
import { fetchTourNearbyPlacesNew } from './tourPlacesApiNew';

/** Place types for Places API (New) `includedTypes` — see Google Place Types (New). */
const AMENITY_PLACE_TYPES = {
  parks_rec: ['park'],
  grocery: ['supermarket', 'grocery_store'],
  schools: ['primary_school', 'secondary_school', 'school'],
  fitness: ['gym'],
  trailheads: ['hiking_area', 'gym'],
  essentials: ['pharmacy', 'drugstore', 'hardware_store', 'bank'],
  coffee: ['cafe', 'coffee_shop'],
  transit: ['subway_station', 'train_station', 'bus_station', 'transit_station'],
  airport: ['airport'],
};

function isRealAirportGoogleResult(place) {
  const types = Array.isArray(place.types) ? place.types : [];
  if (types.includes('heliport')) return false;
  if (types.includes('helistop')) return false;
  const name = String(place.name || '').toLowerCase();
  if (/\bhelipad\b|\bheliport\b|\bhelistop\b/.test(name)) return false;
  return types.includes('airport');
}

/**
 * @param {unknown} r
 * @param {string} amenityKey
 */
function googlePlaceResultToFeature(r, amenityKey) {
  const loc = r.geometry?.location;
  const lat = Number(loc?.lat);
  const lng = Number(loc?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const name = String(r.name || '').trim();
  if (!name) return null;
  if (r.business_status === 'CLOSED_PERMANENTLY') return null;

  const placeId = String(r.place_id || '').trim();
  const props = {
    name,
    amenityKey,
    place_id: placeId,
    placeId,
  };
  if (typeof r.rating === 'number' && Number.isFinite(r.rating)) props.rating = r.rating;
  if (typeof r.user_ratings_total === 'number' && Number.isFinite(r.user_ratings_total)) {
    props.user_ratings_total = r.user_ratings_total;
  }
  if (Array.isArray(r.types) && r.types.length) {
    props.googleTypes = r.types.map((t) => String(t));
  }
  if (r.photoUrl != null && String(r.photoUrl).trim()) {
    props.photoUrl = String(r.photoUrl).trim();
  }
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: props,
  };
}

/**
 * @param {{ lat: number, lng: number, radiusMeters?: number, amenityKey: string, apiKey: string }} params
 */
export async function fetchNearbyTourAmenityGoogleMapsJs(params) {
  const lat = Number(params?.lat);
  const lng = Number(params?.lng);
  const amenityKey = String(params?.amenityKey || '').trim();
  const apiKey = String(params?.apiKey || '').trim();
  const fetchRadiusMeters = Math.min(
    50000,
    Math.max(500, Number(params?.radiusMeters) || TOUR_NEARBY_SEARCH_RADIUS_METERS)
  );

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !amenityKey || !apiKey) {
    return { type: 'FeatureCollection', features: [] };
  }

  const types = AMENITY_PLACE_TYPES[amenityKey];
  if (!Array.isArray(types) || !types.length) {
    return { type: 'FeatureCollection', features: [] };
  }

  const { results: all, apiError } = await fetchTourNearbyPlacesNew(
    lat,
    lng,
    fetchRadiusMeters,
    apiKey,
    types
  );

  const buildFeatures = (lenient) => {
    const seen = new Set();
    const out = [];
    for (const r of all) {
      if (!r.place_id || seen.has(r.place_id)) continue;
      if (amenityKey === 'airport' && !isRealAirportGoogleResult(r)) continue;
      if (!isAllowedGooglePlaceForAmenity(r, amenityKey, r.name, { lenient })) continue;
      seen.add(r.place_id);
      const feature = googlePlaceResultToFeature(r, amenityKey);
      if (feature) out.push(feature);
    }
    return out;
  };

  let features = buildFeatures(false);
  if (!features.length && all.length && AMENITIES_WITH_LENIENT_FALLBACK.has(amenityKey)) {
    features = buildFeatures(true);
  }

  return {
    type: 'FeatureCollection',
    features,
    apiError,
  };
}

/** @deprecated No Maps JS loader needed for Places API (New) REST. */
export function loadGoogleMapsScript() {
  return Promise.resolve();
}
