import { mapService } from '../services/mapService';
import { normalizePrintElementsFromFirestore } from './printElementsFirestore';
import { getTourNearbySearchCenter } from './propertyTourSlides';
import { getBoundsFromPrintElements, getBoundsFromViewport } from './sharedMapTourBounds';
import { AMENITY_MAP_CATEGORIES } from './amenityMapCatalog';
import { buildTourNearbyCacheForSave } from './tourNearbyFirestore';
import { TOUR_NEARBY_DATA_VERSION } from './tourNearbyRanking';
import { mapHasTourNearbyData } from './tourSettings';

function milesToMeters(miles) {
  return Math.max(500, Math.round(Number(miles) * 1609.344));
}

function countNamedNearbyFeatures(nearbyContextByAmenity) {
  let count = 0;
  for (const entry of Object.values(nearbyContextByAmenity || {})) {
    const features = Array.isArray(entry?.features) ? entry.features : [];
    count += features.filter((f) => String(f?.properties?.name || '').trim()).length;
  }
  return count;
}

/**
 * Fetch default amenity categories near the property and persist tourNearbyCache
 * so the amenity map viewer has something to show — without building a tour.
 * Reuses an existing listing cache when amenity map / tour / neighborhood already populated it.
 */
export async function autoGenerateAmenityMap({ shareToken, mapData, forceRefresh = false } = {}) {
  const token = String(shareToken || '').trim();
  if (!token) {
    throw new Error('This map has no share token yet. Save the map from the editor first.');
  }

  if (!forceRefresh && mapHasTourNearbyData(mapData?.tourNearbyCache)) {
    return {
      tourNearbyCache: mapData.tourNearbyCache,
      namedFeatureCount: countNamedNearbyFeatures(mapData.tourNearbyCache?.byAmenity),
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

  const amenityKeys = AMENITY_MAP_CATEGORIES.map((c) => c.key);
  const nearbyContextByAmenity = {};
  const fetchErrors = [];
  let maxRadius = 500;

  await Promise.all(
    AMENITY_MAP_CATEGORIES.map(async (category) => {
      const radiusMeters = milesToMeters(category.defaultRadiusMiles);
      maxRadius = Math.max(maxRadius, radiusMeters);
      try {
        const geojson = await mapService.getNearbyGooglePlaces({
          lat: searchCenter.lat,
          lng: searchCenter.lng,
          radiusMeters,
          amenityKey: category.key,
          forceRefresh: true,
          preferBrowser: true,
        });
        const features = Array.isArray(geojson?.features) ? geojson.features : [];
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
      }
    })
  );

  const namedFeatureCount = countNamedNearbyFeatures(nearbyContextByAmenity);
  if (namedFeatureCount === 0) {
    const unique = [...new Set(fetchErrors.map((m) => String(m || '').trim()).filter(Boolean))];
    throw new Error(
      unique[0] || 'Google Places returned no nearby amenities for this property.'
    );
  }

  const payload = buildTourNearbyCacheForSave(
    searchCenter,
    nearbyContextByAmenity,
    maxRadius,
    amenityKeys,
    { allowEmpty: false, homeMarker: searchCenter }
  );

  if (!payload) {
    throw new Error('Could not build amenity map data for save.');
  }

  const saveResult = await mapService.saveTourNearbyCache(
    token,
    payload,
    undefined,
    {
      homeMarker: searchCenter,
    },
    { amenityEditor: true }
  );

  return {
    tourNearbyCache: saveResult?.tourNearbyCache || payload,
    namedFeatureCount,
    fetchErrors,
    reusedExistingCache: false,
  };
}
