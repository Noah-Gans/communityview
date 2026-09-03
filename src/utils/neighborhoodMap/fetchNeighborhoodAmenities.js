/**
 * Fetch neighborhood amenities via the same Places path as tours.
 * Then Gemini curates a rational 12–18 for the map (heuristic fallback).
 */
import { mapService } from '../../services/mapService';
import {
  normalizeTourNearbyCacheFromFirestore,
  TOUR_NEARBY_AMENITY_KEYS,
} from '../tourNearbyFirestore';
import { TOUR_NEARBY_DATA_VERSION } from '../tourNearbyRanking';
import { TOUR_NEARBY_SEARCH_RADIUS_METERS } from '../propertyTourSlides';
import {
  byAmenityVisibleForAmenityMap,
  getAmenitySearchRadiusMeters,
  mapHasTourNearbyData,
  normalizeTourSettings,
} from '../tourSettings';
import { curateNeighborhoodAmenitiesWithAi } from '../../services/neighborhoodAmenityCurateService';
import {
  amenityGridCellKey,
  NEIGHBORHOOD_AMENITY_KEYS,
  selectNeighborhoodAmenities,
  selectedAmenitiesFromVisibleByAmenity,
  buildNeighborhoodCandidatePool,
  applyCuratedNeighborhoodIds,
} from './neighborhoodAmenities';

const SESSION_KEY = 'cv_neighborhood_amenities_v4';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

function readSession(cell) {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const store = JSON.parse(raw);
    const entry = store?.[cell];
    if (!entry || Number(entry.dataVersion) !== TOUR_NEARBY_DATA_VERSION) return null;
    if (Date.now() - Number(entry.savedAt || 0) > SESSION_TTL_MS) return null;
    return entry.payload || null;
  } catch (_) {
    return null;
  }
}

function writeSession(cell, payload) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const store = raw ? JSON.parse(raw) : {};
    const next = store && typeof store === 'object' ? store : {};
    next[cell] = {
      savedAt: Date.now(),
      dataVersion: TOUR_NEARBY_DATA_VERSION,
      payload,
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
  } catch (_) {
    /* ignore */
  }
}

async function curateSelected(byAmenity, { address, placeLabel, onStatus } = {}) {
  const report = typeof onStatus === 'function' ? onStatus : () => {};
  const candidates = buildNeighborhoodCandidatePool(byAmenity);
  if (!candidates.length) return { selected: [], curationSource: 'empty' };

  report(`AI curating amenities (${candidates.length} candidates)…`);
  const ai = await curateNeighborhoodAmenitiesWithAi({
    address,
    placeLabel,
    candidates,
  });

  if (ai.placeIds?.length) {
    const selected = applyCuratedNeighborhoodIds(candidates, ai.placeIds);
    if (selected.length) {
      report(
        `AI picked ${selected.length} amenities${ai.notes ? ` — ${ai.notes}` : ''}`
      );
      return { selected, curationSource: ai.source || 'gemini', curationNotes: ai.notes };
    }
  }

  report('Using heuristic amenity selection…');
  return {
    selected: selectNeighborhoodAmenities(byAmenity),
    curationSource: 'heuristic',
    curationNotes: ai.notes || '',
  };
}

/**
 * @param {{ lat: number, lng: number }} center
 * @param {{
 *   onStatus?: Function,
 *   forceRefresh?: boolean,
 *   amenityKeys?: string[],
 *   radiusMeters?: number,
 *   address?: string,
 *   placeLabel?: string,
 *   existingTourNearbyCache?: object|null,
 * }} [options]
 */
