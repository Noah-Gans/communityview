import { mapService } from '../services/mapService';
import { normalizePrintElementsFromFirestore } from './printElementsFirestore';
import { getTourNearbySearchCenter } from './propertyTourSlides';
import { getBoundsFromPrintElements, getBoundsFromViewport } from './sharedMapTourBounds';
import {
  AMENITY_MAP_CATEGORIES,
  AMENITY_MAP_CATEGORY_KEYS,
  amenityRadiusMilesToMeters,
} from './amenityMapCatalog';
import { buildTourNearbyCacheForSave, normalizeTourNearbyCacheFromFirestore } from './tourNearbyFirestore';
import { TOUR_NEARBY_DATA_VERSION } from './tourNearbyRanking';
import { amenityMapCategoriesNeedingFetch, mapHasAmenityMapData } from './tourSettings';

const AUTO_SELECT_COUNT = 5;

function countNamedAmenityMapFeatures(byAmenity) {
  let count = 0;
  for (const key of AMENITY_MAP_CATEGORY_KEYS) {
    const features = Array.isArray(byAmenity?.[key]?.features) ? byAmenity[key].features : [];
    count += features.filter((f) => String(f?.properties?.name || '').trim()).length;
  }
  return count;
}

function collectionForSave(entry, radiusMeters) {
  const raw = Array.isArray(entry?.features) ? entry.features : [];
  const amenityCurated = raw.some((f) => f?.properties?.amenityMapHidden === true);
  const features =
    amenityCurated || raw.length <= AUTO_SELECT_COUNT
      ? raw
      : withDefaultAmenityVisibility(raw);
  return {
    type: 'FeatureCollection',
    features,
    searchRadiusMeters: Number(entry?.searchRadiusMeters) || radiusMeters,
    dataVersion: Number(entry?.dataVersion) || TOUR_NEARBY_DATA_VERSION,
    fetched: true,
  };
}

function withDefaultAmenityVisibility(features, autoSelect = AUTO_SELECT_COUNT) {
  return (features || []).map((feature, index) => ({
    ...feature,
    properties: {
      ...(feature?.properties || {}),
      amenityMapHidden: index >= autoSelect,
    },
  }));
}

function pointFrom(lat, lng) {
  const nextLat = Number(lat);
  const nextLng = Number(lng);
  return Number.isFinite(nextLat) && Number.isFinite(nextLng)
    ? { lat: nextLat, lng: nextLng }
    : null;
}

/** Prefer a placed home pin or existing amenity home — never lock searchCenter into settings. */
function resolveAmenityHomeMarker(mapData) {
  const fromSettings = pointFrom(
    mapData?.amenityMapSettings?.homeMarker?.lat,
    mapData?.amenityMapSettings?.homeMarker?.lng
  );
  if (fromSettings) return fromSettings;

  const fromCache = pointFrom(
    mapData?.tourNearbyCache?.homeMarker?.lat,
    mapData?.tourNearbyCache?.homeMarker?.lng
  );
  if (fromCache) return fromCache;

  const printElements = normalizePrintElementsFromFirestore(mapData?.printElements || []);
  const homeEl = printElements.find(
    (candidate) =>
      candidate?.type === 'shape' &&
      candidate?.svgKey === 'houseChimney' &&
      candidate?.geometry?.type === 'Point'
  );
  const coords = homeEl?.geometry?.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    return pointFrom(coords[1], coords[0]);
  }
  return null;
}

