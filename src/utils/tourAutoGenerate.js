import { mapService } from '../services/mapService';
import { normalizePrintElementsFromFirestore } from './printElementsFirestore';
import { getTourNearbySearchCenter } from './propertyTourSlides';
import { getBoundsFromPrintElements, getBoundsFromViewport } from './sharedMapTourBounds';
import {
  buildDefaultTourSlidePlan,
  enabledAmenityKeysFromPlan,
} from './tourSlidePlan';
import {
  buildTourNearbyCacheForSave,
  normalizeTourNearbyCacheFromFirestore,
  TOUR_NEARBY_AMENITY_KEYS,
} from './tourNearbyFirestore';
import { TOUR_NEARBY_DATA_VERSION } from './tourNearbyRanking';
import {
  getAmenitySearchRadiusMeters,
  normalizeTourSettings,
} from './tourSettings';

function summarizeFetchErrors(messages) {
  const unique = [...new Set((messages || []).map((m) => String(m || '').trim()).filter(Boolean))];
  if (!unique.length) {
    return 'Google Places returned no nearby amenities for this property.';
  }
  if (unique.length === 1) return unique[0];
  const quotaHit = unique.some((m) => /quota exceeded/i.test(m));
  if (quotaHit) {
    return (
      `${unique[0]} ` +
      'Create tour uses one Nearby Search per amenity category. ' +
      'Add REACT_APP_GOOGLE_MAPS_API_KEY in .env.development to use browser Places quota, or wait for the daily Cloud Function limit to reset.'
    );
  }
  return unique.join(' ');
}

function countNamedNearbyFeatures(nearbyContextByAmenity) {
  let count = 0;
  for (const entry of Object.values(nearbyContextByAmenity || {})) {
    const features = Array.isArray(entry?.features) ? entry.features : [];
    count += features.filter((f) => String(f?.properties?.name || '').trim()).length;
  }
  return count;
}

function amenityEntryHasNamedPlaces(entry) {
  const features = Array.isArray(entry?.features) ? entry.features : [];
  return features.some((f) => String(f?.properties?.name || '').trim());
}

/**
 * Build a default property tour (slide plan + nearby amenities) and persist to Firestore.
 * Used from the share panel so agents get a tour link without opening the editor.
 *
 * @param {{ shareToken: string, mapData: object }} params
 */
export async function autoGeneratePropertyTour({ shareToken, mapData }) {
  const token = String(shareToken || '').trim();
  if (!token) {
    throw new Error('This map has no share token yet. Save the map from the editor first.');
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

  const slidePlan = buildDefaultTourSlidePlan(printElements, TOUR_NEARBY_AMENITY_KEYS);
  const tourSettings = normalizeTourSettings({
    enabledAmenityKeys: enabledAmenityKeysFromPlan(slidePlan),
    slidePlan,
  });

  const existingRoot = normalizeTourNearbyCacheFromFirestore(mapData?.tourNearbyCache);
  const planKeys = enabledAmenityKeysFromPlan(slidePlan);

  let nearbyContextByAmenity = {};

  // Reuse categories already populated (e.g. from amenity map); still fetch tour-only gaps.
  if (existingRoot?.byAmenity) {
    for (const [key, entry] of Object.entries(existingRoot.byAmenity)) {
      nearbyContextByAmenity[key] = {
        type: 'FeatureCollection',
        features: Array.isArray(entry?.features) ? entry.features : [],
        searchRadiusMeters: entry?.searchRadiusMeters || existingRoot.searchRadiusMeters,
        dataVersion: existingRoot.dataVersion || TOUR_NEARBY_DATA_VERSION,
        fetched: true,
      };
    }
  }

  const keysToFetch = planKeys.filter((key) => !amenityEntryHasNamedPlaces(nearbyContextByAmenity[key]));
  const reusedExistingCache = keysToFetch.length < planKeys.length;
  const fetchErrors = [];

  if (keysToFetch.length) {
    // One Nearby Search per missing amenity category. Prefer browser key to spare CF quota.
    await Promise.all(
      keysToFetch.map(async (amenityKey) => {
        const radiusMeters = getAmenitySearchRadiusMeters(tourSettings, amenityKey);
        try {
          const geojson = await mapService.getNearbyGooglePlaces({
            lat: searchCenter.lat,
            lng: searchCenter.lng,
            radiusMeters,
            amenityKey,
            forceRefresh: true,
            preferBrowser: true,
          });
          const features = Array.isArray(geojson?.features) ? geojson.features : [];
          nearbyContextByAmenity[amenityKey] = {
            type: 'FeatureCollection',
            features,
            searchRadiusMeters: radiusMeters,
            dataVersion: TOUR_NEARBY_DATA_VERSION,
            fetched: true,
          };
        } catch (err) {
          fetchErrors.push(
            err?.message ? String(err.message) : `Could not load ${amenityKey.replace(/_/g, ' ')}.`
          );
        }
      })
    );
  }

  const namedFeatureCount = countNamedNearbyFeatures(nearbyContextByAmenity);
  if (namedFeatureCount === 0) {
    throw new Error(summarizeFetchErrors(fetchErrors));
  }

  // Merge save: keep amenity-map-only categories (fire/police/library) already on the listing.
  const payload = buildTourNearbyCacheForSave(
    existingRoot?.searchCenter || searchCenter,
    nearbyContextByAmenity,
    existingRoot?.searchRadiusMeters || tourSettings.searchRadiusMeters,
    planKeys,
    {
      tourSettings,
      allowEmpty: false,
      homeMarker: existingRoot?.homeMarker || searchCenter,
    }
  );

  if (!payload) {
    throw new Error('Could not build tour data for save.');
  }

  const saveResult = await mapService.saveTourNearbyCache(token, payload, tourSettings);

  return {
    tourNearbyCache: saveResult?.tourNearbyCache || payload,
    tourSettings: saveResult?.tourSettings || tourSettings,
    tourSlidePlan: saveResult?.tourSlidePlan || slidePlan,
    namedFeatureCount,
    fetchErrors,
    reusedExistingCache,
  };
}