export async function fetchNeighborhoodAmenities(center, options = {}) {
  const lat = Number(center?.lat);
  const lng = Number(center?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return {
      searchCenter: null,
      byAmenity: {},
      selected: [],
      fromCache: false,
      gridCell: null,
      fetchErrors: ['Missing search center'],
    };
  }

  const cell = amenityGridCellKey(lat, lng);

  // Listing source of truth: amenity map / tour / neighborhood share one Firestore cache.
  // The PDF always follows amenity-map visibility (not tour hide / removed slides).
  if (!options.forceRefresh && mapHasTourNearbyData(options.existingTourNearbyCache)) {
    const root = normalizeTourNearbyCacheFromFirestore(options.existingTourNearbyCache);
    const visible = byAmenityVisibleForAmenityMap(root.byAmenity);
    const report = typeof options.onStatus === 'function' ? options.onStatus : () => {};
    report('Using amenity map places…');
    const selected = selectedAmenitiesFromVisibleByAmenity(visible);
    return {
      searchCenter: root.searchCenter || { lat, lng },
      byAmenity: root.byAmenity,
      selected,
      curationSource: 'amenity_map',
      curationNotes: '',
      fetchErrors: [],
      searchRadiusMeters: root.searchRadiusMeters,
      dataVersion: root.dataVersion || TOUR_NEARBY_DATA_VERSION,
      fromCache: true,
      fromListingCache: true,
      gridCell: cell,
    };
  }

  if (!options.forceRefresh) {
    const cached = readSession(cell);
    if (cached?.byAmenity && Array.isArray(cached.selected) && cached.selected.length) {
      return {
        ...cached,
        fromCache: true,
        gridCell: cell,
      };
    }
    if (cached?.byAmenity) {
      const curated = await curateSelected(cached.byAmenity, options);
      const payload = {
        ...cached,
        selected: curated.selected,
        curationSource: curated.curationSource,
        curationNotes: curated.curationNotes,
      };
      writeSession(cell, payload);
      return { ...payload, fromCache: true, gridCell: cell };
    }
  }

  const amenityKeys = (
    Array.isArray(options.amenityKeys) && options.amenityKeys.length
      ? options.amenityKeys
      : NEIGHBORHOOD_AMENITY_KEYS
  ).filter(Boolean);

  const tourSettings = normalizeTourSettings({
    searchRadiusMeters: Number(options.radiusMeters) || TOUR_NEARBY_SEARCH_RADIUS_METERS,
    enabledAmenityKeys: amenityKeys.filter((k) => TOUR_NEARBY_AMENITY_KEYS.includes(k)),
  });

  const report = typeof options.onStatus === 'function' ? options.onStatus : () => {};
  report(
    `Finding neighborhood amenities (${amenityKeys.length} Places searches)…`
  );

  const byAmenity = {};
  const fetchErrors = [];

  await Promise.all(
    amenityKeys.map(async (amenityKey) => {
      const radiusMeters =
        amenityKey === 'dining'
          ? Math.min(50000, Number(options.radiusMeters) || 8000)
          : getAmenitySearchRadiusMeters(tourSettings, amenityKey);
      try {
        const geojson = await mapService.getNearbyGooglePlaces({
          lat,
          lng,
          radiusMeters,
          amenityKey,
          forceRefresh: options.forceRefresh === true,
          preferBrowser: true,
          gridCache: true,
        });
        byAmenity[amenityKey] = {
          type: 'FeatureCollection',
          features: Array.isArray(geojson?.features) ? geojson.features : [],
          searchRadiusMeters: radiusMeters,
          dataVersion: TOUR_NEARBY_DATA_VERSION,
          fetched: true,
        };
      } catch (err) {
        fetchErrors.push(err?.message ? String(err.message) : `Failed ${amenityKey}`);
        byAmenity[amenityKey] = {
          type: 'FeatureCollection',
          features: [],
          searchRadiusMeters: radiusMeters,
          dataVersion: TOUR_NEARBY_DATA_VERSION,
          fetched: true,
        };
      }
    })
  );

  const curated = await curateSelected(byAmenity, options);
  const payload = {
    searchCenter: { lat, lng },
    byAmenity,
    selected: curated.selected,
    curationSource: curated.curationSource,
    curationNotes: curated.curationNotes,
    fetchErrors,
    searchRadiusMeters: tourSettings.searchRadiusMeters,
    dataVersion: TOUR_NEARBY_DATA_VERSION,
  };
  writeSession(cell, payload);
  return { ...payload, fromCache: false, gridCell: cell };
}