/** Fetch the shared amenity set and persist tourNearbyCache without building a tour. */
export async function autoGenerateAmenityMap({ shareToken, mapData, forceRefresh = false } = {}) {
  const token = String(shareToken || '').trim();
  if (!token) {
    throw new Error('This map has no share token yet. Save the map from the editor first.');
  }

  const existingRoot = normalizeTourNearbyCacheFromFirestore(mapData?.tourNearbyCache);
  const existingByAmenity = existingRoot?.byAmenity || {};
  const missingKeys = forceRefresh
    ? AMENITY_MAP_CATEGORY_KEYS
    : amenityMapCategoriesNeedingFetch(mapData?.tourNearbyCache);

  if (!forceRefresh && mapHasAmenityMapData(mapData?.tourNearbyCache) && missingKeys.length === 0) {
    return {
      tourNearbyCache: mapData.tourNearbyCache,
      namedFeatureCount: countNamedAmenityMapFeatures(existingByAmenity),
      fetchErrors: [],
      reusedExistingCache: true,
    };
  }

  const printElements = normalizePrintElementsFromFirestore(mapData?.printElements || []);
  const savedViewport = mapData?.viewport || null;
  const tourBounds = getBoundsFromPrintElements(printElements) || getBoundsFromViewport(savedViewport);
  const searchCenter = getTourNearbySearchCenter(printElements, tourBounds, savedViewport);
  if (!searchCenter) {
    throw new Error(
      'Could not determine a property location for nearby places. Add a parcel boundary or save the map viewport.'
    );
  }

  const homeMarker = resolveAmenityHomeMarker(mapData);
  const nearbyContextByAmenity = {};
  const fetchErrors = [];
  let maxRadius = 500;
  const missingSet = new Set(missingKeys);

  AMENITY_MAP_CATEGORIES.forEach((category) => {
    const radiusMeters = amenityRadiusMilesToMeters(category.defaultRadiusMiles);
    maxRadius = Math.max(maxRadius, radiusMeters);
    if (!forceRefresh && !missingSet.has(category.key) && existingByAmenity[category.key]) {
      nearbyContextByAmenity[category.key] = collectionForSave(
        existingByAmenity[category.key],
        radiusMeters
      );
    }
  });

  const categoriesToFetch = AMENITY_MAP_CATEGORIES.filter(
    (category) => forceRefresh || missingSet.has(category.key)
  );

  await Promise.all(
    categoriesToFetch.map(async (category) => {
      const radiusMeters = amenityRadiusMilesToMeters(category.defaultRadiusMiles);
      try {
        const geojson = await mapService.getNearbyGooglePlaces({
          lat: searchCenter.lat,
          lng: searchCenter.lng,
          radiusMeters,
          amenityKey: category.key,
          shareToken: token,
          forceRefresh: true,
          preferBrowser: true,
        });
        const features = withDefaultAmenityVisibility(
          Array.isArray(geojson?.features) ? geojson.features : []
        );
        if (!features.some((f) => String(f?.properties?.name || '').trim())) {
          return;
        }
        nearbyContextByAmenity[category.key] = {
          type: 'FeatureCollection',
          features,
          searchRadiusMeters: radiusMeters,
          dataVersion: TOUR_NEARBY_DATA_VERSION,
          fetched: true,
        };
      } catch (err) {
        fetchErrors.push(
          err?.message ? String(err.message) : `Could not load ${category.label}.`
        );
        const prior = existingByAmenity[category.key];
        if (Array.isArray(prior?.features) && prior.features.some((f) => String(f?.properties?.name || '').trim())) {
          nearbyContextByAmenity[category.key] = collectionForSave(prior, radiusMeters);
        }
      }
    })
  );

  const namedFeatureCount = countNamedAmenityMapFeatures(nearbyContextByAmenity);
  if (namedFeatureCount === 0) {
    const unique = [...new Set(fetchErrors.map((m) => String(m || '').trim()).filter(Boolean))];
    throw new Error(unique[0] || 'Google Places returned no nearby amenities for this property.');
  }

  const payload = buildTourNearbyCacheForSave(
    searchCenter,
    nearbyContextByAmenity,
    maxRadius,
    AMENITY_MAP_CATEGORY_KEYS,
    {
      allowEmpty: false,
      ...(homeMarker ? { homeMarker } : {}),
    }
  );

  if (!payload) {
    throw new Error('Could not build amenity map data for save.');
  }

  const saveResult = await mapService.saveTourNearbyCache(
    token,
    payload,
    undefined,
    undefined,
    { amenityEditor: true }
  );

  return {
    tourNearbyCache: saveResult?.tourNearbyCache || payload,
    namedFeatureCount,
    fetchErrors,
    reusedExistingCache: categoriesToFetch.length < AMENITY_MAP_CATEGORIES.length,
  };
}

const shareCreateJobs = new Map();

export function isShareCreateInFlight(key) {
  return shareCreateJobs.has(String(key || '').trim());
}

/** Dedupes Create Immediately generate if React remounts or the user double-clicks. */
export function runShareCreateOnce(key, factory) {
  const id = String(key || '').trim();
  if (!id) return Promise.resolve().then(factory);
  const existing = shareCreateJobs.get(id);
  if (existing) return existing;
  const job = Promise.resolve()
    .then(factory)
    .finally(() => {
      if (shareCreateJobs.get(id) === job) shareCreateJobs.delete(id);
    });
  shareCreateJobs.set(id, job);
  return job;
}
